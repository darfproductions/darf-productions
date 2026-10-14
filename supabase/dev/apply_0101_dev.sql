-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV" (la base oficial de la 2.0).
-- 0101: Cargo "Dirección general", permisos de Producción, rol "Estilismo" y revisión de calificaciones. Requiere 0100.
-- Si la base no es DEV, aborta. Se corre completa en Supabase → SQL Editor.
begin;
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
  if to_regclass('public.rubric_proposals') is null then
    raise exception 'ABORTADO: primero corre apply_0100_dev.sql.';
  end if;
end $$;


-- ════════ Permiso para aprobar y publicar boletas ════════
insert into permissions (id, grupo, descripcion, orden) values
  ('rubrica.aprobar', 'Elenco', 'Aprobar y publicar las boletas (revisión final de la rúbrica)', 29)
on conflict (id) do nothing;

-- ════════ Rol y categoría "Dirección general" ════════
alter table panel_roles drop constraint if exists panel_roles_categoria_check;
alter table panel_roles add constraint panel_roles_categoria_check
  check (categoria in ('direccion_general', 'produccion', 'direccion', 'crew', 'staff'));
alter table panel_roles disable trigger panel_roles_protect;
insert into panel_roles (id, nombre, descripcion, es_sistema, orden, categoria) values
  ('direccion_general', 'Dirección general', 'Director general de la obra: todo, incluida producción, dirección y la aprobación de boletas', true, 0, 'direccion_general')
on conflict (id) do nothing;
alter table panel_roles enable trigger panel_roles_protect;
alter table role_permissions disable trigger role_permissions_protect;
insert into role_permissions (role_id, permission_id) select 'direccion_general', id from permissions on conflict do nothing;
-- Producción: operación de la obra; lo artístico, los permisos y publicar quedan para Dirección general.
delete from role_permissions where role_id = 'productor'
   and permission_id in ('audiciones.evaluar', 'elenco.gestionar', 'rubrica.gestionar', 'obra.publicar', 'permisos.gestionar');
alter table role_permissions enable trigger role_permissions_protect;
alter table panel_roles disable trigger panel_roles_protect;
update panel_roles set descripcion = 'Operación de la obra: página, audiciones, expedientes, ensayos, materiales, boletos, reportes y equipo'
 where id = 'productor';
-- "Maquillaje" ahora se llama "Estilismo" (Diego): mismo id, mismos permisos, quien lo tiene lo conserva.
update panel_roles set nombre = 'Estilismo', descripcion = 'Vestuario, maquillaje y peinado: ve la obra y los materiales'
 where id = 'maquillaje';
alter table panel_roles enable trigger panel_roles_protect;

-- Dirección general siempre lidera ensayos (0099).
create or replace function lider_ensayos(pid text, uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from production_members m join panel_roles pr on pr.id = m.role_id
                  where m.production_id = pid and m.user_id = uid and pr.categoria in ('direccion_general', 'produccion', 'direccion'))
$$;

-- ¿Soy Dirección general de esta obra? (puede todo, incluso permisos futuros)
create or replace function es_direccion_general(pid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from production_members where production_id = pid and user_id = auth.uid() and role_id = 'direccion_general')
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
    or es_direccion_general(pid)
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
  -- Dirección general: todos los permisos de su obra.
  select m.production_id, pe.id
    from production_members m cross join permissions pe
   where m.user_id = auth.uid() and m.role_id = 'direccion_general'
  union
  -- Producción, dirección y maestros: ensayos y asistencia siempre (y ver la obra para entrar al panel).
  select m.production_id, x.perm
    from production_members m join panel_roles pr on pr.id = m.role_id
    cross join unnest(array['ensayos.gestionar', 'obra.ver']) as x(perm)
   where m.user_id = auth.uid() and pr.categoria in ('direccion_general', 'produccion', 'direccion')
$$;

-- Gafete: categoría Dirección general (nivel 1, arriba de Producción).
create or replace function badge_papel(uid uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare rol_app text; v_cargo text; v_nivel int; v_papel text;
begin
  select rol into rol_app from profiles where id = uid;
  -- Manager: Equipo DARF (su cargo) …
  select tm.cargo into v_cargo
    from team_members tm join people pe on pe.id = tm.person_id
   where pe.profile_id = uid
   order by tm.orden, tm.created_at limit 1;
  if v_cargo is not null then return json_build_object('franja', 'manager', 'papel', v_cargo); end if;

  -- Niveles: 1 dirección general (0101) · 2 producción · 3 dirección · 4 elenco · 5 crew · 6 staff.
  select x.nivel, x.papel into v_nivel, v_papel from (
    select case when m.role_id = 'integrante' then 4
                else case r.categoria when 'direccion_general' then 1 when 'produccion' then 2 when 'direccion' then 3 when 'crew' then 5 else 6 end end as nivel,
           case when m.role_id = 'integrante' then 'Elenco' else r.nombre end as papel,
           r.orden as sub, p.concluded, p.created_at
      from production_members m
      join panel_roles r on r.id = m.role_id
      join productions p on p.id = m.production_id
     where m.user_id = uid
    union all
    select case c.tipo when 'produccion' then 2 when 'creativo' then 3 when 'reparto' then 4 when 'ensamble' then 4 else 5 end,
           case when c.tipo in ('reparto', 'ensamble') then 'Elenco' else coalesce(nullif(btrim(c.papel), ''), 'Equipo') end,
           c.orden, p.concluded, p.created_at
      from production_credits c
      join people pe on pe.id = c.person_id
      join productions p on p.id = c.production_id
     where pe.profile_id = uid and c.activo
  ) x
  order by x.nivel, x.concluded, x.created_at desc, x.sub
  limit 1;

  -- … y el Director (administrador del panel).
  if rol_app = 'admin' then
    return json_build_object('franja', 'manager', 'papel', case when v_nivel between 1 and 3 then v_papel else 'Dirección general' end);
  end if;
  -- Staff general de DARF: al menos Staff.
  if rol_app = 'staff' and (v_nivel is null or v_nivel > 6) then
    return json_build_object('franja', 'staff', 'papel', 'Staff DARF');
  end if;
  if v_nivel is null then return null; end if;
  return json_build_object('franja', case v_nivel when 1 then 'direccion_general' when 2 then 'produccion' when 3 then 'direccion' when 6 then 'staff' else 'crew' end, 'papel', v_papel);
end $$;

-- ════════ Quién aprueba y publica ════════
-- Admin, Dirección general (rubrica.aprobar) o, si la obra no tiene Dirección general, la coordinación
-- de la rúbrica (rubrica.gestionar sin materias: Dirección artística o un maestro coordinador).
create or replace function rubric_puede_publicar(pid text) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    is_admin() or has_perm(pid, 'rubrica.aprobar')
    or (not exists (select 1 from production_members where production_id = pid and role_id = 'direccion_general')
        and rubric_coord(pid))
  )
$$;

create or replace function rubric_publicar_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Solo aplica a usuarios de la página (rol authenticated); la base y los scripts de servicio no.
  if auth.uid() is null or coalesce(current_setting('role', true), 'none') <> 'authenticated' then return new; end if;
  if (tg_op = 'INSERT' and new.publicado_at is not null)
     or (tg_op = 'UPDATE' and new.publicado_at is distinct from old.publicado_at) then
    if not rubric_puede_publicar(new.production_id) then
      raise exception 'Las boletas las aprueba y publica la Dirección general de la obra.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists rubric_periods_publicar on rubric_periods;
create trigger rubric_periods_publicar before insert or update on rubric_periods for each row execute function rubric_publicar_guard();

create or replace function rubric_publicar(per uuid, on_ boolean) returns void
language plpgsql security definer set search_path = public as $$
declare pid text;
begin
  select production_id into pid from rubric_periods where id = per;
  if pid is null then raise exception 'Ese periodo no existe.'; end if;
  if not rubric_puede_publicar(pid) then raise exception 'Las boletas las aprueba y publica la Dirección general de la obra.'; end if;
  update rubric_periods set publicado_at = case when on_ then now() end where id = per;
end $$;

-- ════════ Entregas de calificaciones ════════
create table if not exists rubric_entregas (
  period_id uuid not null references rubric_periods(id) on delete cascade,
  teacher_id uuid not null references auth.users(id) on delete cascade,
  production_id text not null references productions(id) on delete cascade,
  estado text not null default 'entregada' check (estado in ('entregada', 'regresada')),
  entregado_at timestamptz not null default now(),
  regresado_at timestamptz,
  regresado_por uuid references auth.users(id) on delete set null,
  nota text check (length(nota) <= 1000),
  primary key (period_id, teacher_id)
);
alter table rubric_entregas enable row level security;
drop policy if exists rubric_entregas_read on rubric_entregas;
create policy rubric_entregas_read on rubric_entregas for select to authenticated
  using (teacher_id = auth.uid() or has_perm(production_id, 'rubrica.gestionar'));
revoke all on rubric_entregas from anon;
drop trigger if exists audit_rubric_entregas on rubric_entregas;
create trigger audit_rubric_entregas after insert or update or delete on rubric_entregas for each row execute function audit_row();

-- Quienes revisan: coordinación de la rúbrica (sin materias) y Dirección general.
create or replace function rubric_revisores(pid text) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct m.user_id), '{}')
    from production_members m
   where m.production_id = pid
     and (m.role_id = 'direccion_general'
          or (exists (select 1 from role_permissions rp where rp.role_id = m.role_id and rp.permission_id = 'rubrica.gestionar')
              and not exists (select 1 from rubric_teachers t where t.production_id = pid and t.user_id = m.user_id)))
$$;

create or replace function rubric_entregar(per uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p rubric_periods; mats text;
begin
  select * into p from rubric_periods where id = per;
  if not found then raise exception 'Ese periodo no existe.'; end if;
  if not exists (select 1 from rubric_teachers where production_id = p.production_id and user_id = auth.uid()) then
    raise exception 'Solo los maestros con materias entregan calificaciones.';
  end if;
  if not rubric_active(p.production_id) then raise exception 'Las evaluaciones están apagadas en esta obra.'; end if;
  if p.publicado_at is not null then raise exception 'Este periodo ya se publicó.'; end if;
  insert into rubric_entregas (period_id, teacher_id, production_id) values (per, auth.uid(), p.production_id)
  on conflict (period_id, teacher_id) do update
    set estado = 'entregada', entregado_at = now(), regresado_at = null, regresado_por = null, nota = null;
  select string_agg(c.nombre, ', ' order by c.orden) into mats
    from rubric_teachers t join rubric_criteria c on c.id = t.criterion_id
   where t.production_id = p.production_id and t.user_id = auth.uid();
  perform notify(array_remove(rubric_revisores(p.production_id), auth.uid()), 'evaluacion', 'Calificaciones entregadas',
                 coalesce((select nombre from profiles where id = auth.uid()), 'Un maestro') || ' · ' || coalesce(mats, '') || ' · ' || p.nombre,
                 '/panel/producciones/' || p.production_id || '/evaluaciones/' || per, p.production_id);
end $$;

create or replace function rubric_regresar(per uuid, teacher uuid, p_nota text default null) returns void
language plpgsql security definer set search_path = public as $$
declare p rubric_periods;
begin
  select * into p from rubric_periods where id = per;
  if not found then raise exception 'Ese periodo no existe.'; end if;
  if not (rubric_coord(p.production_id) or rubric_puede_publicar(p.production_id)) then raise exception 'No autorizado'; end if;
  if p.publicado_at is not null then raise exception 'Este periodo ya se publicó.'; end if;
  update rubric_entregas set estado = 'regresada', regresado_at = now(), regresado_por = auth.uid(),
         nota = nullif(btrim(coalesce(p_nota, '')), '')
   where period_id = per and teacher_id = teacher and estado = 'entregada';
  if not found then raise exception 'Ese maestro no tiene una entrega por revisar.'; end if;
  perform notify(array[teacher], 'evaluacion', 'Te regresaron tus calificaciones',
                 p.nombre || coalesce(' · ' || nullif(btrim(coalesce(p_nota, '')), ''), ''),
                 '/panel/producciones/' || p.production_id || '/evaluaciones/' || per, p.production_id);
end $$;

-- Bloqueo: con la entrega hecha, el maestro ya no cambia lo suyo; quien revisa sí puede corregir.
create or replace function rubric_entrega_lock() returns trigger
language plpgsql security definer set search_path = public as $$
declare eid uuid := coalesce(case when tg_op = 'DELETE' then old.evaluation_id else new.evaluation_id end, old.evaluation_id);
        per uuid; pid text;
begin
  if auth.uid() is null or coalesce(current_setting('role', true), 'none') <> 'authenticated' then return coalesce(new, old); end if;
  select period_id, production_id into per, pid from rubric_evaluations where id = eid;
  if per is null or rubric_coord(pid) or rubric_puede_publicar(pid) then return coalesce(new, old); end if;
  if exists (select 1 from rubric_entregas where period_id = per and teacher_id = auth.uid() and estado = 'entregada') then
    raise exception 'Ya entregaste tus calificaciones de este periodo. Pide que te las regresen para cambiarlas.';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists rubric_scores_entrega on rubric_scores;
create trigger rubric_scores_entrega before insert or update or delete on rubric_scores for each row execute function rubric_entrega_lock();
drop trigger if exists rubric_shared_entrega on rubric_shared_scores;
create trigger rubric_shared_entrega before insert or update or delete on rubric_shared_scores for each row execute function rubric_entrega_lock();
drop trigger if exists rubric_notes_entrega on rubric_notes;
create trigger rubric_notes_entrega before insert or update or delete on rubric_notes for each row execute function rubric_entrega_lock();

-- Dirección general (o quien publica) corrige la parte de cada maestro en lo compartido y sus comentarios.
alter policy rubric_shared_write on rubric_shared_scores
  using ((teacher_id = auth.uid() or is_admin() or rubric_puede_publicar(rubric_eval_production(evaluation_id)))
         and has_perm(rubric_eval_production(evaluation_id), 'rubrica.gestionar'))
  with check ((teacher_id = auth.uid() or is_admin() or rubric_puede_publicar(rubric_eval_production(evaluation_id)))
              and has_perm(rubric_eval_production(evaluation_id), 'rubrica.gestionar')
              and coalesce((select compartido from rubric_criteria where id = criterion_id), false));
alter policy rubric_notes_write on rubric_notes
  using ((teacher_id = auth.uid() or is_admin() or rubric_puede_publicar(rubric_eval_production(evaluation_id)))
         and has_perm(rubric_eval_production(evaluation_id), 'rubrica.gestionar'))
  with check ((teacher_id = auth.uid() or is_admin() or rubric_puede_publicar(rubric_eval_production(evaluation_id)))
              and has_perm(rubric_eval_production(evaluation_id), 'rubrica.gestionar'));

-- Estado de entregas de un periodo (maestros con materias), para la pantalla del periodo.
create or replace function rubric_entregas_periodo(per uuid)
returns table (teacher_id uuid, nombre text, estado text, entregado_at timestamptz, regresado_at timestamptz, nota text)
language plpgsql stable security definer set search_path = public as $$
declare pid text;
begin
  select production_id into pid from rubric_periods where id = per;
  if pid is null or not has_perm(pid, 'rubrica.gestionar') then raise exception 'No autorizado'; end if;
  return query
    select t.user_id, coalesce(nullif(btrim(pr.nombre), ''), 'Maestro'), coalesce(en.estado, 'pendiente'), en.entregado_at, en.regresado_at, en.nota
      from (select distinct user_id from rubric_teachers where production_id = pid) t
      left join profiles pr on pr.id = t.user_id
      left join rubric_entregas en on en.period_id = per and en.teacher_id = t.user_id
     order by 2;
end $$;

-- ════════ Por hacer del panel: entregas por revisar ════════
CREATE OR REPLACE FUNCTION public.panel_pendientes()
 RETURNS TABLE(tipo text, production_id text, ref_id text, ref_titulo text, n integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare gestiona_aud boolean;
begin
  if auth.uid() is null then raise exception 'No autorizado'; end if;
  gestiona_aud := is_admin() or exists (select 1 from my_panel_access() a where a.permission_id = 'audiciones.gestionar');
  return query
  with mias as (
    select distinct a.production_id as pid from my_panel_access() a
      join productions p on p.id = a.production_id
     where p.estado <> 'archivada'
  )
  -- Solicitudes de audición: una fila por convocatoria (obra, general, registro permanente o equipo propio).
  select 'solicitudes'::text, a.production_id, a.id::text, a.titulo, count(*)::int
    from audition_applications ap join auditions a on a.id = ap.audition_id
   where ap.estado = 'inscrito' and a.estado in ('abierta', 'cerrada')
     and ((a.production_id in (select pid from mias) and has_perm(a.production_id, 'audiciones.gestionar'))
          or (a.production_id is null and not coalesce(a.permanente, false) and is_admin())
          or (coalesce(a.permanente, false) and gestiona_aud)
          or audition_member_perm(a.id, 'audiciones.gestionar'))
   group by a.production_id, a.id, a.titulo
  union all
  select 'ofertas', o.production_id, null, null, count(*)::int from casting_offers o
   where o.estado = 'enviada' and o.production_id in (select pid from mias) and has_perm(o.production_id, 'elenco.gestionar')
   group by o.production_id
  union all
  select 'documentos', d.production_id, null, null, count(*)::int from member_docs d
   where d.subido_at is not null and d.entregado_at is null
     and d.production_id in (select pid from mias) and has_perm(d.production_id, 'expedientes.ver')
   group by d.production_id
  union all
  select 'advertencias', i.production_id, null, null, count(*)::int from member_incidents i
   where i.nivel in ('advertencia', 'grave') and i.anulada_at is null and i.created_at > now() - interval '7 days'
     and i.production_id in (select pid from mias) and has_perm(i.production_id, 'expedientes.ver')
   group by i.production_id
  union all
  -- Personas en el límite de advertencias sin medida tomada (y sin baja).
  select 'decision', m.pid, null, null, (
      select count(*)::int from discipline_summary(m.pid) d
       where d.requiere_decision
         and not exists (select 1 from member_enrollment e where e.production_id = m.pid and e.user_id = d.user_id and e.baja_at is not null))
    from mias m
   where has_perm(m.pid, 'expedientes.ver') and (can_manage_discipline(m.pid) or has_perm(m.pid, 'mensualidades.gestionar'))
  union all
  select 'evaluaciones', r.production_id, null, null, count(*)::int from rubric_periods r
   where r.publicado_at is null and r.hasta is not null and r.hasta < hoy_mx() and rubric_active(r.production_id)
     and r.production_id in (select pid from mias) and rubric_puede_publicar(r.production_id)
   group by r.production_id
  union all
  -- 0101: entregas de calificaciones por revisar (coordinación y Dirección general).
  select 'entregas', r.production_id, null, null, count(*)::int
    from rubric_entregas en join rubric_periods r on r.id = en.period_id
   where en.estado = 'entregada' and r.publicado_at is null and rubric_active(r.production_id)
     and r.production_id in (select pid from mias) and (rubric_coord(r.production_id) or rubric_puede_publicar(r.production_id))
   group by r.production_id
  union all
  select 'solicitudes_elenco', q.production_id, null, null, count(*)::int from member_requests q
   where q.estado = 'pendiente' and q.production_id in (select pid from mias) and can_review_request(q.production_id, q.tipo)
   group by q.production_id
  union all
  -- Pagos de eventos por revisar (de la obra o del equipo propio del evento).
  select 'pagos_evento', e.production_id, e.id::text, evento_nombre(e), count(*)::int
    from evento_ordenes o join fan_encuentros e on e.id = o.encuentro_id
   where o.status = 'pendiente' and evento_puede_fila(e.id, e.production_id, 'cobros')
   group by e.production_id, e.id
  union all
  select 'notas_equipo', u.production_id, null, null, u.notas::int from my_team_unread() u where u.notas > 0
  union all
  -- 0100: propuestas de calificación de asistentes artísticos por aprobar (para quien califica esa materia).
  select 'propuestas', e.production_id, null, null, count(*)::int
    from rubric_proposals q join rubric_evaluations e on e.id = q.evaluation_id
   where q.estado = 'pendiente' and e.production_id in (select pid from mias) and rubric_can_grade(e.production_id, q.criterion_id)
   group by e.production_id
  union all
  select 'avisos_equipo', u.production_id, null, null, u.avisos::int from my_team_unread() u where u.avisos > 0;
end $function$
;

revoke execute on function es_direccion_general(text), rubric_puede_publicar(text), rubric_publicar(uuid, boolean),
  rubric_entregar(uuid), rubric_regresar(uuid, uuid, text), rubric_entregas_periodo(uuid), rubric_revisores(text) from public, anon;
revoke execute on function rubric_publicar_guard(), rubric_entrega_lock() from public, anon, authenticated;
grant execute on function es_direccion_general(text), rubric_puede_publicar(text), rubric_publicar(uuid, boolean),
  rubric_entregar(uuid), rubric_regresar(uuid, uuid, text), rubric_entregas_periodo(uuid) to authenticated;

select 'Listo 0101. Rol: ' || (select nombre from panel_roles where id = 'direccion_general')
       || ' · ' || (select count(*) from role_permissions where role_id = 'direccion_general') || ' permisos · Producción: '
       || (select count(*) from role_permissions where role_id = 'productor') || ' permisos' as resultado;
commit;
