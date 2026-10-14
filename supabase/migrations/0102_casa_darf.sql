-- 0102 · Casa DARF: roles globales de la empresa (Diego 2026-10-14).
--
-- Quienes trabajan para DARF como empresa (no para una obra) tienen permisos globales por área: crear
-- producciones y nombrar a su equipo sin ser parte de él, sitio, eventos DARF, audiciones generales, Club
-- Fan, personas, Equipo DARF, contacto, reportes generales, roles de obra y bitácora. Antes todo eso era
-- "solo el Director" (profiles.rol = 'admin'); el admin sigue pudiendo todo y es el único que da o quita
-- roles de Casa DARF. En el gafete, Casa DARF (franja holográfica) va arriba de cualquier puesto de obra y
-- reemplaza a "Manager": estar en el Equipo DARF de Nosotros ya no cambia el gafete.

-- ════════ Permisos globales ════════
insert into permissions (id, grupo, descripcion, orden) values
  ('casa.producciones', 'Casa DARF', 'Crear y duplicar producciones, destacar en portada y entrar a cualquier obra con todos sus permisos', 100),
  ('casa.sitio',        'Casa DARF', 'Sitio: franja y anuncios de Inicio y Fan Zone general', 101),
  ('casa.eventos',      'Casa DARF', 'Eventos DARF (sin obra)', 102),
  ('casa.audiciones',   'Casa DARF', 'Audiciones generales, registro permanente y plantillas de todos', 103),
  ('casa.club',         'Casa DARF', 'Club Fan: socios y estadísticas', 104),
  ('casa.personas',     'Casa DARF', 'Personas: directorio, cuentas, unir fichas, ligar cuentas y cumpleaños', 105),
  ('casa.equipo',       'Casa DARF', 'Equipo DARF (Nosotros) y portal del equipo general', 106),
  ('casa.contacto',     'Casa DARF', 'Mensajes de contacto y preguntas de DARFY', 107),
  ('casa.reportes',     'Casa DARF', 'Reportes generales de todas las obras', 108),
  ('casa.roles',        'Casa DARF', 'Roles y permisos de las obras', 109),
  ('casa.bitacora',     'Casa DARF', 'Bitácora: quién cambió qué', 110)
on conflict (id) do nothing;

-- ════════ Roles de Casa DARF ════════
-- alcance: 'obra' (se asignan en cada producción) o 'casa' (globales, solo los asigna el admin).
alter table panel_roles add column if not exists alcance text not null default 'obra';
alter table panel_roles drop constraint if exists panel_roles_alcance_check;
alter table panel_roles add constraint panel_roles_alcance_check check (alcance in ('obra', 'casa'));
alter table panel_roles drop constraint if exists panel_roles_categoria_check;
alter table panel_roles add constraint panel_roles_categoria_check
  check (categoria in ('casa', 'direccion_general', 'produccion', 'direccion', 'crew', 'staff'));
alter table panel_roles drop constraint if exists panel_roles_casa_check;
alter table panel_roles add constraint panel_roles_casa_check check ((alcance = 'casa') = (categoria = 'casa')) not valid;
alter table panel_roles validate constraint panel_roles_casa_check;

-- Roles personalizados (es_sistema = false): el admin les ajusta los permisos en Ajustes → Casa DARF.
insert into panel_roles (id, nombre, descripcion, es_sistema, orden, categoria, alcance) values
  ('casa_direccion',     'Dirección DARF', 'Todo lo global de la empresa', false, 1, 'casa', 'casa'),
  ('casa_administracion','Administración', 'Producciones, personas, roles de obra, reportes y bitácora', false, 2, 'casa', 'casa'),
  ('casa_comunicacion',  'Comunicación', 'Sitio, eventos DARF, Club Fan y contacto', false, 3, 'casa', 'casa'),
  ('casa_talento',       'Talento', 'Audiciones generales y personas', false, 4, 'casa', 'casa'),
  ('casa_finanzas',      'Finanzas', 'Reportes generales y Club Fan', false, 5, 'casa', 'casa')
on conflict (id) do nothing;
insert into role_permissions (role_id, permission_id)
select 'casa_direccion', id from permissions where id like 'casa.%'
union all select 'casa_administracion', unnest(array['casa.producciones', 'casa.personas', 'casa.roles', 'casa.reportes', 'casa.bitacora'])
union all select 'casa_comunicacion', unnest(array['casa.sitio', 'casa.eventos', 'casa.club', 'casa.contacto'])
union all select 'casa_talento', unnest(array['casa.audiciones', 'casa.personas'])
union all select 'casa_finanzas', unnest(array['casa.reportes', 'casa.club'])
on conflict do nothing;

-- Los permisos casa.* solo van en roles de casa, y los de obra solo en roles de obra.
create or replace function role_permissions_alcance() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.permission_id like 'casa.%') <> exists (select 1 from panel_roles where id = new.role_id and alcance = 'casa') then
    raise exception 'Ese permiso no corresponde a ese tipo de rol.';
  end if;
  return new;
end $$;
drop trigger if exists role_permissions_alcance on role_permissions;
create trigger role_permissions_alcance before insert or update on role_permissions
  for each row execute function role_permissions_alcance();

-- Un rol de casa no se da dentro de una obra.
create or replace function production_members_alcance() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from panel_roles where id = new.role_id and alcance = 'casa') then
    raise exception 'Los roles de Casa DARF se dan en Ajustes → Casa DARF, no en una obra.';
  end if;
  return new;
end $$;
drop trigger if exists production_members_alcance on production_members;
create trigger production_members_alcance before insert or update on production_members
  for each row execute function production_members_alcance();

-- ════════ Quién es de Casa DARF ════════
create table if not exists casa_members (
  user_id uuid not null references profiles(id) on delete cascade,
  role_id text not null references panel_roles(id) on delete cascade,
  desde date not null default hoy_mx(),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (user_id, role_id)
);
alter table casa_members enable row level security;
drop policy if exists casa_members_read on casa_members;
create policy casa_members_read on casa_members for select to authenticated using (user_id = auth.uid() or is_admin());
drop policy if exists casa_members_admin on casa_members;
create policy casa_members_admin on casa_members for all to authenticated using (is_admin()) with check (is_admin());
revoke all on casa_members from anon;
drop trigger if exists audit_casa_members on casa_members;
create trigger audit_casa_members after insert or update or delete on casa_members for each row execute function audit_row();

create or replace function casa_members_alcance() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from panel_roles where id = new.role_id and alcance = 'casa') then
    raise exception 'Ese rol no es de Casa DARF.';
  end if;
  return new;
end $$;
drop trigger if exists casa_members_alcance on casa_members;
create trigger casa_members_alcance before insert or update on casa_members
  for each row execute function casa_members_alcance();

-- El gafete (y su pase de Wallet) cambia al entrar o salir de Casa DARF.
drop trigger if exists wallet_casa on casa_members;
create trigger wallet_casa after insert or delete on casa_members
  for each row execute function wallet_trg_cuenta();

-- ¿Tengo este permiso global? (el admin siempre)
create or replace function casa_tiene(uid uuid, perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = uid and rol = 'admin')
      or exists (select 1 from casa_members m join role_permissions rp on rp.role_id = m.role_id
                  where m.user_id = uid and rp.permission_id = perm)
$$;
create or replace function has_casa(perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and casa_tiene(auth.uid(), perm)
$$;
create or replace function es_casa(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = uid and rol = 'admin') or exists (select 1 from casa_members where user_id = uid)
$$;
create or replace function mis_permisos_casa() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(id order by orden), '{}') from permissions where id like 'casa.%' and has_casa(id)
$$;

-- Lista de Casa DARF para Ajustes (solo el admin).
create or replace function casa_lista()
returns table (user_id uuid, nombre text, email text, roles text[], desde date)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'No autorizado'; end if;
  return query
    select m.user_id, coalesce(nullif(btrim(p.nombre), ''), split_part(u.email::text, '@', 1)), u.email::text,
           array_agg(m.role_id order by r.orden), min(m.desde)
      from casa_members m join profiles p on p.id = m.user_id join auth.users u on u.id = m.user_id
      join panel_roles r on r.id = m.role_id
     group by m.user_id, p.nombre, u.email
     order by 2;
end $$;

-- Agregar por correo (la cuenta debe existir).
create or replace function casa_agregar(p_email text, p_roles text[], p_desde date default null) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not is_admin() then raise exception 'Solo el Director da roles de Casa DARF.'; end if;
  select id into uid from auth.users where lower(email) = lower(btrim(p_email));
  if uid is null then raise exception 'No hay una cuenta con ese correo. Pídele que se registre primero.'; end if;
  if coalesce(cardinality(p_roles), 0) = 0 then raise exception 'Elige al menos un rol.'; end if;
  delete from casa_members where user_id = uid and role_id <> all(p_roles);
  insert into casa_members (user_id, role_id, desde)
  select uid, r, coalesce(p_desde, (select min(desde) from casa_members where user_id = uid), hoy_mx()) from unnest(p_roles) r
  on conflict (user_id, role_id) do update set desde = coalesce(p_desde, casa_members.desde);
end $$;

-- ════════ Permisos: has_perm y my_panel_access ════════
-- casa.producciones: todos los permisos de obra en cualquier producción, sin ser parte de su equipo.
-- Con pid NULL (lo global), cada área se resuelve con su permiso de casa.
create or replace function has_perm(pid text, perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    exists (select 1 from profiles where id = auth.uid() and rol = 'admin')
    or (pid is not null and perm not like 'casa.%' and (
         exists (select 1 from production_members m join role_permissions rp on rp.role_id = m.role_id
                  where m.user_id = auth.uid() and m.production_id = pid and rp.permission_id = perm)
         or es_direccion_general(pid)
         or has_casa('casa.producciones')
         or (perm = 'ensayos.gestionar' and lider_ensayos(pid, auth.uid()))))
    or (perm in ('obra.ver', 'ventas.ver', 'puerta.validar') and exists (select 1 from profiles where id = auth.uid() and rol = 'staff'))
    or (pid is null and perm like 'audiciones.%' and has_casa('casa.audiciones'))
  )
$$;

create or replace function my_panel_access()
returns table (production_id text, permission_id text)
language sql stable security definer set search_path = public as $$
  select m.production_id, rp.permission_id
    from production_members m join role_permissions rp on rp.role_id = m.role_id
   where m.user_id = auth.uid() and rp.permission_id not like 'casa.%'
  union
  select p.id, x.perm
    from productions p
    cross join unnest(array['obra.ver', 'ventas.ver', 'puerta.validar']) as x(perm)
   where exists (select 1 from profiles where id = auth.uid() and rol = 'staff')
  union
  -- Admin y Casa DARF con casa.producciones: todas las obras con todos los permisos de obra.
  select p.id, pe.id
    from productions p cross join permissions pe
   where pe.id not like 'casa.%' and (exists (select 1 from profiles where id = auth.uid() and rol = 'admin') or has_casa('casa.producciones'))
  union
  -- Dirección general: todos los permisos de obra de su obra.
  select m.production_id, pe.id
    from production_members m cross join permissions pe
   where m.user_id = auth.uid() and m.role_id = 'direccion_general' and pe.id not like 'casa.%'
  union
  -- Producción, dirección y maestros: ensayos y asistencia siempre (y ver la obra para entrar al panel).
  select m.production_id, x.perm
    from production_members m join panel_roles pr on pr.id = m.role_id
    cross join unnest(array['ensayos.gestionar', 'obra.ver']) as x(perm)
   where m.user_id = auth.uid() and pr.categoria in ('direccion_general', 'produccion', 'direccion')
$$;

-- Dirección general de obra: sin permisos de casa (0101 le dio "todos").
alter table role_permissions disable trigger role_permissions_protect;
delete from role_permissions where role_id = 'direccion_general' and permission_id like 'casa.%';
alter table role_permissions enable trigger role_permissions_protect;

-- ════════ Gafete: Casa DARF arriba de todo (reemplaza "Manager") ════════
create or replace function badge_papel(uid uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare rol_app text; v_cargo text; v_nivel int; v_papel text; v_casa text; v_desde int;
begin
  select rol into rol_app from profiles where id = uid;
  -- Casa DARF: su cargo en Nosotros si lo tiene; si no, su rol de casa (el admin: Dirección DARF).
  if rol_app = 'admin' or exists (select 1 from casa_members where user_id = uid) then
    select tm.cargo into v_cargo
      from team_members tm join people pe on pe.id = tm.person_id
     where pe.profile_id = uid order by tm.orden, tm.created_at limit 1;
    select r.nombre into v_casa from casa_members m join panel_roles r on r.id = m.role_id
     where m.user_id = uid order by r.orden limit 1;
    select extract(year from coalesce(min(m.desde), (select created_at from profiles where id = uid)::date))::int into v_desde
      from casa_members m where m.user_id = uid;
    return json_build_object('franja', 'casa', 'papel', coalesce(v_cargo, v_casa, 'Dirección DARF'), 'casa_desde', v_desde);
  end if;

  -- Niveles: 1 dirección general · 2 producción · 3 dirección · 4 elenco · 5 crew · 6 staff.
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

  -- Staff general de DARF: al menos Staff.
  if rol_app = 'staff' and (v_nivel is null or v_nivel > 6) then
    return json_build_object('franja', 'staff', 'papel', 'Staff DARF');
  end if;
  if v_nivel is null then return null; end if;
  return json_build_object('franja', case v_nivel when 1 then 'direccion_general' when 2 then 'produccion' when 3 then 'direccion' when 6 then 'staff' else 'crew' end, 'papel', v_papel);
end $$;

create or replace function badge_puede(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = uid and rol in ('staff', 'admin'))
      or exists (select 1 from casa_members where user_id = uid)
      or exists (select 1 from team_members tm join people pe on pe.id = tm.person_id where pe.profile_id = uid)
      or exists (select 1 from production_members where user_id = uid)
      or exists (select 1 from production_credits c join people pe on pe.id = c.person_id where pe.profile_id = uid and c.activo)
$$;

-- ════════ Lo que era "solo el Director": ahora por permiso de Casa DARF ════════

CREATE OR REPLACE FUNCTION public.admin_list_users(q text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, email text, nombre text, rol user_role, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not has_casa('casa.personas') then raise exception 'Solo el Director puede ver las cuentas.'; end if;
  return query
    select u.id, u.email::text, p.nombre, p.rol, p.created_at
      from auth.users u join profiles p on p.id = u.id
     where q is null or btrim(q) = ''
        or u.email ilike '%' || btrim(q) || '%' or p.nombre ilike '%' || btrim(q) || '%'
     order by p.rol desc, p.nombre nulls last, u.email
     limit 100;
end $function$;

CREATE OR REPLACE FUNCTION public.anuncio_club_ok()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select (has_casa('casa.sitio') or has_casa('casa.club')) or is_fan_member()
$function$;

CREATE OR REPLACE FUNCTION public.audit_actores()
 RETURNS TABLE(id uuid, nombre text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not has_casa('casa.bitacora') then raise exception 'Solo el Director puede ver la bitácora.'; end if;
  return query
    select a.actor, coalesce(nullif(btrim(p.nombre), ''), u.email::text, 'Cuenta borrada')
      from (select distinct actor from audit_log where actor is not null) a
      left join profiles p on p.id = a.actor
      left join auth.users u on u.id = a.actor
     order by 2;
end $function$;

CREATE OR REPLACE FUNCTION public.birthdays(pid text DEFAULT NULL::text)
 RETURNS TABLE(user_id uuid, nombre text, dia integer, mes integer, nacimiento date, foto_path text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if pid is null then
    if not has_casa('casa.personas') then raise exception 'No autorizado.'; end if;
    return query
      select p.id, coalesce(nullif(btrim(p.nombre), ''), split_part(u.email::text, '@', 1)),
             extract(day from p.fecha_nacimiento)::int, extract(month from p.fecha_nacimiento)::int, p.fecha_nacimiento, p.foto_path
        from profiles p join auth.users u on u.id = p.id
       where p.fecha_nacimiento is not null
       order by 4, 3, 2;
  else
    if not (has_perm(pid, 'obra.ver') or is_active_member(pid, auth.uid())) then raise exception 'No autorizado'; end if;
    return query
      with gente as (
        select m.user_id as uid from production_members m
         where m.production_id = pid and (m.role_id <> 'integrante' or is_active_member(pid, m.user_id))
        union
        select pe.profile_id from production_credits c join people pe on pe.id = c.person_id
         where c.production_id = pid and c.activo and pe.profile_id is not null
      )
      select p.id, p.nombre, extract(day from p.fecha_nacimiento)::int, extract(month from p.fecha_nacimiento)::int,
             case when has_casa('casa.personas') then p.fecha_nacimiento end,
             case when has_perm(pid, 'obra.ver') then p.foto_path end
        from gente g join profiles p on p.id = g.uid
       where p.fecha_nacimiento is not null and coalesce(btrim(p.nombre), '') <> ''
       order by 4, 3, 2;
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.can_edit_anuncio(p_lugar text, pid text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select has_casa('casa.sitio') or (pid is not null and p_lugar in ('obra', 'fanzone') and has_perm(pid, 'obra.editar'))
$function$;

CREATE OR REPLACE FUNCTION public.can_edit_pro_profile(pid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select auth.uid() is not null and (
    exists (select 1 from people where id = pid and profile_id = auth.uid())
    or has_casa('casa.personas')
    or exists (select 1 from production_credits c where c.person_id = pid and has_perm(c.production_id, 'elenco.gestionar')))
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_person_file(uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select auth.uid() is not null and (
    has_casa('casa.personas')
    or exists (select 1 from production_members m
                where m.user_id = uid and m.role_id = 'integrante' and has_perm(m.production_id, 'expedientes.ver')))
$function$;

CREATE OR REPLACE FUNCTION public.can_see_avatar(uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select auth.uid() is not null and (
    uid = auth.uid() or has_casa('casa.personas')
    or exists (select 1 from production_members m where m.user_id = uid and has_perm(m.production_id, 'obra.ver'))
    or exists (select 1 from rehearsals r
                where auth.uid() = any(r.encargados) and r.abierto_at is not null and r.cerrado_at is null
                  and (now() at time zone 'America/Mexico_City')::date = (r.inicia at time zone 'America/Mexico_City')::date
                  and encargado_activo(r.id) and rehearsal_cites(r.id, uid)))
$function$;

CREATE OR REPLACE FUNCTION public.can_view_person(pid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select auth.uid() is not null and (
    has_casa('casa.personas')
    or exists (select 1 from production_credits c where c.person_id = pid
                and (has_perm(c.production_id, 'elenco.gestionar') or has_perm(c.production_id, 'obra.editar'))))
$function$;

CREATE OR REPLACE FUNCTION public.can_view_talent(uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select auth.uid() is not null and (
    has_casa('casa.personas')
    or exists (select 1 from production_members m where m.user_id = uid
                and (has_perm(m.production_id, 'elenco.gestionar') or has_perm(m.production_id, 'audiciones.gestionar')))
    or exists (select 1 from casting_offers o where o.user_id = uid and has_perm(o.production_id, 'elenco.gestionar'))
    or exists (select 1 from audition_applications a where a.user_id = uid and audition_perm(a.audition_id, 'audiciones.gestionar')))
$function$;

CREATE OR REPLACE FUNCTION public.is_pro_team(pid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select auth.uid() is not null and (
    has_casa('casa.personas') or exists (select 1 from production_credits c where c.person_id = pid and has_perm(c.production_id, 'elenco.gestionar')))
$function$;

CREATE OR REPLACE FUNCTION public.director_capacity()
 RETURNS TABLE(production_id text, capacidad integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not has_casa('casa.reportes') then raise exception 'Solo el Director.'; end if;
  return query
    select p.id, (select coalesce(sum(performance_capacity(f.id)), 0)::int from performances f where f.production_id = p.id)
      from productions p;
end $function$;

CREATE OR REPLACE FUNCTION public.director_overview()
 RETURNS TABLE(production_id text, nombre text, estado text, funciones integer, funciones_futuras integer, asientos integer, boletos integer, asistieron integer, ingresos numeric, pendientes integer, cobrado_taller numeric, integrantes_activos integer, solicitudes integer, cerrado_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not has_casa('casa.reportes') then raise exception 'Solo el Director.'; end if;
  return query
    select p.id, p.nombre, p.estado,
           (select count(*)::int from performances f where f.production_id = p.id),
           (select count(*)::int from performances f where f.production_id = p.id and f.starts_at > now()),
           (select count(*)::int from seats s where s.production_id = p.id and s.is_active),
           (select count(*)::int from tickets t join orders o on o.id = t.order_id join performances f on f.id = o.performance_id
             where f.production_id = p.id and o.status = 'aprobado' and t.is_active),
           (select count(*)::int from tickets t join orders o on o.id = t.order_id join performances f on f.id = o.performance_id
             where f.production_id = p.id and o.status = 'aprobado' and t.is_active and t.checked_in_at is not null),
           (select coalesce(sum(o.total), 0) from orders o join performances f on f.id = o.performance_id
             where f.production_id = p.id and o.status = 'aprobado'),
           (select count(*)::int from orders o join performances f on f.id = o.performance_id
             where f.production_id = p.id and o.status = 'pendiente'),
           (select coalesce(sum(mp.monto), 0) from member_payments mp where mp.production_id = p.id and mp.anulado_at is null),
           (select count(*)::int from production_members m where m.production_id = p.id and m.role_id = 'integrante' and is_active_member(p.id, m.user_id)),
           (select count(*)::int from audition_applications a join auditions au on au.id = a.audition_id where au.production_id = p.id),
           (select max(c.cerrado_at) from season_closures c where c.production_id = p.id and c.reabierto_at is null)
      from productions p
     order by p.created_at desc;
end $function$;

CREATE OR REPLACE FUNCTION public.director_sellers()
 RETURNS TABLE(nombre text, codigo text, tipo text, obras integer, ordenes integer, monto numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not has_casa('casa.reportes') then raise exception 'Solo el Director.'; end if;
  return query
    select coalesce((select nullif(btrim(pr.nombre), '') from profiles pr where pr.id = s.user_id), s.nombre),
           s.codigo, case when s.user_id is null then 'externo' else 'cuenta' end,
           count(distinct f.production_id)::int, count(*)::int, sum(o.total)
      from orders o join performances f on f.id = o.performance_id join sellers s on s.id = o.seller_id
     where o.status = 'aprobado'
     group by s.id
     order by sum(o.total) desc
     limit 50;
end $function$;

CREATE OR REPLACE FUNCTION public.evento_editor(pid text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case when pid is null then has_casa('casa.eventos') else has_perm(pid, 'fanzone.editar') end
$function$;

CREATE OR REPLACE FUNCTION public.fan_club_resumen()
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case when has_casa('casa.club') then json_build_object('socios', count(*), 'fundadores', count(*) filter (where numero <= 100)) end
    from fan_members
$function$;

CREATE OR REPLACE FUNCTION public.manages_any_audition()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select auth.uid() is not null and (
    has_casa('casa.audiciones')
    or exists (select 1 from production_members m join role_permissions rp on rp.role_id = m.role_id
                where m.user_id = auth.uid() and rp.permission_id = 'audiciones.gestionar')
    or exists (select 1 from audition_members m join role_permissions rp on rp.role_id = m.role_id
                where m.user_id = auth.uid() and rp.permission_id = 'audiciones.gestionar'))
$function$;

CREATE OR REPLACE FUNCTION public.manages_production_auditions()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select auth.uid() is not null and (
    has_casa('casa.audiciones')
    or exists (select 1 from production_members m join role_permissions rp on rp.role_id = m.role_id
                where m.user_id = auth.uid() and rp.permission_id = 'audiciones.gestionar'))
$function$;

CREATE OR REPLACE FUNCTION public.panel_buscar(q text)
 RETURNS TABLE(tipo text, titulo text, detalle text, href text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t text := sin_acentos(btrim(coalesce(q, ''))); cod text := upper(btrim(coalesce(q, ''))); -- 0090: el código sin "DARF-" ("83F2") también encuentra la orden
begin
  if auth.uid() is null then raise exception 'No autorizado'; end if;
  if cod ~ '^[0-9A-F]{4,6}$' then cod := 'DARF-' || cod; end if;
  if char_length(t) < 2 then return; end if;
  return query
  (
    -- Órdenes de boletos por código (DARF-XXXXXX): quien ve las ventas de esa obra.
    select 'orden'::text, o.order_code, coalesce(o.buyer_nombre, '') || ' · ' || pr.nombre || ' · ' || o.status,
           '/panel/producciones/' || pf.production_id || '/boletos?codigo=' || o.order_code
      from orders o join performances pf on pf.id = o.performance_id join productions pr on pr.id = pf.production_id
     where cod ~ '^DARF-' and o.order_code like cod || '%' and has_perm(pf.production_id, 'ventas.ver')
     limit 5
  ) union all (
    -- Órdenes de eventos (EV-XXXXXX): quien cobra en ese evento.
    select 'orden_evento', o.codigo, display_name(o.user_id) || ' · ' || evento_nombre(e) || ' · ' || o.status,
           '/panel/eventos#e-' || e.id
      from evento_ordenes o join fan_encuentros e on e.id = o.encuentro_id
     where cod ~ '^EV-' and o.codigo like cod || '%' and evento_puede_fila(e.id, e.production_id, 'cobros')
     limit 5
  ) union all (
    -- Personas: el Director, todas (su ficha); los demás, las de sus obras con expedientes.
    select 'persona', coalesce(nullif(btrim(p.nombre), ''), u.email::text), u.email::text, '/panel/talento/' || p.id
      from profiles p join auth.users u on u.id = p.id
     where has_casa('casa.personas') and (coincide(p.nombre, t) or lower(u.email) like '%' || t || '%')
     order by p.nombre
     limit 8
  ) union all (
    select distinct on (m.user_id) 'persona', coalesce(nullif(btrim(p.nombre), ''), 'Sin nombre'), pr.nombre,
           '/panel/producciones/' || m.production_id || '/expedientes/' || m.user_id
      from production_members m join profiles p on p.id = m.user_id join productions pr on pr.id = m.production_id
     where not has_casa('casa.personas') and has_perm(m.production_id, 'expedientes.ver') and m.role_id = 'integrante'
       and coincide(p.nombre, t)
     order by m.user_id
     limit 8
  ) union all (
    select 'convocatoria', a.titulo, coalesce(pr.nombre, 'General') || ' · ' || a.estado, '/panel/audiciones/' || a.id
      from auditions a left join productions pr on pr.id = a.production_id
     where coincide(a.titulo, t) and (audition_team(a.id) or (a.production_id is null and has_casa('casa.audiciones')))
     order by a.created_at desc
     limit 5
  ) union all (
    select 'evento', evento_nombre(e), coalesce(pr.nombre, 'DARF') || ' · ' || to_char(evento_cuando(e) at time zone 'America/Mexico_City', 'DD/MM HH24:MI'),
           '/panel/eventos#e-' || e.id
      from fan_encuentros e left join productions pr on pr.id = e.production_id
     where coincide(evento_nombre(e), t) and evento_puede_fila(e.id, e.production_id, 'ver')
       and evento_fin(e) > now() - interval '30 days'
     order by evento_cuando(e)
     limit 5
  );
end $function$;

CREATE OR REPLACE FUNCTION public.panel_duplicate_production(src text, p_id text, p_nombre text, p_temporada text, copiar_canciones boolean DEFAULT true, copiar_equipos boolean DEFAULT true, copiar_permisos boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a record; new_act uuid;
begin
  if not has_casa('casa.producciones') then raise exception 'Solo Casa DARF (Producciones) puede duplicar obras.'; end if;
  if not exists (select 1 from productions where id = src) then raise exception 'La obra original no existe.'; end if;
  if exists (select 1 from productions where id = p_id) then raise exception 'Ya existe una obra con ese identificador.'; end if;

  insert into productions (id, nombre, venue, price, estado, frase, sinopsis, temporada, duracion, clasificacion, basada_en,
                           color_fondo, color_superficie, color_texto, color_acento, logo_path, ambiente_path)
  select p_id, p_nombre, venue, price, 'borrador', frase, sinopsis, p_temporada, duracion, clasificacion, basada_en,
         color_fondo, color_superficie, color_texto, color_acento, logo_path, ambiente_path
    from productions where id = src;

  insert into production_facts (production_id, etiqueta, valor, orden)
  select p_id, etiqueta, valor, orden from production_facts where production_id = src;

  if copiar_canciones then
    for a in select * from production_acts where production_id = src order by orden loop
      insert into production_acts (production_id, nombre, orden) values (p_id, a.nombre, a.orden) returning id into new_act;
      insert into production_songs (production_id, act_id, titulo, orden)
      select p_id, new_act, titulo, orden from production_songs where act_id = a.id;
    end loop;
    insert into production_songs (production_id, act_id, titulo, orden)
    select p_id, null, titulo, orden from production_songs where production_id = src and act_id is null;
  end if;

  if copiar_equipos then
    insert into production_credits (production_id, person_id, tipo, papel, orden)
    select p_id, person_id, tipo, papel, orden from production_credits
     where production_id = src and tipo in ('creativo', 'produccion', 'crew', 'tecnico');
  end if;

  if copiar_permisos then
    insert into production_members (production_id, user_id, role_id, created_by)
    select p_id, user_id, role_id, auth.uid() from production_members where production_id = src;
  end if;

  return p_id;
end $function$;

CREATE OR REPLACE FUNCTION public.panel_pendientes()
 RETURNS TABLE(tipo text, production_id text, ref_id text, ref_titulo text, n integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare gestiona_aud boolean;
begin
  if auth.uid() is null then raise exception 'No autorizado'; end if;
  gestiona_aud := has_casa('casa.audiciones') or exists (select 1 from my_panel_access() a where a.permission_id = 'audiciones.gestionar');
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
          or (a.production_id is null and not coalesce(a.permanente, false) and has_casa('casa.audiciones'))
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
end $function$;

CREATE OR REPLACE FUNCTION public.panel_set_site_banner(p_estilo text, p_color text, p_activa boolean, items jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if not has_casa('casa.sitio') then raise exception 'Solo Casa DARF (Sitio) puede editar la franja del sitio.'; end if;
  if jsonb_array_length(coalesce(items, '[]'::jsonb)) > 10 then raise exception 'Máximo 10 avisos en la franja.'; end if;
  insert into site_banner (id, estilo, color, activa, updated_at, updated_by)
  values (true, coalesce(p_estilo, 'corre'), nullif(btrim(coalesce(p_color, '')), ''), coalesce(p_activa, true), now(), auth.uid())
  on conflict (id) do update
    set estilo = excluded.estilo, color = excluded.color, activa = excluded.activa, updated_at = now(), updated_by = auth.uid();
  delete from site_banner_items where true;
  insert into site_banner_items (texto, enlace, boton, inicia, termina, orden)
  select btrim(e->>'texto'), nullif(btrim(coalesce(e->>'enlace', '')), ''), nullif(btrim(coalesce(e->>'boton', '')), ''),
         nullif(e->>'inicia', '')::timestamptz, nullif(e->>'termina', '')::timestamptz, n
    from jsonb_array_elements(coalesce(items, '[]'::jsonb)) with ordinality as x(e, n)
   where coalesce(btrim(e->>'texto'), '') <> '';
end $function$;

CREATE OR REPLACE FUNCTION public.people_directory(q text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, profile_id uuid, nombre text, email text, obras text[], creditos integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not has_casa('casa.personas') then raise exception 'Solo el Director.'; end if;
  return query
    select pe.id, pe.profile_id, pe.nombre, u.email::text,
           coalesce((select array_agg(distinct p.nombre) from production_credits c join productions p on p.id = c.production_id where c.person_id = pe.id), '{}'),
           (select count(*)::int from production_credits c where c.person_id = pe.id)
      from people pe left join auth.users u on u.id = pe.profile_id
     where q is null or btrim(q) = '' or unaccent_lower(pe.nombre) like '%' || unaccent_lower(btrim(q)) || '%'
     order by unaccent_lower(pe.nombre)
     limit 300;
end $function$;

CREATE OR REPLACE FUNCTION public.people_link_account(pid uuid, p_email text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare uid uuid; otra uuid;
begin
  if not has_casa('casa.personas') then raise exception 'Solo el Director puede ligar fichas.'; end if;
  select id into uid from auth.users where lower(email) = lower(btrim(p_email));
  if uid is null then raise exception 'Ese correo no tiene cuenta en DARF.'; end if;
  select id into otra from people where profile_id = uid and id <> pid;
  if otra is not null then
    raise exception 'Esa cuenta ya está ligada a otra ficha. Une las dos fichas en lugar de ligar.';
  end if;
  update people set profile_id = uid where id = pid;
  if not found then raise exception 'No se encontró la ficha.'; end if;
end $function$;

CREATE OR REPLACE FUNCTION public.people_link_suggestions()
 RETURNS TABLE(person_id uuid, persona text, user_id uuid, email text, cuenta text, motivo text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not has_casa('casa.personas') then raise exception 'Solo el Director.'; end if;
  return query
    with cuentas as (
      select pr.id as uid, pr.nombre as nombre, 'Mismo nombre en su perfil' as motivo
        from profiles pr where coalesce(btrim(pr.nombre), '') <> ''
      union
      select a.user_id, a.nombre, 'Mismo nombre en una audición' from audition_applications a where a.user_id is not null
    )
    select distinct on (pe.id, c.uid) pe.id, pe.nombre, c.uid, u.email::text, c.nombre, c.motivo
      from people pe
      join cuentas c on unaccent_lower(btrim(c.nombre)) = unaccent_lower(btrim(pe.nombre))
      join auth.users u on u.id = c.uid
     where pe.profile_id is null
       and not exists (select 1 from people x where x.profile_id = c.uid)
     order by pe.id, c.uid, c.motivo
     limit 200;
end $function$;

CREATE OR REPLACE FUNCTION public.people_merge(keep uuid, quitar uuid)
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
  if k.profile_id is null and d.profile_id is not null then
    update people set profile_id = null where id = quitar;
    update people set profile_id = d.profile_id where id = keep;
  end if;
  delete from people where id = quitar;
end $function$;

CREATE OR REPLACE FUNCTION public.talent_purchases(uid uuid)
 RETURNS TABLE(order_code text, obra text, funcion timestamp with time zone, estado text, total numeric, boletos integer, asistio integer, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not has_casa('casa.personas') then raise exception 'Solo el Director.'; end if;
  return query
    select o.order_code, p.nombre, pf.starts_at, o.status::text, o.total,
           (select count(*)::int from tickets t where t.order_id = o.id),
           (select count(*)::int from tickets t where t.order_id = o.id and t.checked_in_at is not null),
           o.created_at
      from orders o
      join performances pf on pf.id = o.performance_id
      join productions p on p.id = pf.production_id
     where o.buyer_user_id = uid
     order by pf.starts_at desc;
end $function$;

CREATE OR REPLACE FUNCTION public.set_featured(pid text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if pid is null then
    if not (has_casa('casa.producciones') or exists (select 1 from productions where destacada and has_perm(id, 'obra.publicar'))) then
      raise exception 'No autorizado';
    end if;
  else
    if not has_perm(pid, 'obra.publicar') then raise exception 'No autorizado'; end if;
    if not exists (select 1 from productions where id = pid and estado = 'publicada') then
      raise exception 'Solo se puede destacar una obra publicada.';
    end if;
  end if;
  perform set_config('darf.featured', '1', true);
  update productions set destacada = false where destacada and id is distinct from pid;
  if pid is not null then update productions set destacada = true where id = pid; end if;
  perform set_config('darf.featured', '', true);
end $function$;

CREATE OR REPLACE FUNCTION public.team_can_manage(pid text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case when pid is null then has_casa('casa.equipo') else has_perm(pid, 'equipo.gestionar') end
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_people()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select auth.uid() is not null and (
    has_casa('casa.personas') or has_casa('casa.producciones')
    or exists (
      select 1 from production_members m join role_permissions rp on rp.role_id = m.role_id
      where m.user_id = auth.uid() and rp.permission_id in ('obra.editar', 'elenco.gestionar')
    )
  )
$function$;

CREATE OR REPLACE FUNCTION public.contact_equipo()
 RETURNS TABLE(id uuid, nombre text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (is_staff() or has_casa('casa.contacto')) then raise exception 'No autorizado.'; end if;
  return query
    select p.id, coalesce(nullif(btrim(p.nombre), ''), u.email::text)
      from profiles p join auth.users u on u.id = p.id
     where (p.rol in ('staff', 'admin') or casa_tiene(p.id, 'casa.contacto'))
     order by 2;
end $function$;

CREATE OR REPLACE FUNCTION public.contact_asignar(p_id uuid, p_uid uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare m contact_messages%rowtype;
begin
  if not (is_staff() or has_casa('casa.contacto')) then raise exception 'No autorizado.'; end if;
  if p_uid is not null and not exists (select 1 from profiles where id = p_uid and (rol in ('staff', 'admin') or casa_tiene(id, 'casa.contacto'))) then
    raise exception 'Esa persona no atiende Contacto.';
  end if;
  update contact_messages set asignado_a = p_uid, asignado_at = case when p_uid is null then null else now() end
   where id = p_id and asignado_a is distinct from p_uid
  returning * into m;
  if not found then
    if not exists (select 1 from contact_messages where id = p_id) then raise exception 'No encontramos ese mensaje.'; end if;
    return;
  end if;
  if p_uid is not null and p_uid is distinct from auth.uid() then
    perform notify(array[p_uid], 'contacto', 'Te asignaron un mensaje de contacto',
      concat_ws(' · ', m.nombre, nullif(m.asunto, '')), '/panel/contacto?ver=mios', null);
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.contact_responder(p_id uuid, p_canal text, p_nota text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (is_staff() or has_casa('casa.contacto')) then raise exception 'No autorizado.'; end if;
  if p_canal not in ('correo', 'whatsapp', 'telefono', 'otro') then raise exception 'Elige por dónde respondiste.'; end if;
  update contact_messages
     set respondido_at = now(), respondido_por = auth.uid(), respuesta_canal = p_canal,
         respuesta_nota = nullif(left(btrim(coalesce(p_nota, '')), 500), ''), leido = true
   where id = p_id;
  if not found then raise exception 'No encontramos ese mensaje.'; end if;
end $function$;

CREATE OR REPLACE FUNCTION public.contact_reabrir(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (is_staff() or has_casa('casa.contacto')) then raise exception 'No autorizado.'; end if;
  update contact_messages set respondido_at = null, respondido_por = null, respuesta_canal = null, respuesta_nota = null
   where id = p_id;
  if not found then raise exception 'No encontramos ese mensaje.'; end if;
end $function$;

CREATE OR REPLACE FUNCTION public.mark_contact_message_read(target_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (is_staff() or has_casa('casa.contacto')) then
    raise exception 'not authorized';
  end if;

  update contact_messages
  set leido = true
  where id = target_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.in_production_team(pid text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select auth.uid() is not null and (
    exists (select 1 from profiles where id = auth.uid() and rol in ('admin', 'staff')) or has_casa('casa.producciones')
    or exists (select 1 from production_members m join role_permissions rp on rp.role_id = m.role_id
                where m.user_id = auth.uid() and m.production_id = pid)
  )
$function$;

CREATE OR REPLACE FUNCTION public.notify_contact()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  begin
    perform notify((select coalesce(array_agg(p.id), '{}') from profiles p
                     where casa_tiene(p.id, 'casa.contacto')
                       and not exists (select 1 from notifications x where x.user_id = p.id and x.tipo = 'contacto'
                                         and x.read_at is null and x.created_at > now() - interval '1 hour')),
      'contacto', 'Nuevo mensaje de contacto', concat_ws(' · ', new.nombre, new.asunto), '/panel/contacto', null);
  exception when others then null;
  end;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.credencial_de(uid uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare b badges; m fan_members; nivel text; papel json;
begin
  select * into b from badges where user_id = uid;
  if not found then return null; end if;
  select * into m from fan_members where user_id = uid;
  nivel := credencial_nivel(uid);
  papel := case when nivel = 'equipo' then badge_papel(uid) end;
  return json_build_object(
    'token', b.token, 'codigo', b.codigo, 'nivel', nivel, 'desde', (select created_at from profiles where id = uid),
    'franja', papel->>'franja', 'papel', papel->>'papel', 'casa_desde', (papel->>'casa_desde')::int,
    'socio', case when m.user_id is not null then json_build_object('numero', m.numero, 'desde', m.created_at, 'fundador', m.numero <= 100) end,
    'compartir_telefono', b.compartir_telefono, 'compartir_correo', b.compartir_correo,
    'compartir_instagram', b.compartir_instagram, 'compartir_perfil', b.compartir_perfil);
end $function$;

CREATE OR REPLACE FUNCTION public.badge_publico(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare b badges; pr profiles; persona people; pro pro_profiles; papel json; menor boolean; correo text; m fan_members; nivel text; corto text;
begin
  select * into b from badges where token = p_token;
  if not found then return null; end if;
  select * into pr from profiles where id = b.user_id;
  select * into m from fan_members where user_id = b.user_id;
  nivel := credencial_nivel(b.user_id);
  corto := btrim(coalesce(nullif(btrim(pr.nombres), ''), split_part(btrim(coalesce(pr.nombre, '')), ' ', 1)) || ' ' ||
           coalesce(left(nullif(btrim(coalesce(nullif(btrim(pr.apellidos), ''), nullif(split_part(btrim(coalesce(pr.nombre, '')), ' ', 2), ''))), ''), 1) || '.', ''));
  if nivel <> 'equipo' then
    return json_build_object('nivel', nivel, 'nombre', corto,
      'socio', case when m.user_id is not null then json_build_object('numero', m.numero, 'desde', m.created_at, 'fundador', m.numero <= 100) end);
  end if;
  papel := badge_papel(b.user_id);
  select * into persona from people where profile_id = b.user_id;
  if persona.id is not null then select * into pro from pro_profiles where person_id = persona.id; end if;
  menor := pr.fecha_nacimiento is not null and pr.fecha_nacimiento > (hoy_mx() - interval '18 years');
  select email into correo from auth.users where id = b.user_id;
  return json_build_object(
    'nivel', 'equipo', 'nombre', coalesce(pr.nombre, persona.nombre, ''),
    'franja', papel->>'franja', 'papel', papel->>'papel', 'casa_desde', (papel->>'casa_desde')::int,
    'socio', case when m.user_id is not null then json_build_object('numero', m.numero, 'desde', m.created_at, 'fundador', m.numero <= 100) end,
    'retrato_path', case when pro.person_id is not null and pro_is_public(pro.person_id) then pro.retrato_path end,
    'telefono', case when b.compartir_telefono and not menor then pr.telefono end,
    'correo', case when b.compartir_correo and not menor then correo end,
    'instagram', case when b.compartir_instagram then pro.instagram end,
    'perfil', case when b.compartir_perfil and pro.person_id is not null and pro_is_public(pro.person_id) then pro.slug end);
end $function$;

CREATE OR REPLACE FUNCTION public.badge_mio()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare b badges; papel json;
begin
  if auth.uid() is null or not badge_puede(auth.uid()) then return null; end if;
  papel := badge_papel(auth.uid());
  if papel is null then return null; end if;
  select * into b from badges where user_id = auth.uid();
  if not found then
    insert into badges (user_id, token, codigo) values (auth.uid(), badge_nuevo_token(), badge_nuevo_codigo()) returning * into b;
  end if;
  return json_build_object('token', b.token, 'codigo', b.codigo,
    'compartir_telefono', b.compartir_telefono, 'compartir_correo', b.compartir_correo,
    'compartir_instagram', b.compartir_instagram, 'compartir_perfil', b.compartir_perfil,
    'franja', papel->>'franja', 'papel', papel->>'papel', 'casa_desde', (papel->>'casa_desde')::int);
end $function$;

-- ════════ Políticas: lo mismo que tenía el Director, por permiso de Casa DARF ════════
drop policy if exists productions_write_casa on public.productions;
create policy productions_write_casa on public.productions for all to public
  using (has_casa('casa.producciones'))
  with check (has_casa('casa.producciones'));
drop policy if exists people_write_casa on public.people;
create policy people_write_casa on public.people for all to authenticated
  using (has_casa('casa.personas'))
  with check (has_casa('casa.personas'));
drop policy if exists site_banner_casa on public.site_banner;
create policy site_banner_casa on public.site_banner for all to authenticated
  using (has_casa('casa.sitio'))
  with check (has_casa('casa.sitio'));
drop policy if exists site_banner_items_casa on public.site_banner_items;
create policy site_banner_items_casa on public.site_banner_items for all to authenticated
  using (has_casa('casa.sitio'))
  with check (has_casa('casa.sitio'));
drop policy if exists fan_members_casa on public.fan_members;
create policy fan_members_casa on public.fan_members for select to authenticated
  using (has_casa('casa.club'));
drop policy if exists team_members_casa on public.team_members;
create policy team_members_casa on public.team_members for all to authenticated
  using (has_casa('casa.equipo'))
  with check (has_casa('casa.equipo'));
drop policy if exists audit_log_read_casa on public.audit_log;
create policy audit_log_read_casa on public.audit_log for select to authenticated
  using (has_casa('casa.bitacora'));
drop policy if exists panel_roles_write_casa on public.panel_roles;
create policy panel_roles_write_casa on public.panel_roles for all to authenticated
  using ((has_casa('casa.roles')) and alcance = 'obra')
  with check ((has_casa('casa.roles')) and alcance = 'obra');
drop policy if exists role_permissions_write_casa on public.role_permissions;
create policy role_permissions_write_casa on public.role_permissions for all to authenticated
  using ((has_casa('casa.roles')) and exists (select 1 from panel_roles r where r.id = role_id and r.alcance = 'obra') and permission_id not like 'casa.%')
  with check ((has_casa('casa.roles')) and exists (select 1 from panel_roles r where r.id = role_id and r.alcance = 'obra') and permission_id not like 'casa.%');
drop policy if exists audition_templates_own_update_casa on public.audition_templates;
create policy audition_templates_own_update_casa on public.audition_templates for update to authenticated
  using (((created_by = auth.uid()) OR has_casa('casa.audiciones')))
  with check (((created_by = auth.uid()) OR has_casa('casa.audiciones')));
drop policy if exists audition_templates_own_remove_casa on public.audition_templates;
create policy audition_templates_own_remove_casa on public.audition_templates for delete to authenticated
  using (((created_by = auth.uid()) OR has_casa('casa.audiciones')));
drop policy if exists contact_messages_read_casa on public.contact_messages;
create policy contact_messages_read_casa on public.contact_messages for select to public
  using (has_casa('casa.contacto'));
drop policy if exists darfy_faq_write_casa on public.darfy_faq;
create policy darfy_faq_write_casa on public.darfy_faq for all to authenticated
  using (has_casa('casa.contacto'))
  with check (has_casa('casa.contacto'));
drop policy if exists darfy_unanswered_read_casa on public.darfy_unanswered;
create policy darfy_unanswered_read_casa on public.darfy_unanswered for select to authenticated
  using (has_casa('casa.contacto'));
drop policy if exists darfy_unanswered_remove_casa on public.darfy_unanswered;
create policy darfy_unanswered_remove_casa on public.darfy_unanswered for delete to authenticated
  using (has_casa('casa.contacto'));

-- ════════ Permisos de ejecución ════════
revoke execute on function casa_tiene(uuid, text), has_casa(text), es_casa(uuid), mis_permisos_casa(), casa_lista(),
  casa_agregar(text, text[], date) from public, anon;
grant execute on function has_casa(text), es_casa(uuid), mis_permisos_casa(), casa_lista(), casa_agregar(text, text[], date) to authenticated;
-- Las políticas también se evalúan para visitantes sin sesión (has_casa les responde que no).
grant execute on function has_casa(text) to anon;
revoke execute on function role_permissions_alcance(), production_members_alcance(), casa_members_alcance() from public, anon, authenticated;
