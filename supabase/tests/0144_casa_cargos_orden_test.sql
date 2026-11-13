-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0144 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000144a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't144_admin@test.local'),
  ('00000000-0000-0000-0000-000000144a02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't144_ana@test.local'),
  ('00000000-0000-0000-0000-000000144a03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't144_beto@test.local'),
  ('00000000-0000-0000-0000-000000144a04', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't144_caro@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-000000144a01';
update profiles set nombre = 'Ana' where id = '00000000-0000-0000-0000-000000144a02';
update profiles set nombre = 'Beto' where id = '00000000-0000-0000-0000-000000144a03';
update profiles set nombre = 'Caro' where id = '00000000-0000-0000-0000-000000144a04';

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
  perform pg_temp.as_user('00000000-0000-0000-0000-000000144a01');
  return v;
end $$;

insert into panel_roles (id, nombre, categoria, alcance, orden) values ('casa_t144_artistica', 'Dirección artística', 'casa', 'casa', 50), ('casa_t144_finanzas', 'Administración y finanzas', 'casa', 'casa', 60);

do $$
declare adm text := '00000000-0000-0000-0000-000000144a01'; ana text := '00000000-0000-0000-0000-000000144a02';
        beto text := '00000000-0000-0000-0000-000000144a03'; caro text := '00000000-0000-0000-0000-000000144a04';
        orden text;
begin
  -- Ya había otras personas en Casa DARF en la base: la prueba solo mira a las suyas.
  delete from casa_members where user_id not in (ana::uuid, beto::uuid, caro::uuid);
  perform pg_temp.as_user(adm);
  perform casa_agregar('t144_ana@test.local', array['casa_t144_artistica']);
  perform casa_agregar('t144_beto@test.local', array['casa_t144_artistica']);
  perform casa_agregar('t144_caro@test.local', array['casa_t144_finanzas']);

  -- T1: sin cargo ni orden, la lista va por puesto y nombre; el gafete dice el puesto.
  select string_agg(nombre, ',' order by ord) into orden from (select nombre, row_number() over () ord from casa_lista()) x;
  if orden <> 'Ana,Beto,Caro' then raise exception 'FALLO T1a: %', orden; end if;
  if pg_temp.papel(beto) <> 'Dirección artística' then raise exception 'FALLO T1b: %', pg_temp.papel(beto); end if;

  -- T2: cargos específicos distintos dentro del mismo puesto; salen en el gafete y en Nosotros.
  perform casa_cargo_guardar(ana::uuid, '  Directora de contenidos ');
  perform casa_cargo_guardar(beto::uuid, 'Director de producciones');
  if pg_temp.papel(ana) <> 'Directora de contenidos' then raise exception 'FALLO T2a'; end if;
  if pg_temp.papel(beto) <> 'Director de producciones' then raise exception 'FALLO T2b'; end if;
  if (select cargo from team_public() where id = beto::uuid) <> 'Director de producciones' then raise exception 'FALLO T2c'; end if;
  if (select cargo from team_public() where id = caro::uuid) <> 'Administración y finanzas' then raise exception 'FALLO T2d'; end if;
  -- Vacío regresa al nombre del puesto.
  perform casa_cargo_guardar(beto::uuid, '');
  if pg_temp.papel(beto) <> 'Dirección artística' then raise exception 'FALLO T2e'; end if;
  perform casa_cargo_guardar(beto::uuid, 'Director de producciones');

  -- T3: orden manual: Caro hasta arriba, Ana abajo. Ajustes y Nosotros usan el mismo orden.
  perform casa_mover(caro::uuid, 'primero');
  perform casa_mover(ana::uuid, 'abajo');
  select string_agg(nombre, ',' order by ord) into orden from (select nombre, row_number() over () ord from casa_lista()) x;
  if orden <> 'Caro,Beto,Ana' then raise exception 'FALLO T3a: %', orden; end if;
  select string_agg(nombre, ',' order by ord) into orden from (select nombre, row_number() over () ord from team_public()) x;
  if orden <> 'Caro,Beto,Ana' then raise exception 'FALLO T3b: %', orden; end if;
  perform casa_mover(ana::uuid, 'arriba');
  perform casa_mover(caro::uuid, 'arriba');
  select string_agg(nombre, ',' order by ord) into orden from (select nombre, row_number() over () ord from casa_lista()) x;
  if orden <> 'Caro,Ana,Beto' then raise exception 'FALLO T3c: %', orden; end if;
  perform casa_mover(caro::uuid, 'ultimo');
  select string_agg(nombre, ',' order by ord) into orden from (select nombre, row_number() over () ord from casa_lista()) x;
  if orden <> 'Ana,Beto,Caro' then raise exception 'FALLO T3d: %', orden; end if;
  -- El cargo se conserva al mover.
  if (select cargo from casa_lista() where user_id = ana::uuid) <> 'Directora de contenidos' then raise exception 'FALLO T3e'; end if;
  perform pg_temp.reset();

  -- T4: solo el Director cambia cargos y orden.
  perform pg_temp.as_user(ana);
  begin perform casa_cargo_guardar(ana::uuid, 'Reina'); raise exception 'FALLO T4a'; exception when others then if sqlerrm = 'FALLO T4a' then raise; end if; end;
  begin perform casa_mover(ana::uuid, 'primero'); raise exception 'FALLO T4b'; exception when others then if sqlerrm = 'FALLO T4b' then raise; end if; end;
  perform pg_temp.reset();

  -- T5: al salir de Casa DARF se borra su cargo; el cargo es para gente de Casa DARF.
  perform pg_temp.as_user(adm);
  delete from casa_members where user_id = beto::uuid;
  if exists (select 1 from casa_cargos where user_id = beto::uuid) then raise exception 'FALLO T5a'; end if;
  begin perform casa_cargo_guardar(beto::uuid, 'X'); raise exception 'FALLO T5b'; exception when others then if sqlerrm = 'FALLO T5b' then raise; end if; end;
  perform pg_temp.reset();

  raise notice '0144 OK';
end $$;
