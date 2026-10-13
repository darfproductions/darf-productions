-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV".
-- 0078: gafete digital y asistencia con gafete. Requiere 0077 ya aplicada. Si la base no es DEV, aborta.
-- Se corre completa en Supabase → SQL Editor (proyecto DARF 2.0 DEV).
begin;
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
end $$;


alter table production_discipline add column tolerancia_min int not null default 10 check (tolerancia_min between 0 and 120);
alter table rehearsal_attendance add column llegada_at timestamptz;

create table badges (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token text not null unique check (char_length(token) >= 24),
  codigo text not null unique check (codigo ~ '^DRF-[2-9A-HJ-NP-Z]{4}$'),
  compartir_telefono boolean not null default false,
  compartir_correo boolean not null default false,
  compartir_instagram boolean not null default false,
  compartir_perfil boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table badges enable row level security;
create policy badges_own on badges for select to authenticated using (user_id = auth.uid());

create or replace function badge_nuevo_token() returns text language sql volatile as $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
$$;

create or replace function badge_nuevo_codigo() returns text language plpgsql volatile set search_path = public as $$
declare alfabeto text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; c text;
begin
  loop
    c := 'DRF-' || (select string_agg(substr(alfabeto, 1 + floor(random() * length(alfabeto))::int, 1), '') from generate_series(1, 4));
    exit when not exists (select 1 from badges where codigo = c);
  end loop;
  return c;
end $$;

create or replace function badge_puede(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = uid and rol in ('staff', 'admin'))
      or exists (select 1 from production_members where user_id = uid)
      or exists (select 1 from production_credits c join people pe on pe.id = c.person_id where pe.profile_id = uid and c.activo)
$$;

create or replace function badge_papel(uid uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare pid text; obra text; temporada text; c_tipo text; c_papel text; rol_app text; miembro text; franja text; papel text;
begin
  select rol into rol_app from profiles where id = uid;
  -- Obra más reciente donde participa: primero las que siguen en curso.
  select p.id, p.nombre, p.temporada into pid, obra, temporada
    from productions p
   where p.id in (select production_id from production_members where user_id = uid
                  union select c.production_id from production_credits c join people pe on pe.id = c.person_id where pe.profile_id = uid and c.activo)
   order by p.concluded, p.created_at desc
   limit 1;
  if pid is not null then
    select c.tipo, c.papel into c_tipo, c_papel
      from production_credits c join people pe on pe.id = c.person_id
     where pe.profile_id = uid and c.production_id = pid and c.activo
     order by case c.tipo when 'reparto' then 1 when 'creativo' then 2 when 'produccion' then 3 when 'ensamble' then 4 else 5 end
     limit 1;
    select role_id into miembro from production_members where user_id = uid and production_id = pid
     order by case role_id when 'integrante' then 2 else 1 end limit 1;
  end if;
  if rol_app in ('admin', 'staff') then
    franja := 'staff';
    papel := coalesce(case when c_tipo in ('creativo', 'produccion', 'crew', 'tecnico') then c_papel end,
                      case when rol_app = 'admin' then 'Dirección general' else 'Producción' end);
  elsif c_tipo = 'reparto' then
    franja := 'elenco'; papel := coalesce('Elenco · ' || nullif(c_papel, ''), 'Elenco');
  elsif c_tipo = 'ensamble' then
    franja := 'elenco'; papel := 'Ensamble';
  elsif c_tipo is not null then
    franja := 'equipo'; papel := coalesce(nullif(c_papel, ''), 'Equipo');
  elsif miembro = 'integrante' then
    franja := 'elenco'; papel := 'Elenco';
  elsif miembro is not null then
    franja := 'equipo';
    papel := case miembro when 'productor' then 'Producción' when 'direccion' then 'Dirección' when 'maestro' then 'Maestro'
                          when 'maquillaje' then 'Maquillaje' when 'taquilla' then 'Taquilla' when 'puerta' then 'Puerta'
                          when 'contenido' then 'Contenido' when 'juez' then 'Jurado' else 'Equipo' end;
  else
    return null;
  end if;
  return json_build_object('franja', franja, 'papel', papel, 'obra_id', pid, 'obra', obra, 'temporada', temporada);
end $$;
revoke execute on function badge_puede(uuid), badge_papel(uuid) from public, anon, authenticated;

create or replace function badge_mio() returns json
language plpgsql security definer set search_path = public as $$
declare b badges; papel json;
begin
  if auth.uid() is null or not badge_puede(auth.uid()) then return null; end if;
  select * into b from badges where user_id = auth.uid();
  if not found then
    insert into badges (user_id, token, codigo) values (auth.uid(), badge_nuevo_token(), badge_nuevo_codigo()) returning * into b;
  end if;
  papel := badge_papel(auth.uid());
  return json_build_object('token', b.token, 'codigo', b.codigo,
    'compartir_telefono', b.compartir_telefono, 'compartir_correo', b.compartir_correo,
    'compartir_instagram', b.compartir_instagram, 'compartir_perfil', b.compartir_perfil,
    'franja', papel->>'franja', 'papel', papel->>'papel', 'obra', papel->>'obra', 'temporada', papel->>'temporada');
end $$;
revoke execute on function badge_mio() from public, anon;
grant execute on function badge_mio() to authenticated;

create or replace function badge_compartir(p_tel boolean, p_correo boolean, p_insta boolean, p_perfil boolean) returns void
language sql security definer set search_path = public as $$
  update badges set compartir_telefono = coalesce(p_tel, false), compartir_correo = coalesce(p_correo, false),
                    compartir_instagram = coalesce(p_insta, false), compartir_perfil = coalesce(p_perfil, false), updated_at = now()
   where user_id = auth.uid()
$$;
revoke execute on function badge_compartir(boolean, boolean, boolean, boolean) from public, anon;
grant execute on function badge_compartir(boolean, boolean, boolean, boolean) to authenticated;

create or replace function badge_regenerar() returns void
language sql security definer set search_path = public as $$
  update badges set token = badge_nuevo_token(), codigo = badge_nuevo_codigo(), updated_at = now() where user_id = auth.uid()
$$;
revoke execute on function badge_regenerar() from public, anon;
grant execute on function badge_regenerar() to authenticated;

create or replace function badge_publico(p_token text) returns json
language plpgsql stable security definer set search_path = public as $$
declare b badges; pr profiles; persona people; pro pro_profiles; papel json; menor boolean; correo text;
begin
  select * into b from badges where token = p_token;
  if not found or not badge_puede(b.user_id) then return null; end if;
  select * into pr from profiles where id = b.user_id;
  select * into persona from people where profile_id = b.user_id;
  if persona.id is not null then select * into pro from pro_profiles where person_id = persona.id; end if;
  papel := badge_papel(b.user_id);
  menor := pr.fecha_nacimiento is not null and pr.fecha_nacimiento > (current_date - interval '18 years');
  select email into correo from auth.users where id = b.user_id;
  return json_build_object(
    'nombre', coalesce(pr.nombre, persona.nombre, ''),
    'franja', papel->>'franja', 'papel', papel->>'papel', 'obra', papel->>'obra', 'temporada', papel->>'temporada',
    'retrato_path', case when pro.person_id is not null and pro_is_public(pro.person_id) then pro.retrato_path end,
    'telefono', case when b.compartir_telefono and not menor then pr.telefono end,
    'correo', case when b.compartir_correo and not menor then correo end,
    'instagram', case when b.compartir_instagram then pro.instagram end,
    'perfil', case when b.compartir_perfil and pro.person_id is not null and pro_is_public(pro.person_id) then pro.slug end);
end $$;
revoke execute on function badge_publico(text) from public;
grant execute on function badge_publico(text) to anon, authenticated;

create or replace function rehearsal_checkin(rid uuid, p_code text) returns json
language plpgsql security definer set search_path = public as $$
declare r rehearsals; pid text; entrada text; b badges; previo rehearsal_attendance; tol int; tarde int; est text; nombre text; foto text;
begin
  select * into r from rehearsals where id = rid;
  if not found then raise exception 'Ese ensayo no existe.'; end if;
  pid := r.production_id;
  if not has_perm(pid, 'ensayos.gestionar') then raise exception 'No tienes permiso para tomar asistencia en esta obra.'; end if;
  if r.estado = 'cancelado' then raise exception 'Este ensayo está cancelado.'; end if;
  entrada := btrim(coalesce(p_code, ''));
  if entrada ~ '/g/' then entrada := split_part(split_part(entrada, '/g/', 2), '?', 1); end if;
  if upper(entrada) ~ '^DRF-[2-9A-HJ-NP-Z]{4}$' then
    select * into b from badges where codigo = upper(entrada);
  else
    select * into b from badges where token = entrada;
  end if;
  if not found then return json_build_object('resultado', 'no_encontrado'); end if;
  select coalesce(p.nombre, ''), p.foto_path into nombre, foto from profiles p where p.id = b.user_id;
  if not rehearsal_cites(rid, b.user_id) then
    return json_build_object('resultado', 'no_citado', 'user_id', b.user_id, 'nombre', nombre, 'foto_path', foto);
  end if;
  select * into previo from rehearsal_attendance where rehearsal_id = rid and user_id = b.user_id;
  if found and previo.estado in ('presente', 'retardo') then
    return json_build_object('resultado', 'ya', 'user_id', b.user_id, 'nombre', nombre, 'foto_path', foto,
                             'estado', previo.estado, 'minutos', previo.minutos_tarde, 'llegada', coalesce(previo.llegada_at, previo.marcado_at));
  end if;
  select coalesce((select tolerancia_min from production_discipline where production_id = pid), 10) into tol;
  tarde := floor(extract(epoch from (now() - r.inicia)) / 60)::int;
  if tarde > tol then est := 'retardo'; else est := 'presente'; end if;
  insert into rehearsal_attendance (rehearsal_id, user_id, estado, minutos_tarde, nota, marcado_por, marcado_at, llegada_at)
  values (rid, b.user_id, est, case when est = 'retardo' then least(tarde, 600) end, 'Gafete', auth.uid(), now(), now())
  on conflict (rehearsal_id, user_id) do update
    set estado = excluded.estado, minutos_tarde = excluded.minutos_tarde, nota = excluded.nota,
        marcado_por = excluded.marcado_por, marcado_at = excluded.marcado_at, llegada_at = excluded.llegada_at;
  return json_build_object('resultado', est, 'user_id', b.user_id, 'nombre', nombre, 'foto_path', foto,
                           'minutos', case when est = 'retardo' then least(tarde, 600) end, 'llegada', now());
end $$;
revoke execute on function rehearsal_checkin(uuid, text) from public, anon;
grant execute on function rehearsal_checkin(uuid, text) to authenticated;

commit;
