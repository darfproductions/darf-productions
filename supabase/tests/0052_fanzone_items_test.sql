-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0031–0052 aplicadas.

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_admin@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_cont@test.local'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_ana@test.local'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_fan@test.local'),
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

do $$ declare n int; a uuid; b uuid; c uuid; begin
  -- T1: los ensayos de siempre ya están en la lista nueva
  select count(*) into n from fanzone_items where tipo = 'video';
  if n <> (select count(*) from production_media where tipo = 'ensayo') then raise exception 'FALLO T1: no se copiaron los ensayos (%)', n; end if;

  update productions set estado = 'publicada' where id = 'showman';
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform panel_add_member('showman', 't_cont@test.local', 'contenido');
  perform panel_add_member('showman', 't_taq@test.local', 'taquilla');

  -- T2: Contenido agrega de los cinco tipos; cada tipo exige lo suyo
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  insert into fanzone_items (production_id, tipo, titulo, youtube_id, orden) values ('showman', 'video', 'Ensayo', 'dQw4w9WgXcQ', 1) returning id into a;
  insert into fanzone_items (production_id, tipo, titulo, archivo_path, orden) values ('showman', 'documento', 'Libreto', 'showman/fanzone/l.pdf', 2) returning id into b;
  insert into fanzone_items (production_id, tipo, titulo, url, orden) values ('showman', 'enlace', 'Playlist', 'https://open.spotify.com/x', 3) returning id into c;
  insert into fanzone_items (production_id, tipo, titulo, descripcion, visible) values ('showman', 'texto', 'Borrador', 'Aún no', false);
  begin
    insert into fanzone_items (production_id, tipo, titulo) values ('showman', 'enlace', 'Sin url');
    raise exception 'FALLO T2a: enlace sin url';
  exception when check_violation then null;
  end;
  begin
    insert into fanzone_items (production_id, tipo, titulo, archivo_path) values ('showman', 'foto', 'Ajena', 'mm/fanzone/x.jpg');
    raise exception 'FALLO T2b: foto en carpeta de otra obra';
  exception when check_violation then null;
  end;
  begin
    insert into fanzone_items (production_id, tipo, titulo, url) values ('showman', 'enlace', 'Inseguro', 'http://x.com');
    raise exception 'FALLO T2c: enlace http';
  exception when check_violation then null;
  end;
  -- T3: mover y destacar
  perform fanzone_move(c, true);
  if (select orden from fanzone_items where id = c) >= (select orden from fanzone_items where id = b) then raise exception 'FALLO T3a: no subió'; end if;
  -- T4: taquilla no edita
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
  update fanzone_items set titulo = 'X' where id = a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO T4a: taquilla editó'; end if;
  begin
    perform fanzone_move(a, false);
    raise exception 'FALLO T4b: taquilla movió';
  exception when raise_exception then if sqlerrm like 'FALLO%' then raise; end if;
  end;
  -- T5: un fan con cuenta ve lo visible de una obra pública; nunca los borradores
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
  select count(*) into n from fanzone_items where production_id = 'showman';
  if n <> 3 then raise exception 'FALLO T5a: el fan ve % contenidos (deben ser 3)', n; end if;
  if production_fanzone_count('showman') <> 3 then raise exception 'FALLO T5b: conteo'; end if;
  perform pg_temp.as_anon();
  begin
    select count(*) into n from fanzone_items;
    raise exception 'FALLO T5c: sin cuenta puede leer contenidos';
  exception when insufficient_privilege then null;
  end;
  reset role;
  update productions set estado = 'borrador' where id = 'showman';
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
  select count(*) into n from fanzone_items where production_id = 'showman';
  if n <> 0 then raise exception 'FALLO T5d: fan ve la Fan Zone de una obra en borrador'; end if;
  reset role;
end $$;

do $$ begin raise exception 'OK: 0052 pruebas T1–T5 (se aborta a propósito para no persistir)'; end $$;
