-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0143 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000143a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't143_admin@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-000000143a01';

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

insert into productions (id, nombre, estado, logo_path, ambiente_path) values ('t143_obra', 'Obra 143', 'borrador', 't143_obra/kit/logo.png', 't143_obra/kit/amb.jpg');

do $$
declare adm text := '00000000-0000-0000-0000-000000143a01'; ok boolean;
begin
  -- T1: con la obra sin publicar, subir el ícono se guarda directo y no toca logo ni ambiente.
  perform pg_temp.as_user(adm);
  if obra_borrador_guardar('t143_obra', 'kit', jsonb_build_object('icono_path', 't143_obra/kit/sophie.png'), true) <> 'directo' then raise exception 'FALLO T1a'; end if;
  perform pg_temp.reset();
  if (select icono_path from productions where id = 't143_obra') <> 't143_obra/kit/sophie.png' then raise exception 'FALLO T1b'; end if;
  if (select logo_path from productions where id = 't143_obra') <> 't143_obra/kit/logo.png' then raise exception 'FALLO T1c'; end if;

  -- T2: cambiar el logo después conserva el ícono (el parche se mezcla con lo vivo).
  perform pg_temp.as_user(adm);
  perform obra_borrador_guardar('t143_obra', 'kit', jsonb_build_object('logo_path', 't143_obra/kit/logo2.png'), true);
  perform pg_temp.reset();
  if (select icono_path from productions where id = 't143_obra') <> 't143_obra/kit/sophie.png' then raise exception 'FALLO T2'; end if;

  -- T3: quitar el ícono (null) lo quita.
  perform pg_temp.as_user(adm);
  perform obra_borrador_guardar('t143_obra', 'kit', jsonb_build_object('icono_path', null), true);
  perform pg_temp.reset();
  if (select icono_path from productions where id = 't143_obra') is not null then raise exception 'FALLO T3'; end if;

  -- T4: un borrador viejo (sin la llave del ícono) no borra el ícono al publicarse.
  update productions set icono_path = 't143_obra/kit/sophie.png' where id = 't143_obra';
  perform obra_aplicar('t143_obra', 'kit', jsonb_build_object('logo_path', 't143_obra/kit/logo3.png', 'ambiente_path', 't143_obra/kit/amb.jpg'));
  if (select icono_path from productions where id = 't143_obra') <> 't143_obra/kit/sophie.png' then raise exception 'FALLO T4'; end if;

  -- T5: lo que hoy ve el público trae el ícono; la limpieza del Storage no lo borra.
  if obra_seccion_viva('t143_obra', 'kit')->>'icono_path' <> 't143_obra/kit/sophie.png' then raise exception 'FALLO T5a'; end if;
  if not ('t143_obra/kit/sophie.png' = any (kit_en_uso(array['t143_obra/kit/sophie.png', 't143_obra/kit/viejo.png']))) then raise exception 'FALLO T5b'; end if;
  if 't143_obra/kit/viejo.png' = any (kit_en_uso(array['t143_obra/kit/viejo.png'])) then raise exception 'FALLO T5c'; end if;

  -- T6: el ícono solo puede vivir en la carpeta del kit de su obra.
  begin update productions set icono_path = 'otra/kit/x.png' where id = 't143_obra'; ok := false; exception when check_violation then ok := true; end;
  if not ok then raise exception 'FALLO T6'; end if;

  raise notice '0143 OK';
end $$;
