-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0031–0049 aplicadas.

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
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  -- T1: no se puede publicar en modo enlace o archivo sin el enlace o el archivo
  insert into program_pages (production_id, modo) values ('showman', 'enlace');
  begin
    update program_pages set publicado = true where production_id = 'showman';
    raise exception 'FALLO T1a: publicó en modo enlace sin enlace';
  exception when check_violation then null;
  end;
  update program_pages set modo = 'archivo' where production_id = 'showman';
  begin
    update program_pages set publicado = true where production_id = 'showman';
    raise exception 'FALLO T1b: publicó en modo archivo sin archivo';
  exception when check_violation then null;
  end;
  -- T2: enlaces solo https y archivos solo en la carpeta programa de su obra
  begin
    update program_pages set enlace_url = 'http://inseguro.com' where production_id = 'showman';
    raise exception 'FALLO T2a: aceptó un enlace http';
  exception when check_violation then null;
  end;
  begin
    update program_pages set archivo_path = 'mm/programa/p.pdf' where production_id = 'showman';
    raise exception 'FALLO T2b: aceptó un archivo de otra obra';
  exception when check_violation then null;
  end;
  -- T3: con archivo sí se publica y el público lo ve con su modo
  update program_pages set archivo_path = 'showman/programa/p.pdf', publicado = true where production_id = 'showman';
  perform pg_temp.as_anon();
  select count(*) into n from program_pages where modo = 'archivo' and archivo_path = 'showman/programa/p.pdf';
  if n <> 1 then raise exception 'FALLO T3a: el público no ve el programa en archivo'; end if;
  reset role;
  if not exists (select 1 from storage.buckets where id = 'producciones' and 'application/pdf' = any(allowed_mime_types)) then
    raise exception 'FALLO T3b: el bucket no acepta PDF';
  end if;
end $$;

do $$ begin raise exception 'OK: 0049 pruebas T1–T3 (se aborta a propósito para no persistir)'; end $$;
