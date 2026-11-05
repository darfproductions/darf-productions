-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV" (la base de darfproductions.com).
-- 0135: crear producción paso a paso (fechas tentativas, personajes completos, puestos del equipo), ficha de la
-- producción, perfil artístico en audiciones con la ficha del personaje para el juez, y borrar una obra.
-- No cambia ni borra nada de lo que ya existe (los personajes actuales quedan como "Protagonistas"; los puedes mover).
-- Se puede correr más de una vez. Si la base no es DEV, aborta.
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
  if to_regprocedure('public.audition_revisar(uuid,uuid,text,text)') is null then
    raise exception 'ABORTADO: primero corre el script de 0134.';
  end if;
end $$;
-- 0135 (Diego 2026-11-05): crear una producción paso a paso y que el panel sea "la base de todo".
--   * Ficha tentativa: fechas por mes (un mes o un rango "Marzo – Abril 2027") y paso del asistente en que se quedó
--     (para retomar). Hitos por mes (audiciones, primer ensayo, estreno…) y lugares (teatro, sala de ensayo…).
--   * Personajes completos: protagonista / apoyo / ensamble (los grupos de ensamble son personajes con cupo),
--     perfil (género, edad que aparenta), tesitura, canto/baile/actuación, habilidades, rasgos y canciones.
--   * Puestos del equipo: "Dirección vocal", etc. Cada puesto se llena con una cuenta, con nombre y correo
--     (le llega la invitación y al aceptar queda ligado) o se deja como hueco. Da sus roles del panel y aparece
--     en los créditos de la obra.
--   * Borrar una obra completa (solo Casa DARF, escribiendo su nombre para confirmar).
-- Precede: 0134.

begin;

-- ════════ 1. Ficha tentativa ════════
alter table productions add column if not exists tentativa_desde date;
alter table productions add column if not exists tentativa_hasta date;
alter table productions add column if not exists asistente_paso smallint;
do $$ begin
  alter table productions add constraint productions_tentativa_mes check (
    (tentativa_desde is null or extract(day from tentativa_desde) = 1)
    and (tentativa_hasta is null or (tentativa_desde is not null and extract(day from tentativa_hasta) = 1 and tentativa_hasta >= tentativa_desde)));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table productions add constraint productions_asistente_paso check (asistente_paso between 1 and 5);
exception when duplicate_object then null; end $$;

create table if not exists production_hitos (
  id uuid primary key default gen_random_uuid(),
  production_id text not null references productions(id) on delete cascade,
  nombre text not null check (length(btrim(nombre)) between 1 and 80),
  mes date not null check (extract(day from mes) = 1),
  dia date,                      -- fecha exacta cuando ya se sabe
  notas text check (length(notas) <= 300),
  orden int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_production_hitos on production_hitos(production_id, mes);
alter table production_hitos enable row level security;
drop policy if exists production_hitos_read on production_hitos;
create policy production_hitos_read on production_hitos for select to authenticated using (in_production_team(production_id));
drop policy if exists production_hitos_write on production_hitos;
create policy production_hitos_write on production_hitos for all to authenticated
  using (has_perm(production_id, 'obra.editar')) with check (has_perm(production_id, 'obra.editar'));
drop trigger if exists audit_production_hitos on production_hitos;
create trigger audit_production_hitos after insert or update or delete on production_hitos for each row execute function audit_row();

create table if not exists production_lugares (
  id uuid primary key default gen_random_uuid(),
  production_id text not null references productions(id) on delete cascade,
  tipo text not null default 'otro' check (tipo in ('teatro', 'ensayo', 'audicion', 'otro')),
  nombre text not null check (length(btrim(nombre)) between 1 and 120),
  direccion text check (length(direccion) <= 300),
  mapa_url text check (mapa_url is null or mapa_url ~* '^https://\S+$'),
  notas text check (length(notas) <= 500),
  orden int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_production_lugares on production_lugares(production_id, orden);
alter table production_lugares enable row level security;
drop policy if exists production_lugares_read on production_lugares;
create policy production_lugares_read on production_lugares for select to authenticated using (in_production_team(production_id));
drop policy if exists production_lugares_write on production_lugares;
create policy production_lugares_write on production_lugares for all to authenticated
  using (has_perm(production_id, 'obra.editar')) with check (has_perm(production_id, 'obra.editar'));
drop trigger if exists audit_production_lugares on production_lugares;
create trigger audit_production_lugares after insert or update or delete on production_lugares for each row execute function audit_row();

-- ════════ 2. Personajes completos ════════
alter table production_characters drop constraint if exists production_characters_descripcion_check;
alter table production_characters add constraint production_characters_descripcion_check check (length(descripcion) <= 1500);
alter table production_characters add column if not exists categoria text not null default 'protagonista';
alter table production_characters add column if not exists cupo int not null default 1;
alter table production_characters add column if not exists genero text;
alter table production_characters add column if not exists edad_min int;
alter table production_characters add column if not exists edad_max int;
alter table production_characters add column if not exists tesituras text[] not null default '{}';
alter table production_characters add column if not exists canto text;
alter table production_characters add column if not exists baile text;
alter table production_characters add column if not exists actuacion text;
alter table production_characters add column if not exists habilidades text[] not null default '{}';
alter table production_characters add column if not exists rasgos text;
alter table production_characters add column if not exists canciones uuid[] not null default '{}';
do $$ begin
  alter table production_characters add constraint production_characters_perfil check (
    categoria in ('protagonista', 'apoyo', 'ensamble')
    and cupo between 1 and 200
    and (genero is null or genero in ('hombre', 'mujer', 'cualquiera'))
    and (edad_min is null or edad_min between 0 and 100) and (edad_max is null or edad_max between 0 and 100)
    and (edad_min is null or edad_max is null or edad_max >= edad_min)
    and tesituras <@ array['soprano', 'mezzosoprano', 'contralto', 'tenor', 'baritono', 'bajo']
    and cardinality(tesituras) <= 6
    and (canto is null or canto in ('no', 'basico', 'fuerte'))
    and (baile is null or baile in ('no', 'basico', 'fuerte'))
    and (actuacion is null or actuacion in ('no', 'basico', 'fuerte'))
    and cardinality(habilidades) <= 20 and length(array_to_string(habilidades, '|')) <= 600
    and (rasgos is null or length(rasgos) <= 500)
    and cardinality(canciones) <= 60);
exception when duplicate_object then null; end $$;

-- Subir/bajar se mueve dentro de su sección (protagonistas, apoyo, ensamble); el orden general va por sección.
create or replace function production_character_move(cid uuid, p_dir int)
returns void language plpgsql security definer set search_path = public as $$
declare c production_characters%rowtype; otro production_characters%rowtype;
begin
  select * into c from production_characters where id = cid;
  if not found then raise exception 'El personaje no existe.'; end if;
  if not (has_perm(c.production_id, 'obra.editar') or has_perm(c.production_id, 'elenco.gestionar')) then raise exception 'No autorizado'; end if;
  update production_characters x set orden = q.n
    from (select id, row_number() over (order by array_position(array['protagonista', 'apoyo', 'ensamble'], categoria), orden, created_at) as n
            from production_characters where production_id = c.production_id) q
   where x.id = q.id;
  select * into c from production_characters where id = cid;
  select * into otro from production_characters where production_id = c.production_id and categoria = c.categoria and orden = c.orden + sign(p_dir)::int;
  if not found then return; end if;
  update production_characters set orden = c.orden where id = otro.id;
  update production_characters set orden = otro.orden where id = c.id;
end $$;
revoke execute on function production_character_move(uuid, int) from public, anon;
grant execute on function production_character_move(uuid, int) to authenticated;

-- ════════ 3. Puestos del equipo ════════
create table if not exists production_puestos (
  id uuid primary key default gen_random_uuid(),
  production_id text not null references productions(id) on delete cascade,
  puesto text not null check (length(btrim(puesto)) between 1 and 80),
  area text not null default 'creativo' check (area in ('creativo', 'produccion', 'crew', 'tecnico')),
  roles text[] not null default '{}' check (cardinality(roles) <= 20),
  person_id uuid references people(id) on delete set null,
  user_id uuid references profiles(id) on delete set null,
  email text check (email is null or (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 254)),
  telefono text check (length(telefono) <= 30),
  invite_id uuid references production_invites(id) on delete set null,
  credit_id uuid references production_credits(id) on delete set null,
  orden int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_production_puestos on production_puestos(production_id, orden);
create index if not exists idx_production_puestos_invite on production_puestos(invite_id) where invite_id is not null;
alter table production_puestos enable row level security;
drop policy if exists production_puestos_read on production_puestos;
create policy production_puestos_read on production_puestos for select to authenticated using (in_production_team(production_id));
revoke insert, update, delete on production_puestos from anon, authenticated;
drop trigger if exists audit_production_puestos on production_puestos;
create trigger audit_production_puestos after insert or update or delete on production_puestos for each row execute function audit_row();

-- Quita a una cuenta los roles que le daba un puesto, salvo los que le dé otro puesto de la misma obra.
create or replace function _puesto_quitar_roles(p production_puestos) returns void
language sql security definer set search_path = public as $$
  delete from production_members m
   where p.user_id is not null and m.production_id = p.production_id and m.user_id = p.user_id and m.role_id = any(p.roles)
     and not exists (select 1 from production_puestos o where o.id <> p.id and o.production_id = p.production_id
                       and o.user_id = p.user_id and m.role_id = any(o.roles));
$$;
revoke all on function _puesto_quitar_roles(production_puestos) from public, anon, authenticated;

-- Crea o actualiza un puesto. Quién lo ocupa: p_user (una cuenta), o p_nombre (+ p_email para invitarle),
-- o nada (hueco). Devuelve el puesto y, si hubo invitación nueva, su token para la liga.
create or replace function production_puesto_guardar(pid text, p_id uuid, p_puesto text, p_area text, p_roles text[],
  p_user uuid default null, p_nombre text default null, p_email text default null, p_telefono text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ant production_puestos; nuevo production_puestos;
  correo text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_nombre text := nullif(btrim(coalesce(p_nombre, '')), '');
  v_roles text[] := coalesce((select array_agg(distinct x order by x) from unnest(coalesce(p_roles, '{}')) x where btrim(x) <> ''), '{}');
  uid uuid := p_user; persona uuid; inv jsonb; token text; r text; cid uuid;
begin
  if not has_perm(pid, 'permisos.gestionar') then raise exception 'No tienes permiso para armar el equipo de esta obra.'; end if;
  if not exists (select 1 from productions where id = pid) then raise exception 'La obra no existe.'; end if;
  if coalesce(btrim(p_puesto), '') = '' then raise exception 'Escribe el nombre del puesto.'; end if;
  if exists (select 1 from unnest(v_roles) x where not exists (select 1 from panel_roles where id = x)) then
    raise exception 'Uno de los permisos no existe.';
  end if;
  if correo is not null and correo !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Escribe un correo válido.'; end if;
  if p_id is not null then
    select * into ant from production_puestos where id = p_id and production_id = pid for update;
    if not found then raise exception 'No encontramos ese puesto.'; end if;
  end if;

  -- ¿Ese correo ya tiene cuenta? Entonces es como elegir la cuenta.
  if uid is null and correo is not null then select id into uid from auth.users where lower(email) = correo; end if;
  if uid is not null then
    if not exists (select 1 from profiles where id = uid) then raise exception 'No encontramos esa cuenta.'; end if;
    select id into persona from people where profile_id = uid;
    if persona is null then
      insert into people (nombre, profile_id)
      values (coalesce(v_nombre, (select nullif(btrim(coalesce(nombre, '')), '') from profiles where id = uid), correo, 'Sin nombre'), uid)
      returning id into persona;
    end if;
    correo := null;
  elsif v_nombre is not null then
    -- Sin cuenta: se conserva la ficha que ya tenía el puesto si es la misma persona (mismo nombre).
    select p.id into persona from people p where p.id = ant.person_id and p.profile_id is null and lower(p.nombre) = lower(v_nombre);
    if persona is null then insert into people (nombre) values (v_nombre) returning id into persona; end if;
  elsif correo is not null then
    raise exception 'Escribe el nombre de la persona.';
  end if;

  -- Si cambió quién ocupa el puesto (o sus roles), se quitan los roles que daba antes.
  if p_id is not null and ant.user_id is not null and (ant.user_id is distinct from uid or ant.roles is distinct from v_roles) then
    perform _puesto_quitar_roles(ant);
  end if;
  if p_id is not null and ant.invite_id is not null and (correo is distinct from ant.email or uid is not null) then
    update production_invites set cancelada_at = now()
     where id = ant.invite_id and aceptada_at is null and cancelada_at is null
       and not exists (select 1 from production_puestos o where o.invite_id = ant.invite_id and o.id <> ant.id);
  end if;

  if uid is not null then
    foreach r in array v_roles loop
      insert into production_members (production_id, user_id, role_id, created_by) values (pid, uid, r, auth.uid())
      on conflict (production_id, user_id, role_id) do nothing;
    end loop;
  end if;

  -- Crédito en la obra: uno por puesto, con quien lo ocupa.
  cid := ant.credit_id;
  if persona is null then
    if cid is not null then delete from production_credits where id = cid; cid := null; end if;
  elsif cid is not null and exists (select 1 from production_credits where id = cid) then
    update production_credits set person_id = persona, papel = btrim(p_puesto), tipo = p_area where id = cid;
  else
    insert into production_credits (production_id, person_id, tipo, papel, orden)
    values (pid, persona, p_area, btrim(p_puesto), coalesce((select max(orden) + 1 from production_credits where production_id = pid and tipo = p_area), 0))
    returning id into cid;
  end if;

  if p_id is null then
    insert into production_puestos (production_id, puesto, area, roles, person_id, user_id, email, telefono, credit_id, orden)
    values (pid, btrim(p_puesto), p_area, v_roles, persona, uid, case when uid is null then correo end, nullif(btrim(coalesce(p_telefono, '')), ''), cid,
            coalesce((select max(orden) + 1 from production_puestos where production_id = pid), 0))
    returning * into nuevo;
  else
    update production_puestos set puesto = btrim(p_puesto), area = p_area, roles = v_roles, person_id = persona, user_id = uid,
           email = case when uid is null then correo end, telefono = nullif(btrim(coalesce(p_telefono, '')), ''), credit_id = cid,
           invite_id = case when uid is null and correo is not distinct from ant.email then ant.invite_id end
     where id = p_id returning * into nuevo;
  end if;

  -- Sin cuenta y con correo: invitación (con al menos un rol; sin roles solo se guarda el correo).
  if uid is null and correo is not null and cardinality(v_roles) > 0 then
    inv := panel_invite_member(pid, correo, v_roles);
    update production_puestos set invite_id = (inv->>'id')::uuid where id = nuevo.id;
    token := inv->>'token';
  end if;
  return jsonb_build_object('id', nuevo.id, 'token', token, 'cuenta', uid is not null);
end $$;
revoke all on function production_puesto_guardar(text, uuid, text, text, text[], uuid, text, text, text) from public, anon;
grant execute on function production_puesto_guardar(text, uuid, text, text, text[], uuid, text, text, text) to authenticated;

create or replace function production_puesto_borrar(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p production_puestos;
begin
  select * into p from production_puestos where id = p_id;
  if not found or not has_perm(p.production_id, 'permisos.gestionar') then raise exception 'No encontramos ese puesto.'; end if;
  perform _puesto_quitar_roles(p);
  if p.invite_id is not null then
    update production_invites set cancelada_at = now() where id = p.invite_id and aceptada_at is null and cancelada_at is null
       and not exists (select 1 from production_puestos o where o.invite_id = p.invite_id and o.id <> p.id);
  end if;
  if p.credit_id is not null then delete from production_credits where id = p.credit_id; end if;
  delete from production_puestos where id = p_id;
end $$;
revoke all on function production_puesto_borrar(uuid) from public, anon;
grant execute on function production_puesto_borrar(uuid) to authenticated;

-- Al aceptar la invitación, el puesto queda ligado a la cuenta (y su ficha, si no tenía cuenta).
create or replace function production_puestos_invite_aceptada() returns trigger
language plpgsql security definer set search_path = public as $$
declare p production_puestos; existente uuid;
begin
  if new.aceptada_por is null or old.aceptada_por is not distinct from new.aceptada_por then return null; end if;
  select id into existente from people where profile_id = new.aceptada_por;
  for p in select * from production_puestos where invite_id = new.id loop
    if existente is null and p.person_id is not null
       and exists (select 1 from people where id = p.person_id and profile_id is null) then
      update people set profile_id = new.aceptada_por where id = p.person_id;
      existente := p.person_id;
    elsif existente is not null and p.credit_id is not null then
      update production_credits set person_id = existente where id = p.credit_id;
    end if;
    update production_puestos set user_id = new.aceptada_por, person_id = coalesce(existente, person_id), email = null where id = p.id;
  end loop;
  return null;
end $$;
drop trigger if exists production_puestos_invite on production_invites;
create trigger production_puestos_invite after update of aceptada_por on production_invites
  for each row execute function production_puestos_invite_aceptada();

-- ════════ 4. Borrar una obra completa ════════
-- Irreversible: boletos, órdenes, audiciones, ensayos, elenco… todo lo de la obra. Solo Casa DARF y escribiendo
-- su nombre. Las fichas de personas (y sus cuentas) se conservan.
create or replace function panel_borrar_produccion(pid text, p_confirmacion text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o productions; n_ord int; n_aud int; n_app int;
begin
  if not has_casa('casa.producciones') then raise exception 'Solo Casa DARF puede borrar una obra.'; end if;
  select * into o from productions where id = pid for update;
  if not found then raise exception 'La obra no existe.'; end if;
  if lower(btrim(coalesce(p_confirmacion, ''))) <> lower(btrim(o.nombre)) then
    raise exception 'Para confirmar, escribe el nombre exacto de la obra: %', o.nombre;
  end if;
  select count(*) into n_ord from orders r join performances f on f.id = r.performance_id where f.production_id = pid;
  select count(*) into n_aud from auditions where production_id = pid;
  select count(*) into n_app from audition_applications a join auditions au on au.id = a.audition_id where au.production_id = pid;
  -- Lo que no se borra solo en cascada (o tiene candados) va primero.
  delete from evento_ordenes where encuentro_id in (select id from fan_encuentros where production_id = pid);
  delete from discount_codes where production_id = pid;
  delete from productions where id = pid;
  insert into audit_log (tabla, accion, production_id, antes, despues)
  values ('productions', 'borrar_obra', null,
          jsonb_build_object('id', o.id, 'nombre', o.nombre, 'temporada', o.temporada, 'ordenes', n_ord, 'audiciones', n_aud, 'solicitudes', n_app), null);
  return jsonb_build_object('nombre', o.nombre, 'ordenes', n_ord, 'audiciones', n_aud, 'solicitudes', n_app);
end $$;
revoke all on function panel_borrar_produccion(text, text) from public, anon;
grant execute on function panel_borrar_produccion(text, text) to authenticated;

-- ════════ 5. Audiciones: perfil de la persona y ficha de los personajes ════════
-- Preguntas estándar del registro (se pueden apagar por convocatoria): con las mismas opciones que los personajes,
-- para que el juez vea "pide soprano · ella: mezzo".
alter table auditions add column if not exists pedir_perfil boolean not null default false;
alter table auditions alter column pedir_perfil set default true;
alter table audition_applications add column if not exists perfil_tesitura text;
alter table audition_applications add column if not exists perfil_canto text;
alter table audition_applications add column if not exists perfil_baile text;
alter table audition_applications add column if not exists perfil_genero text;
alter table audition_applications add column if not exists perfil_habilidades text[] not null default '{}';
do $$ begin
  alter table audition_applications add constraint audition_applications_perfil check (
    (perfil_tesitura is null or perfil_tesitura in ('soprano', 'mezzosoprano', 'contralto', 'tenor', 'baritono', 'bajo', 'no_se'))
    and (perfil_canto is null or perfil_canto in ('no', 'basico', 'fuerte'))
    and (perfil_baile is null or perfil_baile in ('no', 'basico', 'fuerte'))
    and (perfil_genero is null or perfil_genero in ('hombre', 'mujer', 'otro'))
    and cardinality(perfil_habilidades) <= 20 and length(array_to_string(perfil_habilidades, '|')) <= 600);
exception when duplicate_object then null; end $$;

-- La persona guarda su perfil en su propia solicitud (después de inscribirse o al corregirla).
create or replace function audition_perfil_guardar(p_app uuid, p_tesitura text, p_canto text, p_baile text, p_genero text, p_habilidades text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  update audition_applications
     set perfil_tesitura = nullif(p_tesitura, ''), perfil_canto = nullif(p_canto, ''), perfil_baile = nullif(p_baile, ''),
         perfil_genero = nullif(p_genero, ''),
         perfil_habilidades = coalesce((select array_agg(distinct btrim(x)) from unnest(coalesce(p_habilidades, '{}')) x where btrim(x) <> ''), '{}')
   where id = p_app and user_id = auth.uid() and checked_in_at is null;
  if not found then raise exception 'No encontramos tu solicitud.'; end if;
end $$;
revoke all on function audition_perfil_guardar(uuid, text, text, text, text, text[]) from public, anon;
grant execute on function audition_perfil_guardar(uuid, text, text, text, text, text[]) to authenticated;

-- Ficha de un personaje de la convocatoria (lo de la obra, si está ligado).
create or replace function _audition_ficha(r audition_roles) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('id', r.id, 'nombre', r.nombre, 'descripcion', coalesce(c.descripcion, r.descripcion),
    'categoria', c.categoria, 'cupo', c.cupo, 'genero', c.genero, 'edad_min', c.edad_min, 'edad_max', c.edad_max,
    'tesituras', coalesce(c.tesituras, '{}'), 'canto', c.canto, 'baile', c.baile, 'actuacion', c.actuacion,
    'habilidades', coalesce(c.habilidades, '{}'), 'rasgos', c.rasgos)
    from (select 1) x left join production_characters c on c.id = r.character_id
$$;
revoke all on function _audition_ficha(audition_roles) from public, anon, authenticated;

-- Personajes de una convocatoria con su ficha, para la página pública (aunque la obra aún no esté publicada).
create or replace function audition_fichas(aid uuid) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not (audition_is_public(aid) or audition_team(aid)) then return '[]'::json; end if;
  return coalesce((select json_agg(_audition_ficha(r) order by r.orden) from audition_roles r where r.audition_id = aid), '[]'::json);
end $$;
revoke all on function audition_fichas(uuid) from public;
grant execute on function audition_fichas(uuid) to anon, authenticated;

CREATE OR REPLACE FUNCTION public._audition_juez_persona(aid uuid, p_app uuid, p_ronda integer, p_desde timestamp with time zone)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a audition_applications; v_person uuid;
begin
  select * into a from audition_applications where id = p_app and audition_id = aid;
  if not found then return null; end if;
  if a.user_id is not null then select id into v_person from people where profile_id = a.user_id; end if;
  return json_build_object(
    'app', a.id, 'numero', a.numero, 'nombre', a.nombre, 'edad', audition_age(aid, a.fecha_nacimiento),
    'foto_path', a.foto_path, 'desde', p_desde,
    'personajes', (select array_agg(r.nombre order by r.orden) from audition_roles r where r.id = any(a.roles)),
    -- 0135: ficha de cada personaje (para el pop-up del juez) y el perfil que dio la persona.
    'fichas', coalesce((select json_agg(_audition_ficha(r) order by r.orden) from audition_roles r where r.id = any(a.roles)), '[]'::json),
    'perfil', json_build_object('tesitura', a.perfil_tesitura, 'canto', a.perfil_canto, 'baile', a.perfil_baile, 'habilidades', a.perfil_habilidades, 'genero', a.perfil_genero),
    'respuestas', coalesce((
      select jsonb_agg(jsonb_build_object('pregunta', f.etiqueta, 'respuesta', a.respuestas->>f.id::text) order by f.orden)
        from audition_fields f
       where f.audition_id = aid and f.tipo <> 'enlace' and btrim(coalesce(a.respuestas->>f.id::text, '')) <> ''), '[]'::jsonb),
    'enlaces', coalesce((select jsonb_agg(x) from (
        select jsonb_build_object('titulo', f.etiqueta, 'url', btrim(a.respuestas->>f.id::text)) as x
          from audition_fields f
         where f.audition_id = aid and f.tipo = 'enlace' and btrim(coalesce(a.respuestas->>f.id::text, '')) ~* '^https://\S+$'
        union all
        select jsonb_build_object('titulo', v.titulo, 'url', v.url) from audition_videos v where v.application_id = a.id) q), '[]'::jsonb),
    'entrevista', coalesce(a.entrevista, '[]'::jsonb), 'extra', a.entrevista_extra, 'entrevista_at', a.entrevista_at,
    'historial', coalesce((
      select jsonb_agg(jsonb_build_object('obra', p.nombre, 'temporada', p.temporada, 'tipo', c.tipo, 'papel', c.papel) order by p.created_at desc)
        from production_credits c join productions p on p.id = c.production_id
       where v_person is not null and c.person_id = v_person), '[]'::jsonb),
    'puntos', coalesce((select sc.puntos from audition_scores sc where sc.application_id = a.id and sc.judge_id = auth.uid() and sc.ronda = p_ronda), '{}'::jsonb),
    'notas', (select sc.notas from audition_scores sc where sc.application_id = a.id and sc.judge_id = auth.uid() and sc.ronda = p_ronda),
    'picks', coalesce((select jsonb_agg(jsonb_build_object('opcion', k.opcion, 'role_id', k.role_id, 'ensamble', k.ensamble))
        from audition_picks k where k.application_id = a.id and k.judge_id = auth.uid() and k.ronda = p_ronda), '[]'::jsonb));
end $function$;
revoke all on function _audition_juez_persona(uuid, uuid, int, timestamptz) from public, anon, authenticated;

commit;

select 'Listo 0135: producción nueva, ficha y perfil en audiciones' as resultado;
