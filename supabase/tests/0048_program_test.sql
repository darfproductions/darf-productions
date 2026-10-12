-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0031–0048 aplicadas.

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_admin@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_cont@test.local'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_taq@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-0000000000a1';

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create or replace function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end $$;

do $$ declare n int; begin
  update productions set estado = 'publicada' where id = 'showman';
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform panel_add_member('showman', 't_cont@test.local', 'contenido');
  perform panel_add_member('showman', 't_taq@test.local', 'taquilla');
  -- T1: Contenido arma el programa; taquilla no
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  insert into program_pages (production_id, notas_direccion) values ('showman', 'Gracias por venir');
  insert into program_sponsors (production_id, nombre, url, logo_path) values ('showman', 'Café X', 'https://cafe.x', 'showman/programa/cafe.png');
  if not can_write_object('producciones', 'showman/programa/logo.png') then raise exception 'FALLO T1a: Contenido no puede subir logos del programa'; end if;
  begin
    insert into program_sponsors (production_id, nombre, logo_path) values ('showman', 'Mal', 'mm/programa/x.png');
    raise exception 'FALLO T1: logo en carpeta de otra obra';
  exception when check_violation then null;
  end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
  update program_pages set publicado = true where production_id = 'showman';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO T1b: taquilla publicó el programa'; end if;
  if can_write_object('producciones', 'showman/programa/logo.png') then raise exception 'FALLO T1c: taquilla sube logos'; end if;
  -- T2: el público no lo ve hasta que se publica
  perform pg_temp.as_anon();
  select count(*) into n from program_pages;
  if n <> 0 then raise exception 'FALLO T2a: el público ve un programa sin publicar'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  update program_pages set publicado = true where production_id = 'showman';
  perform pg_temp.as_anon();
  select count(*) into n from program_pages where production_id = 'showman';
  if n <> 1 then raise exception 'FALLO T2b: el público no ve el programa publicado'; end if;
  select count(*) into n from program_sponsors;
  if n <> 1 then raise exception 'FALLO T2c: el público no ve los patrocinadores'; end if;
  reset role;
  -- T3: si la obra está en borrador, el programa no es público aunque esté publicado
  update productions set estado = 'borrador' where id = 'showman';
  perform pg_temp.as_anon();
  select count(*) into n from program_pages;
  if n <> 0 then raise exception 'FALLO T3: programa público de una obra en borrador'; end if;
  reset role;
end $$;

do $$ begin raise exception 'OK: 0048 pruebas T1–T3 (se aborta a propósito para no persistir)'; end $$;
