-- 0084: equipo propio de cada evento (Diego 2026-10-13, opción 1). Como las convocatorias (0037):
-- además de los roles de la obra, cada evento puede tener su equipo, con un papel fijo:
--   * organiza: abre/cierra el registro, valida en la entrada y aprueba pagos.
--   * puerta:   valida credenciales y marca llegadas.
--   * cobros:   ve la lista y aprueba o rechaza pagos.
-- Sirve igual en eventos de una obra y en los de DARF (sin obra). El permiso solo vale para ese
-- evento. Arma el equipo quien edita el evento (Fan Zone de la obra; sin obra, el Director).
-- Precede: 0083.

begin;

create table evento_equipo (
  id uuid primary key default gen_random_uuid(),
  encuentro_id uuid not null references fan_encuentros(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  papel text not null check (papel in ('organiza', 'puerta', 'cobros')),
  agregado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (encuentro_id, user_id)
);
create index evento_equipo_user on evento_equipo (user_id);
alter table evento_equipo enable row level security;
create policy evento_equipo_own on evento_equipo for select to authenticated using (user_id = auth.uid());
create policy evento_equipo_editor on evento_equipo for select to authenticated
  using (exists (select 1 from fan_encuentros e where e.id = encuentro_id and evento_editor(e.production_id)));

-- ¿Qué puedo hacer en este evento? accion: editar | puerta | cobros | ver (puerta o cobros).
-- La versión "fila" recibe la obra y no vuelve a leer fan_encuentros (sirve en sus reglas de acceso).
create or replace function evento_puede_fila(eid uuid, pid text, accion text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare papel text; editor boolean;
begin
  if auth.uid() is null then return false; end if;
  editor := evento_editor(pid);
  select q.papel into papel from evento_equipo q where q.encuentro_id = eid and q.user_id = auth.uid();
  return case accion
    when 'editar' then editor or papel = 'organiza'
    when 'puerta' then editor or papel in ('organiza', 'puerta') or (pid is not null and has_perm(pid, 'puerta.validar'))
    when 'cobros' then editor or papel in ('organiza', 'cobros') or (pid is not null and has_perm(pid, 'ventas.operar'))
    when 'ver' then editor or papel is not null
                    or (pid is not null and (has_perm(pid, 'puerta.validar') or has_perm(pid, 'ventas.operar')))
    else false end;
end $$;

create or replace function evento_puede(eid uuid, accion text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select evento_puede_fila(e.id, e.production_id, accion) from fan_encuentros e where e.id = eid), false)
$$;
revoke execute on function evento_puede_fila(uuid, text, text) from public, anon;
grant execute on function evento_puede_fila(uuid, text, text) to authenticated;
revoke execute on function evento_puede(uuid, text) from public, anon;
grant execute on function evento_puede(uuid, text) to authenticated;

-- Eventos en los que estoy por su equipo propio (el panel los muestra).
create or replace function my_evento_access() returns table (encuentro_id uuid, papel text)
language sql stable security definer set search_path = public as $$
  select q.encuentro_id, q.papel from evento_equipo q where q.user_id = auth.uid()
$$;
revoke execute on function my_evento_access() from public, anon;
grant execute on function my_evento_access() to authenticated;

-- Armar el equipo: quien edita el evento. Por correo de una cuenta DARF; cambia el papel si ya estaba.
create or replace function evento_equipo_poner(eid uuid, p_email text, p_papel text) returns void
language plpgsql security definer set search_path = public as $$
declare e fan_encuentros; uid uuid; antes text;
begin
  select * into e from fan_encuentros where id = eid;
  if not found then raise exception 'Este evento no existe.'; end if;
  if not evento_editor(e.production_id) then raise exception 'No tienes permiso para armar el equipo de este evento.'; end if;
  if p_papel not in ('organiza', 'puerta', 'cobros') then raise exception 'Elige un papel: Organiza, Puerta o Cobros.'; end if;
  select id into uid from auth.users where lower(email) = lower(btrim(coalesce(p_email, '')));
  if uid is null then raise exception 'Esa persona aún no tiene cuenta en DARF. Pídele que se registre primero.'; end if;
  select papel into antes from evento_equipo where encuentro_id = eid and user_id = uid;
  insert into evento_equipo (encuentro_id, user_id, papel, agregado_por) values (eid, uid, p_papel, auth.uid())
  on conflict (encuentro_id, user_id) do update set papel = excluded.papel, agregado_por = excluded.agregado_por;
  if antes is distinct from p_papel then
    perform notify(array[uid], 'orden', 'Te sumaron al equipo de un evento',
      evento_nombre(e) || ': ' || case p_papel when 'organiza' then 'organizas' when 'puerta' then 'estás en la puerta' else 'revisas los pagos' end || '. Lo ves en Panel → Eventos.',
      '/panel/eventos', e.production_id);
  end if;
end $$;

create or replace function evento_equipo_quitar(eid uuid, uid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare e fan_encuentros;
begin
  select * into e from fan_encuentros where id = eid;
  if not found then raise exception 'Este evento no existe.'; end if;
  if not evento_editor(e.production_id) then raise exception 'No tienes permiso para armar el equipo de este evento.'; end if;
  delete from evento_equipo where encuentro_id = eid and user_id = uid;
end $$;

create or replace function evento_equipo_lista(eid uuid)
returns table (user_id uuid, nombre text, email text, papel text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not evento_puede(eid, 'editar') then raise exception 'No autorizado'; end if;
  return query
    select q.user_id, coalesce(p.nombre, ''), u.email::text, q.papel
      from evento_equipo q join auth.users u on u.id = q.user_id left join profiles p on p.id = q.user_id
     where q.encuentro_id = eid
     order by q.papel, p.nombre nulls last;
end $$;
revoke execute on function evento_equipo_poner(uuid, text, text), evento_equipo_quitar(uuid, uuid), evento_equipo_lista(uuid) from public, anon;
grant execute on function evento_equipo_poner(uuid, text, text), evento_equipo_quitar(uuid, uuid), evento_equipo_lista(uuid) to authenticated;

-- Abrir o cerrar el registro (también "organiza").
create or replace function evento_abrir(eid uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not evento_puede(eid, 'editar') then raise exception 'No tienes permiso en este evento.'; end if;
  update fan_encuentros set abierto = p_on where id = eid;
end $$;
revoke execute on function evento_abrir(uuid, boolean) from public, anon;
grant execute on function evento_abrir(uuid, boolean) to authenticated;

-- Lecturas del equipo del evento.
create policy fan_encuentros_equipo on fan_encuentros for select to authenticated using (evento_puede_fila(id, production_id, 'ver'));
create policy fan_encuentro_lugares_equipo on fan_encuentro_lugares for select to authenticated using (evento_puede(encuentro_id, 'ver'));
create policy evento_ordenes_cobros on evento_ordenes for select to authenticated using (evento_puede(encuentro_id, 'cobros'));

-- Llegada a mano: también la puerta del evento.
create or replace function evento_marcar(eid uuid, uid uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from fan_encuentros where id = eid) then raise exception 'Este evento no existe.'; end if;
  if not evento_puede(eid, 'puerta') then raise exception 'No tienes permiso en este evento.'; end if;
  update fan_encuentro_lugares set llegada_at = case when p_on then coalesce(llegada_at, now()) end,
         marcado_por = case when p_on then auth.uid() end
   where encuentro_id = eid and user_id = uid;
end $$;

-- Aprobar o rechazar el pago: también cobros y organiza del evento.
create or replace function evento_orden_revisar(oid uuid, p_aprobar boolean) returns void
language plpgsql security definer set search_path = public as $$
declare o evento_ordenes;
begin
  select * into o from evento_ordenes where id = oid for update;
  if not found then raise exception 'Esa orden no existe.'; end if;
  if not evento_puede(o.encuentro_id, 'cobros') then raise exception 'No tienes permiso para revisar pagos de este evento.'; end if;
  if o.status <> 'pendiente' then raise exception 'Esta orden ya fue revisada.'; end if;
  if p_aprobar then
    update evento_ordenes set status = 'aprobado', aprobada_por = auth.uid(), aprobada_at = now() where id = oid;
  else
    update evento_ordenes set status = 'rechazado', rechazada_por = auth.uid(), rechazada_at = now() where id = oid;
    delete from fan_encuentro_lugares where encuentro_id = o.encuentro_id and user_id = o.user_id and llegada_at is null;
  end if;
end $$;

-- Aviso de pago por revisar: también a cobros y organiza del evento.
create or replace function notify_evento_orden() returns trigger
language plpgsql security definer set search_path = public as $$
declare e fan_encuentros; nombre text; equipo uuid[];
begin
  select * into e from fan_encuentros where id = new.encuentro_id;
  nombre := evento_nombre(e);
  if tg_op = 'INSERT' and new.status = 'pendiente' then
    select coalesce(array_agg(user_id), '{}') into equipo from evento_equipo where encuentro_id = e.id and papel in ('organiza', 'cobros');
    perform notify(equipo || case when e.production_id is null then admin_ids()
                        else users_with_perm(e.production_id, 'fanzone.editar') || users_with_perm(e.production_id, 'ventas.operar') end,
      'orden', 'Pago de evento por revisar', display_name(new.user_id) || ' apartó ' || nombre || ' (' || pesos_mx(new.monto) || ', ' || new.codigo || ').',
      '/panel/eventos', e.production_id);
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'aprobado' then
      perform notify(array[new.user_id], 'boletos', '¡Tu lugar está confirmado!', nombre || '. Entra con tu credencial.', '/eventos', e.production_id);
    elsif new.status = 'rechazado' and new.vencida_at is not null then
      perform notify(array[new.user_id], 'boletos', 'Tu apartado venció', nombre || ': no recibimos el pago a tiempo y se liberó tu lugar.', '/eventos', e.production_id);
    elsif new.status = 'rechazado' and new.rechazada_por is distinct from new.user_id then
      perform notify(array[new.user_id], 'boletos', 'Tu apartado fue cancelado', nombre || '. Si crees que es un error, escríbenos.', '/eventos', e.production_id);
    end if;
  end if;
  return new;
end $$;

-- Lista de personas: puerta o cobros (de la obra o del evento).
create or replace function fan_encuentro_personas(eid uuid)
returns table (user_id uuid, nombre text, telefono text, numero int, created_at timestamptz, llegada_at timestamptz,
               orden_id uuid, orden_codigo text, orden_status text, orden_monto numeric, orden_expira timestamptz)
language sql stable security definer set search_path = public as $$
  select l.user_id, coalesce(p.nombre, ''), p.telefono, m.numero, l.created_at, l.llegada_at,
         o.id, o.codigo, o.status, o.monto, o.expires_at
    from fan_encuentro_lugares l
    left join profiles p on p.id = l.user_id
    left join fan_members m on m.user_id = l.user_id
    left join lateral (select * from evento_ordenes x where x.encuentro_id = l.encuentro_id and x.user_id = l.user_id and x.status in ('pendiente', 'aprobado')
                       order by x.created_at desc limit 1) o on true
   where l.encuentro_id = eid and evento_puede(eid, 'ver')
   order by l.llegada_at nulls last, l.created_at
$$;

-- Validar en la entrada: también la puerta del evento (el resto, igual que 0083).
create or replace function fan_checkin(eid uuid, p_code text) returns json
language plpgsql security definer set search_path = public as $$
declare e fan_encuentros; uid uuid; m fan_members; l fan_encuentro_lugares; nombre text; foto text; usados int; base json; nivel text;
begin
  select * into e from fan_encuentros where id = eid for update;
  if not found then raise exception 'Ese evento no existe.'; end if;
  if not evento_puede(eid, 'puerta') then raise exception 'No tienes permiso para validar credenciales en este evento.'; end if;
  if e.tipo = 'en_linea' then raise exception 'Este evento es en línea: no se valida en una entrada.'; end if;
  uid := credencial_resolver(p_code);
  if uid is null then return json_build_object('resultado', 'no_encontrado'); end if;
  select * into m from fan_members where user_id = uid;
  nivel := credencial_nivel(uid);
  select coalesce(p.nombre, ''), p.foto_path into nombre, foto from profiles p where p.id = uid;
  base := json_build_object('user_id', uid, 'nombre', nombre, 'foto_path', foto, 'numero', m.numero, 'fundador', coalesce(m.numero <= 100, false), 'nivel', nivel);
  select * into l from fan_encuentro_lugares where encuentro_id = eid and user_id = uid;
  if found and l.llegada_at is not null then
    return (base::jsonb || jsonb_build_object('resultado', 'ya', 'llegada', l.llegada_at))::json;
  end if;
  if e.acceso = 'club' and m.user_id is null and nivel <> 'equipo' then
    return (base::jsonb || jsonb_build_object('resultado', 'no_socio'))::json;
  end if;
  if e.requiere_boleto and e.performance_id is not null
     and not exists (select 1 from orders o where o.performance_id = e.performance_id and o.buyer_user_id = uid and o.status = 'aprobado') then
    return (base::jsonb || jsonb_build_object('resultado', 'sin_boleto'))::json;
  end if;
  if l.user_id is null then
    if e.requiere_registro then return (base::jsonb || jsonb_build_object('resultado', 'sin_lugar'))::json; end if;
    if e.cupo is not null then
      select count(*) into usados from fan_encuentro_lugares where encuentro_id = eid;
      if usados >= e.cupo then return (base::jsonb || jsonb_build_object('resultado', 'lleno'))::json; end if;
    end if;
    insert into fan_encuentro_lugares (encuentro_id, user_id, llegada_at, marcado_por) values (eid, uid, now(), auth.uid());
  else
    if e.precio is not null and not evento_pagado(eid, uid) then
      return (base::jsonb || jsonb_build_object('resultado', 'sin_pago'))::json;
    end if;
    update fan_encuentro_lugares set llegada_at = now(), marcado_por = auth.uid() where encuentro_id = eid and user_id = uid;
  end if;
  return (base::jsonb || jsonb_build_object('resultado', 'ok', 'llegada', now()))::json;
end $$;

commit;
