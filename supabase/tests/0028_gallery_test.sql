-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: el contenido de 0028_gallery.sql (sin begin/commit) si aún no está aplicada.

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_admin@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_fan1@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-0000000000a1';

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- T1: admin inserta foto (fila y objeto)
do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  insert into gallery_photos (production_id, kind, path, sort_order) values ('showman','galeria','showman/galeria/t1.jpg',1);
  insert into storage.objects (bucket_id, name, owner) values ('gallery','showman/galeria/t1.jpg','00000000-0000-0000-0000-0000000000a1');
  reset role;
end $$;

-- T2: fan lee pero no escribe
do $$ declare n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  select count(*) into n from gallery_photos;
  if n <> 1 then raise exception 'FALLO T2: fan no lee la galería (%)', n; end if;
  begin
    insert into gallery_photos (production_id, kind, path) values ('showman','galeria','showman/galeria/hack.jpg');
    raise exception 'FALLO T2: fan insertó foto';
  exception when others then
    if sqlerrm not like '%row-level security%' then raise exception 'FALLO T2: %', sqlerrm; end if;
  end;
  begin
    insert into storage.objects (bucket_id, name, owner) values ('gallery','showman/galeria/hack.jpg','00000000-0000-0000-0000-0000000000c1');
    raise exception 'FALLO T2: fan subió objeto';
  exception when others then
    if sqlerrm not like '%row-level security%' then raise exception 'FALLO T2b: %', sqlerrm; end if;
  end;
  reset role;
end $$;

-- T3: anon lee
do $$ declare n int; begin
  set local role anon;
  select count(*) into n from gallery_photos;
  if n <> 1 then raise exception 'FALLO T3: anon no lee (%)', n; end if;
  reset role;
end $$;

-- T4: tipo inválido
do $$ begin
  begin
    insert into gallery_photos (production_id, kind, path) values ('showman','otro','x.jpg');
    raise exception 'FALLO T4';
  exception when check_violation then null; end;
end $$;

do $$ begin
  raise exception 'OK: TODAS LAS PRUEBAS PASARON (se aborta a propósito para no persistir)';
end $$;
