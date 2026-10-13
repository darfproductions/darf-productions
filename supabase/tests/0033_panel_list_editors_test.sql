-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0029–0033 aplicadas y el contenido de DEV cargado.

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_admin@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_cont@test.local'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_juez@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-0000000000a1';

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform panel_add_member('hsm', 't_cont@test.local', 'contenido');
  perform panel_add_member('hsm', 't_juez@test.local', 'juez');
  reset role;
end $$;

-- T1: Contenido reemplaza canciones con actos; numeración por orden
do $$ declare n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
  perform panel_set_songs('hsm', '[{"nombre":"Acto I","canciones":["Uno","Dos"," "]},{"nombre":"Acto II","canciones":["Tres"]}]'::jsonb);
  select count(*) into n from production_songs where production_id = 'hsm';
  if n <> 3 then raise exception 'FALLO T1: % canciones', n; end if;
  select count(*) into n from production_acts where production_id = 'hsm';
  if n <> 2 then raise exception 'FALLO T1: % actos', n; end if;
  -- Sin actos: una sola lista
  perform panel_set_songs('hsm', '[{"nombre":"","canciones":["A","B"]}]'::jsonb);
  select count(*) into n from production_songs where production_id = 'hsm' and act_id is null;
  if n <> 2 then raise exception 'FALLO T1b: % canciones sin acto', n; end if;
  reset role;
end $$;

-- T2: agradecimientos, ficha y videos
do $$ declare n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
  perform panel_set_thanks('hsm', array['Gracias A', '', 'Gracias B']);
  select count(*) into n from production_thanks where production_id = 'hsm';
  if n <> 2 then raise exception 'FALLO T2: % agradecimientos', n; end if;
  perform panel_set_facts('hsm', '[{"etiqueta":"Colectivo","valor":"SHV"},{"etiqueta":"","valor":"x"}]'::jsonb);
  select count(*) into n from production_facts where production_id = 'hsm';
  if n <> 1 then raise exception 'FALLO T2b: % datos', n; end if;
  perform panel_set_media('hsm', 'video', '[{"titulo":"Pro-Shot","youtube_id":"2t8v1NjM-zQ"}]'::jsonb);
  select count(*) into n from production_media where production_id = 'hsm' and tipo = 'video';
  if n <> 1 then raise exception 'FALLO T2c: % videos', n; end if;
  reset role;
end $$;

-- T3: un juez no puede; y un error a la mitad no borra lo que había
do $$ declare n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
  begin
    perform panel_set_thanks('hsm', array['hack']);
    raise exception 'FALLO T3: juez editó';
  exception when raise_exception then
    if sqlerrm not like 'No tienes permiso%' then raise exception 'FALLO T3: %', sqlerrm; end if;
  end;
  begin
    perform panel_set_media('hsm', 'ensayo', '[]'::jsonb);
    raise exception 'FALLO T3: juez editó ensayos';
  exception when raise_exception then
    if sqlerrm not like 'No tienes permiso%' then raise exception 'FALLO T3c: %', sqlerrm; end if;
  end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
  begin
    perform panel_set_media('hsm', 'video', '[{"titulo":"Malo","youtube_id":"no-es-un-id-valido"}]'::jsonb);
    raise exception 'FALLO T3: aceptó id inválido';
  exception when check_violation then null;
  end;
  select count(*) into n from production_media where production_id = 'hsm' and tipo = 'video';
  if n <> 1 then raise exception 'FALLO T3b: se perdieron videos (%)', n; end if;
  reset role;
end $$;

do $$ begin raise exception 'OK: 0033 pruebas T1–T3 (se aborta a propósito para no persistir)'; end $$;
