-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0160 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000160a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't160_ana@test.local'),
  ('00000000-0000-0000-0000-000000160a02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't160_fan@test.local');
insert into productions (id, nombre, estado) values ('t160_obra', 'Obra 160', 'borrador');
insert into people (id, nombre, profile_id) values ('00000000-0000-0000-0000-000000160b01', 'Ana', '00000000-0000-0000-0000-000000160a01');
insert into production_credits (production_id, person_id, tipo, papel) values ('t160_obra', '00000000-0000-0000-0000-000000160b01', 'reparto', 'Ana');

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

do $$ declare f text[]; begin
  -- Sin créditos: no aplica.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000160a02');
  if mi_expediente_falta() is not null then raise exception 'FALLO T1: sin créditos'; end if;
  -- Con créditos y sin expediente: falta todo (10 sin tutor, porque no se sabe la edad).
  perform pg_temp.as_user('00000000-0000-0000-0000-000000160a01');
  f := mi_expediente_falta();
  if cardinality(f) <> 10 then raise exception 'FALLO T2: % %', cardinality(f), f; end if;
  set local role postgres;
  -- Menor: pide tutor.
  update profiles set fecha_nacimiento = current_date - interval '15 years' where id = '00000000-0000-0000-0000-000000160a01';
  insert into person_files (user_id, fecha_nacimiento, telefono, genero, emergencia_nombre, emergencia_telefono, emergencia_parentesco, alergias, condiciones, medicamentos, tipo_sangre)
  values ('00000000-0000-0000-0000-000000160a01', current_date - interval '15 years', '55', 'mujer', 'Mamá', '55', 'Madre', 'Ninguna', 'Ninguna', 'Ninguno', 'O+');
  f := expediente_falta('00000000-0000-0000-0000-000000160a01');
  if f <> array['Madre, padre o tutor: nombre', 'Madre, padre o tutor: teléfono', 'Madre, padre o tutor: correo'] then raise exception 'FALLO T3: %', f; end if;
  -- Completo (las medidas no cuentan).
  update person_files set tutor_nombre = 'Mamá', tutor_telefono = '55', tutor_email = 'm@x.com' where user_id = '00000000-0000-0000-0000-000000160a01';
  perform pg_temp.as_user('00000000-0000-0000-0000-000000160a01');
  if mi_expediente_falta() <> '{}' then raise exception 'FALLO T4: %', mi_expediente_falta(); end if;
  if (mi_expediente()->>'tipo_sangre') <> 'O+' then raise exception 'FALLO T5: mi expediente'; end if;
end $$;

do $$ begin raise notice '0160 OK'; end $$;
