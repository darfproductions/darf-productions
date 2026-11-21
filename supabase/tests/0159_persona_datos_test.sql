-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0159 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000159a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't159_admin@test.local'),
  ('00000000-0000-0000-0000-000000159a02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't159_zoe@test.local'),
  ('00000000-0000-0000-0000-000000159a03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't159_fan@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-000000159a01';
update profiles set fecha_nacimiento = '2007-05-10' where id = '00000000-0000-0000-0000-000000159a02';
insert into productions (id, nombre, estado) values ('t159_obra', 'Obra 159', 'borrador');
insert into people (id, nombre, profile_id) values ('00000000-0000-0000-0000-000000159b01', 'Zoe', '00000000-0000-0000-0000-000000159a02');
insert into production_credits (production_id, person_id, tipo, papel) values ('t159_obra', '00000000-0000-0000-0000-000000159b01', 'reparto', 'Mujer de 3 Ojos');
insert into production_members (production_id, user_id, role_id) values ('t159_obra', '00000000-0000-0000-0000-000000159a02', 'integrante') on conflict do nothing;
insert into person_files (user_id, genero) values ('00000000-0000-0000-0000-000000159a02', 'mujer');

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

do $$ declare j json; ok boolean; begin
  -- Género no válido se rechaza.
  begin update person_files set genero = 'x' where user_id = '00000000-0000-0000-0000-000000159a02'; ok := false; exception when check_violation then ok := true; end;
  if not ok then raise exception 'FALLO T0: aceptó género raro'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000159a01');
  j := persona_datos('00000000-0000-0000-0000-000000159a02');
  if not (j->>'con_creditos')::boolean or j->>'genero' <> 'mujer' or j->>'fecha_nacimiento' <> '2007-05-10' or j->>'expediente_obra' <> 't159_obra' then raise exception 'FALLO T1: %', j; end if;
  j := persona_datos('00000000-0000-0000-0000-000000159a03');
  if (j->>'con_creditos')::boolean or j->>'genero' is not null then raise exception 'FALLO T2: sin créditos trae datos %', j; end if;
  -- Una cuenta normal no puede.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000159a03');
  begin perform persona_datos('00000000-0000-0000-0000-000000159a02'); ok := false; exception when others then ok := sqlerrm = 'No autorizado'; end;
  if not ok then raise exception 'FALLO T3: sin permiso'; end if;
end $$;

do $$ begin raise notice '0159 OK'; end $$;
