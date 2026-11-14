-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0145 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000145a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't145_admin@test.local'),
  ('00000000-0000-0000-0000-000000145a02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't145_ana@test.local'),
  ('00000000-0000-0000-0000-000000145a03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't145_beto@test.local'),
  ('00000000-0000-0000-0000-000000145a04', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't145_caro@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-000000145a01';
update profiles set nombre = 'Ana' where id = '00000000-0000-0000-0000-000000145a02';
update profiles set nombre = 'Beto' where id = '00000000-0000-0000-0000-000000145a03';
update profiles set nombre = 'Caro' where id = '00000000-0000-0000-0000-000000145a04';

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create or replace function pg_temp.reset() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;
-- El gafete se arma en el servidor (badge_papel no es para el cliente): se lee como postgres y se regresa al Director.
create or replace function pg_temp.papel(u text) returns text language plpgsql as $$
declare v text;
begin
  perform pg_temp.reset();
  v := badge_papel(u::uuid)->>'papel';
  perform pg_temp.as_user('00000000-0000-0000-0000-000000145a01');
  return v;
end $$;

insert into panel_roles (id, nombre, categoria, alcance, orden) values ('casa_t145_artistica', 'Dirección artística', 'casa', 'casa', 50), ('casa_t145_finanzas', 'Administración y finanzas', 'casa', 'casa', 60);

do $$
declare adm text := '00000000-0000-0000-0000-000000145a01'; ana text := '00000000-0000-0000-0000-000000145a02';
        beto text := '00000000-0000-0000-0000-000000145a03'; caro text := '00000000-0000-0000-0000-000000145a04';
        orden text; t record;
begin
  delete from casa_members where user_id not in (ana::uuid, beto::uuid, caro::uuid);
  perform pg_temp.as_user(adm);
  perform casa_agregar('t145_ana@test.local', array['casa_t145_artistica']);
  perform casa_agregar('t145_beto@test.local', array['casa_t145_artistica']);
  perform casa_agregar('t145_caro@test.local', array['casa_t145_finanzas']);

  -- T1: Caro y Beto son cabezas: salen primero (Beto, Caro por puesto y nombre) y luego Ana.
  perform casa_perfil_guardar(caro::uuid, 'Directora de finanzas', 'Lleva el dinero de cada temporada.', true);
  perform casa_perfil_guardar(beto::uuid, 'Director de producciones', null, true);
  select string_agg(nombre || ':' || directivo, ',' order by ord) into orden from (select nombre, directivo, row_number() over () ord from casa_lista()) x;
  if orden <> 'Caro:true,Beto:true,Ana:false' and orden <> 'Beto:true,Caro:true,Ana:false' then raise exception 'FALLO T1a: %', orden; end if;
  if (select descripcion from casa_lista() where user_id = caro::uuid) <> 'Lleva el dinero de cada temporada.' then raise exception 'FALLO T1b'; end if;

  -- T2: mover respeta el grupo: Ana no puede subir por encima de las cabezas; entre cabezas sí se acomodan.
  perform casa_mover(ana::uuid, 'primero');
  select string_agg(nombre, ',' order by ord) into orden from (select nombre, row_number() over () ord from casa_lista()) x;
  if orden not like '%,Ana' then raise exception 'FALLO T2a: %', orden; end if;
  perform casa_mover(beto::uuid, 'primero');
  select string_agg(nombre, ',' order by ord) into orden from (select nombre, row_number() over () ord from casa_lista()) x;
  if orden <> 'Beto,Caro,Ana' then raise exception 'FALLO T2b: %', orden; end if;
  perform casa_mover(beto::uuid, 'ultimo');
  select string_agg(nombre, ',' order by ord) into orden from (select nombre, row_number() over () ord from casa_lista()) x;
  if orden <> 'Caro,Beto,Ana' then raise exception 'FALLO T2c: %', orden; end if;

  -- T3: Conoce al equipo trae si es cabeza y la descripción, en el mismo orden.
  select string_agg(nombre || ':' || directivo, ',' order by ord) into orden from (select nombre, directivo, row_number() over () ord from team_public()) x;
  if orden <> 'Caro:true,Beto:true,Ana:false' then raise exception 'FALLO T3a: %', orden; end if;
  select * into t from team_public() where id = caro::uuid;
  if t.cargo <> 'Directora de finanzas' or t.descripcion <> 'Lleva el dinero de cada temporada.' then raise exception 'FALLO T3b'; end if;

  -- T4: dejar de ser cabeza la manda al final del resto; quitar descripción (vacía) la borra.
  perform casa_perfil_guardar(caro::uuid, 'Directora de finanzas', '  ', false);
  select string_agg(nombre, ',' order by ord) into orden from (select nombre, row_number() over () ord from casa_lista()) x;
  if orden <> 'Beto,Ana,Caro' then raise exception 'FALLO T4a: %', orden; end if;
  if (select descripcion from casa_cargos where user_id = caro::uuid) is not null then raise exception 'FALLO T4b'; end if;
  perform pg_temp.reset();

  -- T5: solo el Director; descripción con tope.
  perform pg_temp.as_user(ana);
  begin perform casa_perfil_guardar(ana::uuid, 'Reina', null, true); raise exception 'FALLO T5a'; exception when others then if sqlerrm = 'FALLO T5a' then raise; end if; end;
  perform pg_temp.reset();
  perform pg_temp.as_user(adm);
  begin perform casa_perfil_guardar(ana::uuid, 'X', repeat('a', 241), false); raise exception 'FALLO T5b'; exception when others then if sqlerrm = 'FALLO T5b' then raise; end if; end;
  perform pg_temp.reset();

  raise notice '0145 OK';
end $$;
