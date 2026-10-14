-- 0099 · Ensayos: equipo de producción citado, encargados que abren y pasan lista (Diego 2026-10-14).
--
-- * Además del elenco, a un ensayo se cita al equipo de producción (staff, crew, maestros…): por persona
--   o "todo el equipo". Se les toma asistencia igual (y aplican las advertencias automáticas).
-- * Encargados del ensayo: el primero que llega lo abre (el mismo día, desde 1 h antes) y queda presente;
--   los demás encargados se habilitan cuando alguien ya activo los escanea. Pasan lista con QR o a mano,
--   solo ese día y hasta cerrar la lista. "Cerrar lista" marca falta a los citados sin registro.
-- * Producción, dirección y maestros (roles de categoría produccion/direccion) SIEMPRE pueden ver y editar
--   ensayos y asistencia de su obra, aunque se le quite el permiso al rol: varios maestros pueden pasar
--   lista a la vez (cada quien a su grupo) y todo queda en la misma lista.

-- ════════ Columnas ════════
alter table rehearsals
  add column if not exists equipo uuid[] not null default '{}',
  add column if not exists equipo_todos boolean not null default false,
  add column if not exists encargados uuid[] not null default '{}',
  add column if not exists abierto_at timestamptz,
  add column if not exists abierto_por uuid references auth.users(id) on delete set null,
  add column if not exists cerrado_at timestamptz,
  add column if not exists cerrado_por uuid references auth.users(id) on delete set null;

-- Convocatoria "ninguno": ensayo solo para el equipo (sin elenco); entonces debe haber equipo citado.
alter table rehearsals drop constraint if exists rehearsals_convocatoria_check;
alter table rehearsals add constraint rehearsals_convocatoria_check check (convocatoria in ('todos', 'grupos', 'personas', 'ninguno'));
alter table rehearsals drop constraint if exists rehearsals_solo_equipo_check;
alter table rehearsals add constraint rehearsals_solo_equipo_check check (convocatoria <> 'ninguno' or equipo_todos or cardinality(equipo) > 0);

-- ════════ Producción, dirección y maestros: siempre ensayos.gestionar ════════
create or replace function lider_ensayos(pid text, uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from production_members m join panel_roles pr on pr.id = m.role_id
                  where m.production_id = pid and m.user_id = uid and pr.categoria in ('produccion', 'direccion'))
$$;

create or replace function has_perm(pid text, perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    exists (select 1 from profiles where id = auth.uid() and rol = 'admin')
    or exists (
      select 1 from production_members m
      join role_permissions rp on rp.role_id = m.role_id
      where m.user_id = auth.uid() and m.production_id = pid and rp.permission_id = perm
    )
    or (perm in ('obra.ver', 'ventas.ver', 'puerta.validar')
        and exists (select 1 from profiles where id = auth.uid() and rol = 'staff'))
    or (perm = 'ensayos.gestionar' and lider_ensayos(pid, auth.uid()))
  )
$$;

create or replace function my_panel_access()
returns table (production_id text, permission_id text)
language sql stable security definer set search_path = public as $$
  select m.production_id, rp.permission_id
    from production_members m join role_permissions rp on rp.role_id = m.role_id
   where m.user_id = auth.uid()
  union
  select p.id, x.perm
    from productions p
    cross join unnest(array['obra.ver', 'ventas.ver', 'puerta.validar']) as x(perm)
   where exists (select 1 from profiles where id = auth.uid() and rol = 'staff')
  union
  select p.id, pe.id
    from productions p cross join permissions pe
   where exists (select 1 from profiles where id = auth.uid() and rol = 'admin')
  union
  -- Producción, dirección y maestros: ensayos y asistencia siempre (y ver la obra para entrar al panel).
  select m.production_id, x.perm
    from production_members m join panel_roles pr on pr.id = m.role_id
    cross join unnest(array['ensayos.gestionar', 'obra.ver']) as x(perm)
   where m.user_id = auth.uid() and pr.categoria in ('produccion', 'direccion')
$$;

-- ════════ Quién está citado ════════
-- Equipo = miembro de la obra con un rol que no es "integrante" (staff, crew, maestro…).
create or replace function es_equipo(pid text, uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from production_members m where m.production_id = pid and m.user_id = uid and m.role_id <> 'integrante')
$$;

-- Citado = integrante dentro de su periodo y en la convocatoria (0044), o equipo citado (por persona o
-- todo el equipo), o encargado del ensayo (los encargados siempre van).
create or replace function rehearsal_cites(rid uuid, uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from rehearsals r
     where r.id = rid and (
       exists (
         select 1 from production_members m
           left join member_enrollment e on e.production_id = r.production_id and e.user_id = uid
          where m.production_id = r.production_id and m.user_id = uid and m.role_id = 'integrante'
            and (e.user_id is null or (
                  e.ingreso <= (r.inicia at time zone 'America/Mexico_City')::date
                  and (e.baja_at is null or (r.inicia at time zone 'America/Mexico_City')::date < e.baja_at)))
            and (
              r.convocatoria = 'todos'
              or (r.convocatoria = 'grupos' and r.grupos && member_groups(r.production_id, uid))
              or (r.convocatoria = 'personas' and uid = any(r.personas))))
       or ((r.equipo_todos or uid = any(r.equipo)) and es_equipo(r.production_id, uid))
       or (uid = any(r.encargados) and exists (select 1 from production_members m where m.production_id = r.production_id and m.user_id = uid))))
$$;

-- Avisos del ensayo (0092): también al equipo citado y a los encargados.
create or replace function _citados(r rehearsals) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct x.uid), '{}') from (
    select m.user_id as uid
      from production_members m
     where m.production_id = r.production_id and m.role_id = 'integrante'
       and is_active_member(r.production_id, m.user_id)
       and (r.convocatoria = 'todos'
            or (r.convocatoria = 'grupos' and r.grupos && member_groups(r.production_id, m.user_id))
            or (r.convocatoria = 'personas' and m.user_id = any(r.personas)))
    union
    select m.user_id from production_members m
     where m.production_id = r.production_id and m.role_id <> 'integrante'
       and (r.equipo_todos or m.user_id = any(r.equipo))
    union
    select m.user_id from production_members m
     where m.production_id = r.production_id and m.user_id = any(r.encargados)) x
$$;

-- ════════ Quién pasa lista ════════
-- Encargado activo: el ensayo está abierto, sin cerrar, es ese día, y él lo abrió o ya lo registraron.
create or replace function encargado_activo(rid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from rehearsals r
     where r.id = rid and auth.uid() = any(r.encargados) and r.estado = 'programado'
       and r.abierto_at is not null and r.cerrado_at is null
       and (now() at time zone 'America/Mexico_City')::date = (r.inicia at time zone 'America/Mexico_City')::date
       and (r.abierto_por = auth.uid() or exists (
             select 1 from rehearsal_attendance a where a.rehearsal_id = rid and a.user_id = auth.uid() and a.estado in ('presente', 'retardo'))))
$$;

create or replace function puede_pasar_lista(rid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select has_perm(rehearsal_production(rid), 'ensayos.gestionar') or encargado_activo(rid)
$$;

-- Fotos del gafete: el encargado activo ve la foto de quien escanea (para confirmar que es la persona).
create or replace function can_see_avatar(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    uid = auth.uid() or is_admin()
    or exists (select 1 from production_members m where m.user_id = uid and has_perm(m.production_id, 'obra.ver'))
    or exists (select 1 from rehearsals r
                where auth.uid() = any(r.encargados) and r.abierto_at is not null and r.cerrado_at is null
                  and (now() at time zone 'America/Mexico_City')::date = (r.inicia at time zone 'America/Mexico_City')::date
                  and encargado_activo(r.id) and rehearsal_cites(r.id, uid)))
$$;

-- Estado del registro de una persona (presente o retardo según la tolerancia de la obra).
create or replace function _llegada(r rehearsals, uid uuid, p_nota text) returns text
language plpgsql security definer set search_path = public as $$
declare tol int; tarde int; est text;
begin
  select coalesce((select tolerancia_min from production_discipline where production_id = r.production_id), 10) into tol;
  tarde := floor(extract(epoch from (now() - r.inicia)) / 60)::int;
  est := case when tarde > tol then 'retardo' else 'presente' end;
  insert into rehearsal_attendance (rehearsal_id, user_id, estado, minutos_tarde, nota, marcado_por, marcado_at, llegada_at)
  values (r.id, uid, est, case when est = 'retardo' then least(tarde, 600) end, p_nota, auth.uid(), now(), now())
  on conflict (rehearsal_id, user_id) do update
    set estado = excluded.estado, minutos_tarde = excluded.minutos_tarde, nota = excluded.nota,
        marcado_por = excluded.marcado_por, marcado_at = excluded.marcado_at, llegada_at = excluded.llegada_at;
  return est;
end $$;
revoke execute on function _llegada(rehearsals, uuid, text) from public, anon, authenticated;

-- ════════ Abrir y cerrar ════════
-- Abrir: un encargado (o quien lleva los ensayos), el mismo día y desde 1 h antes. Quien abre queda presente.
create or replace function ensayo_abrir(rid uuid) returns json
language plpgsql security definer set search_path = public as $$
declare r rehearsals; lider boolean; est text; hoy date := (now() at time zone 'America/Mexico_City')::date;
begin
  select * into r from rehearsals where id = rid for update;
  if not found then raise exception 'Ese ensayo no existe.'; end if;
  lider := has_perm(r.production_id, 'ensayos.gestionar');
  if not lider and not (auth.uid() = any(r.encargados)) then raise exception 'No eres encargado de este ensayo.'; end if;
  if r.estado = 'cancelado' then raise exception 'Este ensayo está cancelado.'; end if;
  if r.cerrado_at is not null then raise exception 'La lista de este ensayo ya se cerró.'; end if;
  if not lider and ((r.inicia at time zone 'America/Mexico_City')::date <> hoy or now() < r.inicia - interval '1 hour') then
    raise exception 'El ensayo se puede abrir el mismo día, desde una hora antes.';
  end if;
  if r.abierto_at is null then
    update rehearsals set abierto_at = now(), abierto_por = auth.uid() where id = rid returning * into r;
  elsif not lider and r.abierto_por <> auth.uid() and not encargado_activo(rid) then
    return json_build_object('resultado', 'ya_abierto', 'abierto_at', r.abierto_at);
  end if;
  -- Quien abre queda registrado (si no lo estaba).
  if rehearsal_cites(rid, auth.uid()) and not exists (
       select 1 from rehearsal_attendance a where a.rehearsal_id = rid and a.user_id = auth.uid() and a.estado in ('presente', 'retardo')) then
    est := _llegada(r, auth.uid(), 'Abrió el ensayo');
  end if;
  return json_build_object('resultado', 'abierto', 'abierto_at', r.abierto_at, 'estado', est);
end $$;

-- Cerrar lista: los citados sin registro quedan como falta (se justifican después con su solicitud).
create or replace function ensayo_cerrar(rid uuid) returns json
language plpgsql security definer set search_path = public as $$
declare r rehearsals; n int;
begin
  select * into r from rehearsals where id = rid for update;
  if not found then raise exception 'Ese ensayo no existe.'; end if;
  if not puede_pasar_lista(rid) then raise exception 'No puedes cerrar la lista de este ensayo.'; end if;
  if r.estado = 'cancelado' then raise exception 'Este ensayo está cancelado.'; end if;
  if r.cerrado_at is not null then raise exception 'La lista ya estaba cerrada.'; end if;
  if now() < r.inicia then raise exception 'La lista se cierra cuando ya empezó el ensayo.'; end if;
  insert into rehearsal_attendance (rehearsal_id, user_id, estado, nota, marcado_por, marcado_at)
  select rid, x.user_id, 'falta', 'Sin registro al cerrar lista', auth.uid(), now()
    from (select distinct m.user_id from production_members m where m.production_id = r.production_id) x
   where rehearsal_cites(rid, x.user_id)
     and not exists (select 1 from rehearsal_attendance a where a.rehearsal_id = rid and a.user_id = x.user_id)
  on conflict (rehearsal_id, user_id) do nothing;
  get diagnostics n = row_count;
  update rehearsals set cerrado_at = now(), cerrado_por = auth.uid(),
         abierto_at = coalesce(abierto_at, now()), abierto_por = coalesce(abierto_por, auth.uid())
   where id = rid;
  return json_build_object('faltas', n);
end $$;

-- Reabrir (solo quien lleva los ensayos): por si se cerró antes de tiempo.
create or replace function ensayo_reabrir(rid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_perm(rehearsal_production(rid), 'ensayos.gestionar') then raise exception 'No autorizado'; end if;
  update rehearsals set cerrado_at = null, cerrado_por = null where id = rid;
end $$;

-- ════════ Marcar ════════
-- A mano (presente, retardo con minutos, falta, justificada). Queda quién marcó y cuándo.
create or replace function ensayo_marcar(rid uuid, uid uuid, p_estado text, p_minutos int default null) returns void
language plpgsql security definer set search_path = public as $$
declare r rehearsals;
begin
  select * into r from rehearsals where id = rid;
  if not found then raise exception 'Ese ensayo no existe.'; end if;
  if not puede_pasar_lista(rid) then raise exception 'No puedes pasar lista en este ensayo.'; end if;
  if r.estado = 'cancelado' then raise exception 'Este ensayo está cancelado.'; end if;
  if p_estado not in ('presente', 'retardo', 'falta', 'justificada') then raise exception 'Estado no válido.'; end if;
  if not rehearsal_cites(rid, uid) then raise exception 'Esa persona no está citada a este ensayo.'; end if;
  insert into rehearsal_attendance (rehearsal_id, user_id, estado, minutos_tarde, marcado_por, marcado_at, llegada_at)
  values (rid, uid, p_estado, case when p_estado = 'retardo' then least(greatest(coalesce(p_minutos, 1), 1), 600) end,
          auth.uid(), now(), case when p_estado in ('presente', 'retardo') then now() end)
  on conflict (rehearsal_id, user_id) do update
    set estado = excluded.estado, minutos_tarde = excluded.minutos_tarde, nota = null,
        marcado_por = excluded.marcado_por, marcado_at = excluded.marcado_at,
        llegada_at = case when excluded.estado in ('presente', 'retardo')
                          then coalesce(rehearsal_attendance.llegada_at, excluded.llegada_at) end;
end $$;

-- Con la credencial (0083): ahora también los encargados activos.
create or replace function rehearsal_checkin(rid uuid, p_code text) returns json
language plpgsql security definer set search_path = public as $$
declare r rehearsals; uid uuid; previo rehearsal_attendance; est text; nombre text; foto text;
begin
  select * into r from rehearsals where id = rid;
  if not found then raise exception 'Ese ensayo no existe.'; end if;
  if not puede_pasar_lista(rid) then raise exception 'No tienes permiso para tomar asistencia en este ensayo.'; end if;
  if r.estado = 'cancelado' then raise exception 'Este ensayo está cancelado.'; end if;
  uid := credencial_resolver(p_code);
  if uid is null then return json_build_object('resultado', 'no_encontrado'); end if;
  select coalesce(p.nombre, ''), p.foto_path into nombre, foto from profiles p where p.id = uid;
  if not rehearsal_cites(rid, uid) then
    return json_build_object('resultado', 'no_citado', 'user_id', uid, 'nombre', nombre, 'foto_path', foto);
  end if;
  select * into previo from rehearsal_attendance where rehearsal_id = rid and user_id = uid;
  if found and previo.estado in ('presente', 'retardo') then
    return json_build_object('resultado', 'ya', 'user_id', uid, 'nombre', nombre, 'foto_path', foto,
                             'estado', previo.estado, 'minutos', previo.minutos_tarde, 'llegada', coalesce(previo.llegada_at, previo.marcado_at));
  end if;
  est := _llegada(r, uid, 'Gafete');
  select * into previo from rehearsal_attendance where rehearsal_id = rid and user_id = uid;
  return json_build_object('resultado', est, 'user_id', uid, 'nombre', nombre, 'foto_path', foto,
                           'minutos', previo.minutos_tarde, 'llegada', previo.llegada_at);
end $$;

-- ════════ Listas ════════
-- Lista del ensayo: elenco y equipo citados, quién marcó a cada quien.
drop function if exists rehearsal_roster(uuid);
create function rehearsal_roster(rid uuid)
returns table (user_id uuid, nombre text, papeles text[], estado text, minutos_tarde int, nota text, aviso text,
               equipo boolean, encargado boolean, marcado_por text, llegada_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare pid text := rehearsal_production(rid); enc uuid[];
begin
  if not puede_pasar_lista(rid) then raise exception 'No autorizado'; end if;
  select r.encargados into enc from rehearsals r where r.id = rid;
  return query
    with citados as (
      select distinct m.user_id as uid from production_members m
       where m.production_id = pid and rehearsal_cites(rid, m.user_id))
    select c.uid,
           coalesce(nullif(btrim(pe.nombre), ''), nullif(btrim(pr.nombre), ''), split_part(u.email::text, '@', 1)),
           case when exists (select 1 from production_members m where m.production_id = pid and m.user_id = c.uid and m.role_id = 'integrante')
                then coalesce((select array_agg(coalesce(cr.papel, initcap(cr.tipo)) order by cr.tipo, cr.orden)
                                 from production_credits cr where cr.production_id = pid and cr.person_id = pe.id), '{}')
                else coalesce((select array_agg(rl.nombre order by rl.orden) from production_members m join panel_roles rl on rl.id = m.role_id
                                where m.production_id = pid and m.user_id = c.uid), '{}') end,
           a.estado, a.minutos_tarde, a.nota,
           coalesce(
             (select case q.estado when 'pendiente' then 'Solicitó falta (por aprobar): ' else 'Falta justificada por solicitud: ' end || coalesce(q.motivo, '')
                from member_request_rehearsals x join member_requests q on q.id = x.request_id
               where x.rehearsal_id = rid and q.user_id = c.uid and q.estado in ('pendiente', 'aprobada')
               order by q.created_at desc limit 1),
             'Avisó que no viene: ' || ab.motivo),
           not exists (select 1 from production_members m where m.production_id = pid and m.user_id = c.uid and m.role_id = 'integrante'),
           c.uid = any(enc),
           (select coalesce(nullif(btrim(p2.nombre), ''), 'alguien del equipo') from profiles p2 where p2.id = a.marcado_por),
           a.llegada_at
      from citados c
      join auth.users u on u.id = c.uid
      left join profiles pr on pr.id = c.uid
      left join people pe on pe.profile_id = c.uid
      left join rehearsal_attendance a on a.rehearsal_id = rid and a.user_id = c.uid
      left join rehearsal_absences ab on ab.rehearsal_id = rid and ab.user_id = c.uid
     order by 8, 2;
end $$;

-- Equipo de la obra (para citarlo o elegir encargados): miembros que no son "integrante".
create or replace function equipo_ensayos(pid text)
returns table (user_id uuid, nombre text, roles text[])
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_perm(pid, 'ensayos.gestionar') then raise exception 'No autorizado'; end if;
  return query
    select m.user_id,
           coalesce(nullif(btrim(pe.nombre), ''), nullif(btrim(pr.nombre), ''), split_part(u.email::text, '@', 1)),
           array_agg(rl.nombre order by rl.orden)
      from production_members m
      join panel_roles rl on rl.id = m.role_id
      join auth.users u on u.id = m.user_id
      left join profiles pr on pr.id = m.user_id
      left join people pe on pe.profile_id = m.user_id
     where m.production_id = pid and m.role_id <> 'integrante'
     group by m.user_id, pe.nombre, pr.nombre, u.email
     order by 2;
end $$;

-- Mis ensayos como equipo o encargado (para Mi cuenta): de ayer a 60 días, con lo que puedo hacer.
create or replace function mis_ensayos_equipo()
returns table (id uuid, production_id text, obra text, titulo text, inicia timestamptz, termina timestamptz, lugar text, estado text,
               encargado boolean, abierto_at timestamptz, cerrado_at timestamptz, puede_abrir boolean, puede_pasar_lista boolean, mi_estado text)
language sql stable security definer set search_path = public as $$
  select r.id, r.production_id, p.nombre, r.titulo, r.inicia, r.termina, r.lugar, r.estado,
         auth.uid() = any(r.encargados), r.abierto_at, r.cerrado_at,
         auth.uid() = any(r.encargados) and r.estado = 'programado' and r.cerrado_at is null
           and (r.inicia at time zone 'America/Mexico_City')::date = (now() at time zone 'America/Mexico_City')::date
           and now() >= r.inicia - interval '1 hour'
           and (r.abierto_at is null or r.abierto_por = auth.uid()),
         puede_pasar_lista(r.id),
         (select a.estado from rehearsal_attendance a where a.rehearsal_id = r.id and a.user_id = auth.uid())
    from rehearsals r join productions p on p.id = r.production_id
   where auth.uid() is not null
     and r.inicia >= now() - interval '1 day' and r.inicia < now() + interval '60 days'
     and (auth.uid() = any(r.encargados)
          or (rehearsal_cites(r.id, auth.uid()) and es_equipo(r.production_id, auth.uid()))
          or (lider_ensayos(r.production_id, auth.uid())
              and (r.inicia at time zone 'America/Mexico_City')::date = (now() at time zone 'America/Mexico_City')::date))
   order by r.inicia
$$;

-- El encargado ve sus ensayos (además de los citados, 0043).
drop policy if exists rehearsals_encargado on rehearsals;
create policy rehearsals_encargado on rehearsals for select to authenticated using (auth.uid() = any(encargados));

-- ════════ Permisos ════════
revoke execute on function lider_ensayos(text, uuid) from public, anon;
revoke execute on function es_equipo(text, uuid) from public, anon;
revoke execute on function encargado_activo(uuid) from public, anon;
revoke execute on function puede_pasar_lista(uuid) from public, anon;
revoke execute on function ensayo_abrir(uuid) from public, anon;
revoke execute on function ensayo_cerrar(uuid) from public, anon;
revoke execute on function ensayo_reabrir(uuid) from public, anon;
revoke execute on function ensayo_marcar(uuid, uuid, text, int) from public, anon;
revoke execute on function rehearsal_roster(uuid) from public, anon;
revoke execute on function equipo_ensayos(text) from public, anon;
revoke execute on function mis_ensayos_equipo() from public, anon;
grant execute on function lider_ensayos(text, uuid), es_equipo(text, uuid), encargado_activo(uuid), puede_pasar_lista(uuid),
  ensayo_abrir(uuid), ensayo_cerrar(uuid), ensayo_reabrir(uuid), ensayo_marcar(uuid, uuid, text, int),
  rehearsal_roster(uuid), equipo_ensayos(text), mis_ensayos_equipo() to authenticated;
