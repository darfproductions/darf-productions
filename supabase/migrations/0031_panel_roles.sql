-- 0031: roles por obra, permisos y bitácora (Fase 3, etapa 3A de DARF 2.0)
-- Ver docs/DARF-2.0-FASE-3.md §3 y §9.
--
-- * permissions: catálogo fijo de permisos (módulo.acción).
-- * panel_roles + role_permissions: roles de sistema (fijos) y personalizados
--   (los crea el Director, ej. "Vestuario").
-- * production_members: quién tiene qué rol en cada obra.
-- * has_perm(obra, permiso): la regla única que usarán todas las etapas.
--   Director = profiles.rol 'admin' (todo). Compatibilidad 1.0: 'staff' global
--   conserva ver obra, ventas y puerta en todas las obras.
-- * audit_log: bitácora automática de cambios sensibles (solo la lee el Director).
-- No toca la boletería ni las reglas existentes. Sin "drop".

begin;

-- ──────── Catálogo de permisos ────────
create table permissions (
  id text primary key,
  grupo text not null,
  descripcion text not null,
  orden int not null default 0
);

insert into permissions (id, grupo, descripcion, orden) values
  ('obra.ver',                'Obra',        'Ver el espacio de trabajo de la obra', 1),
  ('obra.editar',             'Obra',        'Editar la página pública de la obra', 2),
  ('obra.publicar',           'Obra',        'Publicar, archivar u ocultar la obra', 3),
  ('permisos.gestionar',      'Obra',        'Dar y quitar roles en la obra', 4),
  ('audiciones.gestionar',    'Audiciones',  'Crear convocatorias y revisar solicitudes', 10),
  ('audiciones.registro',     'Audiciones',  'Registrar asistencia el día de la audición', 11),
  ('audiciones.evaluar',      'Audiciones',  'Calificar como juez', 12),
  ('elenco.gestionar',        'Elenco',      'Asignar papeles y equipos', 20),
  ('expedientes.ver',         'Elenco',      'Ver expedientes del elenco (documentos, emergencias)', 21),
  ('mensualidades.gestionar', 'Elenco',      'Registrar y ver mensualidades', 22),
  ('ensayos.gestionar',       'Elenco',      'Calendario y asistencia de ensayos', 23),
  ('materiales.gestionar',    'Elenco',      'Subir y organizar materiales', 24),
  ('materiales.ver',          'Elenco',      'Ver materiales', 25),
  ('comunicados.enviar',      'Elenco',      'Enviar comunicados', 26),
  ('ventas.ver',              'Boletería',   'Ver órdenes y ventas', 30),
  ('ventas.operar',           'Boletería',   'Aprobar, rechazar y vender en taquilla', 31),
  ('descuentos.gestionar',    'Boletería',   'Crear y editar códigos de descuento', 32),
  ('puerta.validar',          'Boletería',   'Validar boletos (QR) en puerta', 33),
  ('reportes.ver',            'Boletería',   'Ver reportes', 34),
  ('programa.editar',         'Contenido',   'Editar el programa digital', 40),
  ('fanzone.editar',          'Contenido',   'Editar la Fan Zone y galerías', 41);

-- ──────── Roles ────────
create table panel_roles (
  id text primary key check (id ~ '^[a-z0-9_]{2,40}$'),
  nombre text not null check (btrim(nombre) <> ''),
  descripcion text,
  es_sistema boolean not null default false,
  orden int not null default 100,
  created_at timestamptz not null default now()
);

create table role_permissions (
  role_id text not null references panel_roles(id) on delete cascade,
  permission_id text not null references permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

insert into panel_roles (id, nombre, descripcion, es_sistema, orden) values
  ('productor',      'Producción',          'Responsable de la obra: todo dentro de ella', true, 1),
  ('direccion',      'Dirección artística', 'Audiciones, elenco, ensayos, materiales y comunicados', true, 2),
  ('juez',           'Juez',                'Califica en audiciones', true, 3),
  ('registro',       'Mesa de registro',    'Asistencia el día de la audición', true, 4),
  ('taquilla',       'Taquilla',            'Ventas, taquilla, descuentos y reportes', true, 5),
  ('puerta',         'Puerta',              'Valida boletos en puerta', true, 6),
  ('contenido',      'Contenido',           'Página pública, programa y Fan Zone', true, 7),
  ('staff',          'Staff',               'Apoyo de producción: ve la obra y materiales, puerta', true, 8),
  ('maquillaje',     'Maquillaje',          'Ve la obra y los materiales', true, 9),
  ('integrante',     'Integrante',          'Elenco o equipo (portal del elenco, etapa 3E)', true, 10);

insert into role_permissions (role_id, permission_id)
select 'productor', id from permissions
union all select 'direccion', unnest(array['obra.ver','audiciones.gestionar','audiciones.registro','audiciones.evaluar',
  'elenco.gestionar','ensayos.gestionar','materiales.gestionar','materiales.ver','comunicados.enviar'])
union all select 'juez', 'audiciones.evaluar'
union all select 'registro', 'audiciones.registro'
union all select 'taquilla', unnest(array['obra.ver','ventas.ver','ventas.operar','descuentos.gestionar','reportes.ver'])
union all select 'puerta', 'puerta.validar'
union all select 'contenido', unnest(array['obra.ver','obra.editar','programa.editar','fanzone.editar'])
union all select 'staff', unnest(array['obra.ver','materiales.ver','puerta.validar'])
union all select 'maquillaje', unnest(array['obra.ver','materiales.ver']);

-- Los roles de sistema no se editan (una equivocación no debe dejar a nadie sin acceso).
create or replace function protect_system_roles() returns trigger
language plpgsql as $$
declare rid text;
begin
  if tg_table_name = 'panel_roles' then
    if tg_op = 'INSERT' then
      if new.es_sistema then raise exception 'Los roles de sistema solo se crean por migración.'; end if;
      return new;
    end if;
    if old.es_sistema then raise exception 'El rol "%" es de sistema y no se puede modificar.', old.nombre; end if;
    if tg_op = 'UPDATE' and new.es_sistema then raise exception 'Un rol personalizado no puede volverse de sistema.'; end if;
    return coalesce(new, old);
  end if;
  rid := coalesce(new.role_id, old.role_id);
  if exists (select 1 from panel_roles where id = rid and es_sistema) then
    raise exception 'Los permisos de un rol de sistema no se pueden cambiar.';
  end if;
  return coalesce(new, old);
end $$;

create trigger panel_roles_protect before insert or update or delete on panel_roles
  for each row execute function protect_system_roles();
create trigger role_permissions_protect before insert or update or delete on role_permissions
  for each row execute function protect_system_roles();

-- ──────── Quién tiene qué rol en cada obra ────────
create table production_members (
  id uuid primary key default gen_random_uuid(),
  production_id text not null references productions(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role_id text not null references panel_roles(id) on delete restrict,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (production_id, user_id, role_id)
);
create index idx_production_members_user on production_members(user_id);
create index idx_production_members_prod on production_members(production_id);

-- ──────── La regla única de permisos ────────
create or replace function has_perm(pid text, perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    exists (select 1 from profiles where id = auth.uid() and rol = 'admin')
    or exists (
      select 1 from production_members m
      join role_permissions rp on rp.role_id = m.role_id
      where m.user_id = auth.uid() and m.production_id = pid and rp.permission_id = perm
    )
    or (perm in ('obra.ver', 'ventas.ver', 'ventas.operar', 'puerta.validar')
        and exists (select 1 from profiles where id = auth.uid() and rol = 'staff'))
  )
$$;

-- Todas las parejas (obra, permiso) del usuario actual: el panel decide qué mostrar.
create or replace function my_panel_access()
returns table (production_id text, permission_id text)
language sql stable security definer set search_path = public as $$
  select m.production_id, rp.permission_id
    from production_members m join role_permissions rp on rp.role_id = m.role_id
   where m.user_id = auth.uid()
  union
  select p.id, x.perm
    from productions p
    cross join unnest(array['obra.ver', 'ventas.ver', 'ventas.operar', 'puerta.validar']) as x(perm)
   where exists (select 1 from profiles where id = auth.uid() and rol = 'staff')
  union
  select p.id, pe.id
    from productions p cross join permissions pe
   where exists (select 1 from profiles where id = auth.uid() and rol = 'admin')
$$;

-- Miembros de una obra con nombre y correo (sin abrir la tabla de perfiles a todos).
create or replace function panel_list_members(pid text)
returns table (id uuid, user_id uuid, nombre text, email text, role_id text, role_nombre text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (has_perm(pid, 'obra.ver') or has_perm(pid, 'permisos.gestionar')) then
    raise exception 'No tienes acceso a esta obra.';
  end if;
  return query
    select m.id, m.user_id, pr.nombre, u.email::text, m.role_id, r.nombre, m.created_at
      from production_members m
      join profiles pr on pr.id = m.user_id
      join auth.users u on u.id = m.user_id
      join panel_roles r on r.id = m.role_id
     where m.production_id = pid
     order by r.orden, pr.nombre;
end $$;

-- Agregar a alguien por correo (quien agrega no ve la lista de correos de DARF).
create or replace function panel_add_member(pid text, p_email text, p_role text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid; mid uuid;
begin
  if not has_perm(pid, 'permisos.gestionar') then
    raise exception 'No tienes permiso para dar roles en esta obra.';
  end if;
  if not exists (select 1 from productions where id = pid) then
    raise exception 'La obra no existe.';
  end if;
  if not exists (select 1 from panel_roles where id = p_role) then
    raise exception 'El rol no existe.';
  end if;
  select id into uid from auth.users where lower(email) = lower(btrim(p_email));
  if uid is null then
    raise exception 'Esa persona aún no tiene cuenta en DARF. Pídele que se registre primero.';
  end if;
  insert into production_members (production_id, user_id, role_id, created_by)
  values (pid, uid, p_role, auth.uid())
  on conflict (production_id, user_id, role_id) do nothing
  returning id into mid;
  return mid;
end $$;

-- Directorio de cuentas: solo el Director.
create or replace function admin_list_users(q text default null)
returns table (id uuid, email text, nombre text, rol user_role, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo el Director puede ver las cuentas.'; end if;
  return query
    select u.id, u.email::text, p.nombre, p.rol, p.created_at
      from auth.users u join profiles p on p.id = u.id
     where q is null or btrim(q) = ''
        or u.email ilike '%' || btrim(q) || '%' or p.nombre ilike '%' || btrim(q) || '%'
     order by p.rol desc, p.nombre nulls last, u.email
     limit 100;
end $$;

-- Siempre debe quedar al menos un Director.
create or replace function keep_one_director() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.rol = 'admin' and new.rol is distinct from 'admin'
     and not exists (select 1 from profiles where rol = 'admin' and id <> old.id) then
    raise exception 'Debe quedar al menos un Director.';
  end if;
  return new;
end $$;
create trigger profiles_keep_one_director before update of rol on profiles
  for each row execute function keep_one_director();

-- ──────── Bitácora ────────
create table audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid default auth.uid(),
  tabla text not null,
  accion text not null,
  registro_id text,
  production_id text,
  antes jsonb,
  despues jsonb
);
create index idx_audit_log_at on audit_log(at desc);
create index idx_audit_log_prod on audit_log(production_id, at desc);

create or replace function audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  r jsonb := coalesce(n, o);
begin
  insert into audit_log (tabla, accion, registro_id, production_id, antes, despues)
  values (
    tg_table_name,
    lower(tg_op),
    coalesce(r->>'id', concat_ws(':', r->>'role_id', r->>'permission_id')),
    case when tg_table_name = 'productions' then r->>'id' else r->>'production_id' end,
    o, n
  );
  return null;
end $$;

create trigger audit_production_members after insert or update or delete on production_members
  for each row execute function audit_row();
create trigger audit_panel_roles after insert or update or delete on panel_roles
  for each row execute function audit_row();
create trigger audit_role_permissions after insert or update or delete on role_permissions
  for each row execute function audit_row();
create trigger audit_productions after insert or update or delete on productions
  for each row execute function audit_row();
create trigger audit_profiles_rol after update of rol on profiles
  for each row when (old.rol is distinct from new.rol) execute function audit_row();

-- ──────── RLS ────────
alter table permissions enable row level security;
alter table panel_roles enable row level security;
alter table role_permissions enable row level security;
alter table production_members enable row level security;
alter table audit_log enable row level security;

create policy permissions_read on permissions for select to authenticated using (true);
create policy panel_roles_read on panel_roles for select to authenticated using (true);
create policy role_permissions_read on role_permissions for select to authenticated using (true);
create policy panel_roles_admin_write on panel_roles for all to authenticated
  using (is_admin()) with check (is_admin());
create policy role_permissions_admin_write on role_permissions for all to authenticated
  using (is_admin()) with check (is_admin());

create policy production_members_read on production_members for select to authenticated
  using (user_id = auth.uid() or has_perm(production_id, 'obra.ver') or has_perm(production_id, 'permisos.gestionar'));
create policy production_members_insert on production_members for insert to authenticated
  with check (has_perm(production_id, 'permisos.gestionar'));
create policy production_members_delete on production_members for delete to authenticated
  using (has_perm(production_id, 'permisos.gestionar'));

create policy audit_log_admin_read on audit_log for select to authenticated using (is_admin());

-- Nada de esto es para visitantes sin cuenta.
revoke all on permissions, panel_roles, role_permissions, production_members, audit_log from anon;
revoke execute on function has_perm(text, text) from public, anon;
revoke execute on function my_panel_access() from public, anon;
revoke execute on function panel_list_members(text) from public, anon;
revoke execute on function panel_add_member(text, text, text) from public, anon;
revoke execute on function admin_list_users(text) from public, anon;
revoke execute on function protect_system_roles() from public, anon;
revoke execute on function keep_one_director() from public, anon;
revoke execute on function audit_row() from public, anon;
grant execute on function has_perm(text, text) to authenticated;
grant execute on function my_panel_access() to authenticated;
grant execute on function panel_list_members(text) to authenticated;
grant execute on function panel_add_member(text, text, text) to authenticated;
grant execute on function admin_list_users(text) to authenticated;

-- ──────── Verificación ────────
do $$
begin
  if (select count(*) from panel_roles where es_sistema) <> 10 then raise exception 'Faltan roles de sistema'; end if;
  if (select count(*) from role_permissions where role_id = 'productor') <> (select count(*) from permissions) then
    raise exception 'Producción debe tener todos los permisos';
  end if;
end $$;

commit;
