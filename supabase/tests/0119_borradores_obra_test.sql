-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0119 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000b91', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't119_admin@test.local'),
  ('00000000-0000-0000-0000-000000000b92', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't119_fan@test.local'),
  ('00000000-0000-0000-0000-000000000b93', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't119_nadie@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-000000000b91';

create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create or replace function pg_temp.as_root() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

insert into productions (id, nombre, estado, frase, logo_path, ambiente_path, color_fondo, color_superficie, color_texto, color_acento)
values ('t119_obra', 'Obra 119', 'borrador', 'Frase vieja', 't119_obra/kit/logo.png', 't119_obra/kit/amb.png', '#000000', '#111111', '#ffffff', '#ffd400');

do $$ declare r text; n int; c jsonb; ok boolean; begin
  -- T1: obra sin publicar: se guarda directo.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000b91');
  r := obra_borrador_guardar('t119_obra', 'gracias', '{"items": ["Mamá"]}');
  perform pg_temp.as_root();
  if r <> 'directo' or (select count(*) from production_thanks where production_id = 't119_obra') <> 1 then raise exception 'FALLO T1: %', r; end if;

  -- T2: obra publicada: borrador; el público no lo ve.
  update productions set estado = 'publicada' where id = 't119_obra';
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000b91');
  r := obra_borrador_guardar('t119_obra', 'datos', jsonb_build_object('nombre', 'Obra 119', 'frase', 'Frase nueva'));
  r := obra_borrador_guardar('t119_obra', 'kit', '{"logo_path": "t119_obra/kit/logo2.png"}', true);
  perform pg_temp.as_root();
  if r <> 'borrador' then raise exception 'FALLO T2: %', r; end if;
  if (select frase from productions where id = 't119_obra') <> 'Frase vieja' then raise exception 'FALLO T2: se publicó'; end if;
  -- El parche conserva lo demás del kit.
  if (select borrador->>'ambiente_path' from obra_borradores where production_id = 't119_obra' and seccion = 'kit') <> 't119_obra/kit/amb.png' then raise exception 'FALLO T2: parche'; end if;

  -- T3: publicar "datos" a fans: socio lo ve, no socio no.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000b91');
  n := obra_publicar('t119_obra', array['datos'], 'fans');
  if n <> 1 then raise exception 'FALLO T3: n %', n; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000b92');
  perform fan_join();
  c := obra_capa('t119_obra', 'fans');
  if c->'datos'->>'frase' <> 'Frase nueva' or c ? 'kit' then raise exception 'FALLO T3: capa fans %', c; end if;
  if obra_capa('t119_obra', 'borrador') <> '{}'::jsonb then raise exception 'FALLO T3: fan ve borrador'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000b93');
  if obra_capa('t119_obra', 'fans') <> '{}'::jsonb then raise exception 'FALLO T3: no socio ve fans'; end if;
  begin perform obra_publicar('t119_obra', null, 'publico'); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T3: no autorizado publicó'; end if;
  begin perform obra_borrador_guardar('t119_obra', 'datos', '{"nombre": "X"}'); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T3: no autorizado guardó'; end if;

  -- T4: publicar todo a todos: datos (de fans) y kit (borrador) llegan a la página; no quedan cambios.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000b91');
  c := obra_capa('t119_obra', 'borrador');
  if not (c ? 'datos' and c ? 'kit') then raise exception 'FALLO T4: capa borrador %', c; end if;
  n := obra_publicar('t119_obra', null, 'publico');
  perform pg_temp.as_root();
  if n <> 2 then raise exception 'FALLO T4: n %', n; end if;
  if (select frase || logo_path from productions where id = 't119_obra') <> 'Frase nuevat119_obra/kit/logo2.png' then raise exception 'FALLO T4: no se publicó'; end if;
  if exists (select 1 from obra_borradores where production_id = 't119_obra') then raise exception 'FALLO T4: quedaron cambios'; end if;

  -- T5: descartar el borrador.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000b91');
  perform obra_borrador_guardar('t119_obra', 'videos', '{"items": [{"titulo": "Tráiler", "youtube_id": "abc123def45"}]}');
  n := obra_descartar('t119_obra', array['videos'], 'borrador');
  perform pg_temp.as_root();
  if n <> 1 or exists (select 1 from obra_borradores where production_id = 't119_obra') then raise exception 'FALLO T5'; end if;
end $$;

select 'TODO OK';
