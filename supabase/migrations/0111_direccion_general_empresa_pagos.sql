-- 0111 (Diego 2026-10-15): Dirección general de DARF, cuenta de la empresa, borrar cuentas vacías y pagos por ficha.
--   1. Rol "Dirección general" (direccion_general_darf): quien esté en la tabla direccion_general_darf (Diego)
--      queda en TODAS las obras y eventos, existentes y futuros, con acceso total. Solo le llegan los avisos
--      importantes (órdenes y pagos por revisar, audiciones, ofertas y solicitudes de pago); no lo citan a ensayos
--      ni sale en las listas del equipo. Sí cuenta para DARF Loyalty. El rol de cada obra que se llamaba
--      "Dirección general" ahora se llama "Dirección de la obra" (mismo id y permisos).
--   2. Cuenta de la empresa (cuentas_empresa, "DARF Productions"): sigue siendo admin, pero no puede ser
--      Club Fan, no tiene credencial ni Wallet y no sale en listas de equipo ni en el Directorio.
--   3. Borrar cuentas vacías (solo el admin): cuentas sin ficha, obras, compras ni registros.
--   4. Pagos por ficha: mensualidades e inscripción de quien aún no tiene cuenta; pasan solas a su cuenta al
--      ligarla (igual que la asistencia de 0109). Y el vencimiento "segundo sábado del mes" (Showman).

-- ════════ 1. Dirección general de DARF ════════
create table if not exists direccion_general_darf (
  user_id uuid primary key references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table direccion_general_darf enable row level security;
drop policy if exists direccion_general_darf_read on direccion_general_darf;
create policy direccion_general_darf_read on direccion_general_darf for select using (user_id = auth.uid() or is_admin());

alter table panel_roles disable trigger panel_roles_protect;
insert into panel_roles (id, nombre, descripcion, es_sistema, orden, categoria) values
  ('direccion_general_darf', 'Dirección general', 'Dirección general de DARF: todas las obras y eventos con acceso total. Se asigna sola.', true, -1, 'direccion_general')
on conflict (id) do update set nombre = excluded.nombre, descripcion = excluded.descripcion, orden = excluded.orden, categoria = excluded.categoria;
update panel_roles set nombre = 'Dirección de la obra' where id = 'direccion_general';
alter table panel_roles enable trigger panel_roles_protect;
-- Sus permisos "de lista" son solo los que mandan avisos importantes; el acceso total viene de es_direccion_general.
alter table role_permissions disable trigger role_permissions_protect;
delete from role_permissions where role_id = 'direccion_general_darf';
insert into role_permissions (role_id, permission_id)
select 'direccion_general_darf', id from permissions
 where id in ('ventas.operar', 'audiciones.gestionar', 'elenco.gestionar', 'mensualidades.gestionar');
alter table role_permissions enable trigger role_permissions_protect;

-- Acceso total en cada obra (igual que la Dirección de la obra).
create or replace function es_direccion_general(pid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from production_members where production_id = pid and user_id = auth.uid()
                  and role_id in ('direccion_general', 'direccion_general_darf'))
$$;

do $$
declare def text;
begin
  def := pg_get_functiondef('public.my_panel_access()'::regprocedure);
  def := replace(def, $q$m.role_id = 'direccion_general' and$q$, $q$m.role_id in ('direccion_general', 'direccion_general_darf') and$q$);
  execute def;
end $$;

-- No lo citan a ensayos ni sale en las listas del equipo de cada obra (ni recibe sus avisos).
do $$
declare f record; def text;
begin
  for f in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prosrc ~ 'role_id\s*<>\s*''integrante'''
              and p.proname in ('_citados', 'birthdays', 'equipo_ensayos', 'es_equipo', 'team_member_roles',
                                'team_recipients', 'team_roster', 'team_roster_public') loop
    def := regexp_replace(pg_get_functiondef(f.oid), 'role_id\s*<>\s*''integrante''',
                          'role_id not in (''integrante'', ''direccion_general_darf'')', 'g');
    execute def;
  end loop;
end $$;

-- Sin bienvenida al equipo por este rol.
do $$
declare def text;
begin
  def := pg_get_functiondef('public.notify_team_welcome()'::regprocedure);
  def := replace(def, $q$if new.role_id = 'integrante' or$q$, $q$if new.role_id in ('integrante', 'direccion_general_darf') or$q$);
  execute def;
end $$;

-- En Permisos se ve, pero no se da ni se quita a mano (se maneja con la tabla direccion_general_darf).
drop policy if exists production_members_insert on production_members;
create policy production_members_insert on production_members for insert
  with check (has_perm(production_id, 'permisos.gestionar') and role_id <> 'direccion_general_darf');
drop policy if exists production_members_delete on production_members;
create policy production_members_delete on production_members for delete
  using (has_perm(production_id, 'permisos.gestionar') and role_id <> 'direccion_general_darf');

-- Tampoco por las funciones del panel (agregar o invitar): solo quien está en direccion_general_darf.
create or replace function direccion_general_darf_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role_id = 'direccion_general_darf'
     and not exists (select 1 from direccion_general_darf where user_id = new.user_id) then
    raise exception 'El rol Dirección general se asigna solo; no se puede dar a mano.';
  end if;
  return new;
end $$;
drop trigger if exists direccion_general_darf_guard on production_members;
create trigger direccion_general_darf_guard before insert or update on production_members
  for each row execute function direccion_general_darf_guard();

-- Ponerlo en todas las obras y eventos.
create or replace function direccion_general_darf_poner(uid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into production_members (production_id, user_id, role_id, created_by)
  select p.id, uid, 'direccion_general_darf', uid from productions p
  on conflict do nothing;
  insert into evento_equipo (encuentro_id, user_id, papel, agregado_por)
  select e.id, uid, 'organiza', uid from fan_encuentros e
  on conflict (encuentro_id, user_id) do nothing;
end $$;
revoke all on function direccion_general_darf_poner(uuid) from public, anon, authenticated;

create or replace function direccion_general_darf_cambio() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform direccion_general_darf_poner(new.user_id);
  else
    delete from production_members where user_id = old.user_id and role_id = 'direccion_general_darf';
  end if;
  return null;
end $$;
drop trigger if exists direccion_general_darf_cambio on direccion_general_darf;
create trigger direccion_general_darf_cambio after insert or delete on direccion_general_darf
  for each row execute function direccion_general_darf_cambio();

-- Obras nuevas (también al duplicar).
create or replace function produccion_nueva_direccion_general() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into production_members (production_id, user_id, role_id, created_by)
  select new.id, d.user_id, 'direccion_general_darf', d.user_id from direccion_general_darf d
  on conflict do nothing;
  return null;
end $$;
drop trigger if exists produccion_nueva_direccion_general on productions;
create trigger produccion_nueva_direccion_general after insert on productions
  for each row execute function produccion_nueva_direccion_general();

-- Eventos nuevos: organiza.
create or replace function evento_nuevo_direccion_general() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into evento_equipo (encuentro_id, user_id, papel, agregado_por)
  select new.id, d.user_id, 'organiza', d.user_id from direccion_general_darf d
  on conflict (encuentro_id, user_id) do nothing;
  return null;
end $$;
drop trigger if exists evento_nuevo_direccion_general on fan_encuentros;
create trigger evento_nuevo_direccion_general after insert on fan_encuentros
  for each row execute function evento_nuevo_direccion_general();

-- Duplicar una obra copiando permisos ya no choca con quien entró solo al crearla.
do $$
declare def text;
begin
  def := pg_get_functiondef('public.panel_duplicate_production(text, text, text, text, boolean, boolean, boolean)'::regprocedure);
  if position('where production_id = src on conflict do nothing' in def) = 0 then
    def := replace(def, $q$from production_members where production_id = src;$q$,
                        $q$from production_members where production_id = src on conflict do nothing;$q$);
    execute def;
  end if;
end $$;

-- ════════ 2. Cuenta de la empresa ════════
create table if not exists cuentas_empresa (
  user_id uuid primary key references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table cuentas_empresa enable row level security;
drop policy if exists cuentas_empresa_read on cuentas_empresa;
create policy cuentas_empresa_read on cuentas_empresa for select using (user_id = auth.uid() or is_admin());

create or replace function es_cuenta_empresa(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select uid is not null and exists (select 1 from cuentas_empresa where user_id = uid)
$$;
grant execute on function es_cuenta_empresa(uuid) to authenticated;

-- Al marcarla: sale del Club Fan y se borra su credencial.
create or replace function cuenta_empresa_limpia() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from fan_members where user_id = new.user_id;
  delete from badges where user_id = new.user_id;
  return null;
end $$;
drop trigger if exists cuenta_empresa_limpia on cuentas_empresa;
create trigger cuenta_empresa_limpia after insert on cuentas_empresa
  for each row execute function cuenta_empresa_limpia();

create or replace function fan_join() returns json
language plpgsql security definer set search_path = public as $$
declare m fan_members;
begin
  if auth.uid() is null then raise exception 'Necesitas iniciar sesión.'; end if;
  if es_cuenta_empresa(auth.uid()) then raise exception 'Esta cuenta es de la empresa: no puede ser parte del Club Fan.'; end if;
  insert into fan_members (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  select * into m from fan_members where user_id = auth.uid();
  return json_build_object('numero', m.numero, 'desde', m.created_at, 'fundador', m.numero <= 100, 'token', m.token, 'codigo', m.codigo);
end $$;

create or replace function is_fan_member() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and not es_cuenta_empresa(auth.uid())
     and (exists (select 1 from fan_members where user_id = auth.uid()) or badge_puede(auth.uid()))
$$;

create or replace function badge_puede(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not es_cuenta_empresa(uid) and (
         exists (select 1 from profiles where id = uid and rol in ('staff', 'admin'))
      or exists (select 1 from casa_members where user_id = uid)
      or exists (select 1 from team_members tm join people pe on pe.id = tm.person_id where pe.profile_id = uid)
      or exists (select 1 from production_members where user_id = uid)
      or exists (select 1 from production_credits c join people pe on pe.id = c.person_id where pe.profile_id = uid and c.activo))
$$;

create or replace function credencial_mia() returns json
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or es_cuenta_empresa(auth.uid()) then return null; end if;
  if not exists (select 1 from badges where user_id = auth.uid()) then
    insert into badges (user_id, token, codigo) values (auth.uid(), badge_nuevo_token(), badge_nuevo_codigo());
  end if;
  return credencial_de(auth.uid());
end $$;

-- Fuera de las listas del equipo general y del Directorio.
do $$
declare def text;
begin
  def := pg_get_functiondef('public.team_roster(text)'::regprocedure);
  def := replace(def, $q$(pr.rol in ('staff', 'admin') or$q$, $q$((pr.rol in ('staff', 'admin') and not es_cuenta_empresa(pr.id)) or$q$);
  execute def;
  def := pg_get_functiondef('public.team_recipients(text, text, text[], uuid[])'::regprocedure);
  def := replace(def, $q$(pr.rol in ('staff', 'admin') or$q$, $q$((pr.rol in ('staff', 'admin') and not es_cuenta_empresa(pr.id)) or$q$);
  execute def;
  def := pg_get_functiondef('public.is_team(text, uuid)'::regprocedure);
  def := replace(def, $q$where id = uid and rol in ('staff', 'admin'))$q$, $q$where id = uid and rol in ('staff', 'admin') and not es_cuenta_empresa(uid))$q$);
  execute def;
end $$;

create or replace function admin_list_users(q text default null) returns table (id uuid, email text, nombre text, rol user_role, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_casa('casa.personas') then raise exception 'Solo el Director puede ver las cuentas.'; end if;
  return query
    select u.id, u.email::text, p.nombre, p.rol, p.created_at
      from auth.users u join profiles p on p.id = u.id
     where not es_cuenta_empresa(u.id)
       and (q is null or btrim(q) = ''
            or u.email ilike '%' || btrim(q) || '%' or p.nombre ilike '%' || btrim(q) || '%')
     order by p.rol desc, p.nombre nulls last, u.email
     limit 100;
end $$;

-- ════════ 3. Borrar cuentas vacías ════════
-- Vacía: cuenta normal sin ficha, obras, Casa, Club Fan, compras, audiciones, pagos, ventas ni eventos.
create or replace function cuenta_vacia(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = uid and rol = 'fan')
     and not exists (select 1 from casa_members where user_id = uid)
     and not exists (select 1 from production_members where user_id = uid)
     and not exists (select 1 from people where profile_id = uid)
     and not exists (select 1 from fan_members where user_id = uid)
     and not exists (select 1 from member_enrollment where user_id = uid)
     and not exists (select 1 from member_payments where user_id = uid)
     and not exists (select 1 from orders where uid in (buyer_user_id, created_by_staff_id, approved_by, rejected_by))
     and not exists (select 1 from tickets where checked_in_by = uid)
     and not exists (select 1 from audition_applications where uid in (user_id, entered_by, checked_in_by))
     and not exists (select 1 from audition_members where user_id = uid)
     and not exists (select 1 from casting_offers where user_id = uid)
     and not exists (select 1 from orders o join sellers s on s.id = o.seller_id where s.user_id = uid)
     and not exists (select 1 from evento_ordenes where user_id = uid)
     and not exists (select 1 from evento_equipo where user_id = uid)
     and not exists (select 1 from fan_encuentro_lugares where user_id = uid)
     and not exists (select 1 from rubric_teachers where user_id = uid)
     and not exists (select 1 from cuentas_empresa where user_id = uid)
     and not exists (select 1 from direccion_general_darf where user_id = uid)
$$;
revoke all on function cuenta_vacia(uuid) from public, anon, authenticated;

create or replace function cuentas_vacias() returns table (id uuid, email text, nombre text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo el admin.'; end if;
  return query
    select u.id, u.email::text, p.nombre, p.created_at
      from auth.users u join profiles p on p.id = u.id
     where cuenta_vacia(u.id) and u.id <> auth.uid()
     order by p.created_at;
end $$;
revoke all on function cuentas_vacias() from public, anon;
grant execute on function cuentas_vacias() to authenticated;

create or replace function admin_borrar_cuenta(uid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo el admin puede borrar cuentas.'; end if;
  if uid = auth.uid() then raise exception 'No puedes borrar tu propia cuenta desde aquí.'; end if;
  if not cuenta_vacia(uid) then
    raise exception 'Esta cuenta tiene registros (ficha, obras, compras, Club Fan o pagos): no se puede borrar.';
  end if;
  -- La bitácora no conserva datos de una cuenta borrada; solo queda que se borró.
  update audit_log set antes = null, despues = null, actor = null
   where actor = uid or registro_id = uid::text
      or antes->>'user_id' = uid::text or despues->>'user_id' = uid::text;
  begin
    delete from auth.users where id = uid;
  exception when foreign_key_violation then
    raise exception 'Esta cuenta tiene registros en la página: no se puede borrar.';
  end;
  insert into audit_log (tabla, accion, registro_id) values ('cuentas', 'delete', uid::text);
end $$;
revoke all on function admin_borrar_cuenta(uuid) from public, anon;
grant execute on function admin_borrar_cuenta(uuid) to authenticated;

-- ════════ 4. Pagos por ficha y vencimiento por sábado ════════
-- Vencimiento "segundo sábado": se paga el primer sábado del mes y hay una semana de tolerancia.
alter table production_fees add column if not exists vence_sabado boolean not null default false;

create or replace function fee_limite(f production_fees, periodo date) returns date
language sql immutable as $$
  select case when f.vence_sabado
              then periodo + ((6 - extract(dow from periodo)::int + 7) % 7) + 7
              else periodo + (f.dia_limite - 1) end
$$;

do $$
declare def text;
begin
  def := pg_get_functiondef('public.notify_pagos(date)'::regprocedure);
  def := replace(def, $q$limite := v_mes + (f.dia_limite - 1);$q$, $q$limite := fee_limite(f, v_mes);$q$);
  execute def;
  def := pg_get_functiondef('public._discipline_scan_fees(text)'::regprocedure);
  def := replace(def, $q$(g.periodo::date + (f.dia_limite - 1)) < hoy_mx()$q$, $q$fee_limite(f, g.periodo::date) < hoy_mx()$q$);
  execute def;
end $$;

-- Pagos de quien aún no tiene cuenta (por ficha).
create table if not exists member_payments_ficha (
  id uuid primary key default gen_random_uuid(),
  production_id text not null references productions(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  concepto text not null check (concepto in ('mensualidad', 'inscripcion')),
  periodo date not null check (extract(day from periodo) = 1),
  monto numeric(10,2) not null check (monto > 0),
  metodo text not null default 'otro' check (metodo in ('efectivo', 'transferencia', 'tarjeta', 'otro')),
  nota text check (length(nota) <= 300),
  pagado_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (production_id, person_id, concepto, periodo)
);
alter table member_payments_ficha enable row level security;
drop policy if exists member_payments_ficha_read on member_payments_ficha;
create policy member_payments_ficha_read on member_payments_ficha for select
  using (has_perm(production_id, 'mensualidades.gestionar'));

-- Alta, baja y beca de quien aún no tiene cuenta.
create table if not exists ficha_cuotas (
  production_id text not null references productions(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  ingreso date,
  baja_at date,
  beca boolean not null default false,
  sin_inscripcion boolean not null default false,
  primary key (production_id, person_id)
);
alter table ficha_cuotas enable row level security;
drop policy if exists ficha_cuotas_read on ficha_cuotas;
create policy ficha_cuotas_read on ficha_cuotas for select
  using (has_perm(production_id, 'mensualidades.gestionar'));

-- El recibo de un pago viejo que pasa de la ficha a la cuenta no manda aviso.
create or replace function notify_pago() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('darf.sin_aviso_pago', true), '') = 'si' then return new; end if;
  perform notify(array[new.user_id], 'pago',
    'Recibo ' || new.folio || ': ' || pago_concepto(new.concepto, new.periodo) || ', ' || pesos_mx(new.monto),
    production_name(new.production_id) || '. Puedes descargar tu recibo en Mis pagos.',
    '/cuenta/produccion/' || new.production_id || '#cuotas', new.production_id);
  return new;
end $$;

create or replace function pagos_ficha_pasar(p_person uuid) returns int
language plpgsql security definer set search_path = public as $$
declare uid uuid; n int;
begin
  select profile_id into uid from people where id = p_person;
  if uid is null then return 0; end if;
  insert into member_enrollment (production_id, user_id, ingreso, baja_at)
  select c.production_id, uid, coalesce(c.ingreso, hoy_mx()), c.baja_at from ficha_cuotas c where c.person_id = p_person
  on conflict (production_id, user_id) do update
    set ingreso = least(member_enrollment.ingreso, excluded.ingreso),
        baja_at = coalesce(member_enrollment.baja_at, excluded.baja_at);
  insert into member_fee_terms (production_id, user_id, beca, sin_inscripcion)
  select c.production_id, uid, c.beca, c.sin_inscripcion from ficha_cuotas c
   where c.person_id = p_person and (c.beca or c.sin_inscripcion)
  on conflict (production_id, user_id) do update
    set beca = member_fee_terms.beca or excluded.beca,
        sin_inscripcion = member_fee_terms.sin_inscripcion or excluded.sin_inscripcion;
  perform set_config('darf.sin_aviso_pago', 'si', true);
  insert into member_payments (production_id, user_id, periodo, monto, metodo, nota, registrado_at, concepto)
  select f.production_id, uid, f.periodo, f.monto, f.metodo, f.nota, f.pagado_at, f.concepto
    from member_payments_ficha f
   where f.person_id = p_person
     and not exists (select 1 from member_payments p where p.production_id = f.production_id and p.user_id = uid
                      and p.concepto = f.concepto and p.periodo = f.periodo and p.anulado_at is null)
   order by f.pagado_at;
  get diagnostics n = row_count;
  perform set_config('darf.sin_aviso_pago', '', true);
  delete from member_payments_ficha where person_id = p_person;
  delete from ficha_cuotas where person_id = p_person;
  return n;
end $$;
revoke all on function pagos_ficha_pasar(uuid) from public, anon, authenticated;

-- Al ligar la ficha a una cuenta pasan la asistencia (0109) y los pagos.
create or replace function asistencia_ficha_al_ligar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.profile_id is not null and new.profile_id is distinct from old.profile_id then
    perform asistencia_ficha_pasar(new.id);
    perform pagos_ficha_pasar(new.id);
  end if;
  return null;
end $$;

-- Unir fichas duplicadas conserva la asistencia y los pagos por ficha.
create or replace function people_merge(keep uuid, quitar uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare k people%rowtype; d people%rowtype;
begin
  if not has_casa('casa.personas') then raise exception 'Solo el Director puede unir fichas.'; end if;
  if keep = quitar then raise exception 'Elige dos fichas distintas.'; end if;
  select * into k from people where id = keep for update;
  select * into d from people where id = quitar for update;
  if k.id is null or d.id is null then raise exception 'No se encontró una de las fichas.'; end if;
  if k.profile_id is not null and d.profile_id is not null and k.profile_id <> d.profile_id then
    raise exception 'Las dos fichas tienen cuentas distintas; no se pueden unir.';
  end if;
  update production_credits set person_id = keep where person_id = quitar;
  -- 0109: la asistencia histórica de la ficha que se une pasa a la que se queda.
  update rehearsal_attendance_ficha f set person_id = keep where f.person_id = quitar
     and not exists (select 1 from rehearsal_attendance_ficha g where g.person_id = keep and g.rehearsal_id = f.rehearsal_id);
  -- 0111: también sus pagos y su alta por ficha.
  update member_payments_ficha f set person_id = keep where f.person_id = quitar
     and not exists (select 1 from member_payments_ficha g where g.person_id = keep and g.production_id = f.production_id
                      and g.concepto = f.concepto and g.periodo = f.periodo);
  update ficha_cuotas f set person_id = keep where f.person_id = quitar
     and not exists (select 1 from ficha_cuotas g where g.person_id = keep and g.production_id = f.production_id);
  if k.profile_id is null and d.profile_id is not null then
    update people set profile_id = null where id = quitar;
    update people set profile_id = d.profile_id where id = keep;
  end if;
  delete from people where id = quitar;
  perform asistencia_ficha_pasar(keep);
  perform pagos_ficha_pasar(keep);
end $function$;
