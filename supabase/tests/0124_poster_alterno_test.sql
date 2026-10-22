-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0124 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000a24', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't124_admin@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-000000000a24';

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
values ('t124_obra', 'Obra 124', 'borrador', 'Frase', 't124_obra/kit/logo.png', 't124_obra/kit/amb.png', '#000000', '#111111', '#ffffff', '#ffd400');

do $$
declare ok boolean; r text; enuso text[];
begin
  -- T1: ruta fuera del kit rechazada.
  begin update productions set poster_alt_3x4_path = 'otra/kit/x.jpg' where id = 't124_obra'; ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T1: ruta fuera del kit'; end if;

  -- T2: obra sin publicar: el parche se guarda directo y no borra el póster oficial.
  update productions set poster_3x4_path = 't124_obra/kit/oficial.jpg' where id = 't124_obra';
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000a24');
  r := obra_borrador_guardar('t124_obra', 'poster', '{"poster_alt_9x16_path": "t124_obra/kit/alt-9x16.jpg"}'::jsonb, true);
  perform pg_temp.as_root();
  if r <> 'directo' then raise exception 'FALLO T2: %', r; end if;
  if (select poster_alt_9x16_path from productions where id = 't124_obra') <> 't124_obra/kit/alt-9x16.jpg' then raise exception 'FALLO T2: no se guardó'; end if;
  if (select poster_3x4_path from productions where id = 't124_obra') is distinct from 't124_obra/kit/oficial.jpg' then raise exception 'FALLO T2: se perdió el oficial'; end if;

  -- T3: obra publicada: va a borrador; al publicar llega a la página con el oficial intacto.
  update productions set estado = 'publicada' where id = 't124_obra';
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000a24');
  r := obra_borrador_guardar('t124_obra', 'poster', '{"poster_alt_3x4_info_path": "t124_obra/kit/alt-3x4-info.jpg"}'::jsonb, true);
  if r <> 'borrador' then raise exception 'FALLO T3: %', r; end if;
  perform pg_temp.as_root();
  if (select poster_alt_3x4_info_path from productions where id = 't124_obra') is not null then raise exception 'FALLO T3: salió sin publicar'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000a24');
  perform obra_publicar('t124_obra', array['poster'], 'publico');
  -- T4: la limpieza respeta las imágenes en uso del póster alterno.
  enuso := kit_en_uso(array['t124_obra/kit/alt-9x16.jpg', 't124_obra/kit/alt-3x4-info.jpg', 't124_obra/kit/viejo.jpg']);
  perform pg_temp.as_root();
  if (select poster_alt_3x4_info_path from productions where id = 't124_obra') <> 't124_obra/kit/alt-3x4-info.jpg'
     or (select poster_alt_9x16_path from productions where id = 't124_obra') <> 't124_obra/kit/alt-9x16.jpg'
     or (select poster_3x4_path from productions where id = 't124_obra') <> 't124_obra/kit/oficial.jpg' then raise exception 'FALLO T3: publicar'; end if;
  if array_length(enuso, 1) <> 2 or 't124_obra/kit/viejo.jpg' = any(enuso) then raise exception 'FALLO T4: %', enuso; end if;
end $$;

select 'TODO OK' as resultado;
