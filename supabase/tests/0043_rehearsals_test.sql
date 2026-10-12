-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0031–0043 aplicadas.

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_admin@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_rep@test.local'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_ens@test.local'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_fan@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_dir@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-0000000000a1';

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create temp table ctx (todos uuid, ens uuid, pers uuid);
grant all on ctx to authenticated, anon;

do $$ declare p1 uuid; p2 uuid; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform panel_add_member('showman', 't_dir@test.local', 'direccion');
  perform panel_add_member('showman', 't_rep@test.local', 'integrante');
  perform panel_add_member('showman', 't_ens@test.local', 'integrante');
  reset role;
  insert into people (nombre, profile_id) values ('Rep', '00000000-0000-0000-0000-0000000000c1') returning id into p1;
  insert into people (nombre, profile_id) values ('Ens', '00000000-0000-0000-0000-0000000000c2') returning id into p2;
  insert into production_credits (production_id, person_id, tipo, papel) values ('showman', p1, 'reparto', 'Barnum'), ('showman', p2, 'ensamble', null);
end $$;

-- Desde 0044 cuenta la fecha de ingreso: estas pruebas suponen que entraron hace tiempo.
do $$ begin
  if to_regclass('public.member_enrollment') is not null then
    execute 'update member_enrollment set ingreso = current_date - 365';
  end if;
end $$;

-- T1: Dirección crea ensayos para todos, solo ensamble y una persona; cada quien ve solo los suyos
do $$ declare a uuid; b uuid; c uuid; n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  insert into rehearsals (production_id, titulo, inicia) values ('showman', 'Lectura', now() + interval '1 day') returning id into a;
  insert into rehearsals (production_id, titulo, inicia, convocatoria, grupos) values ('showman', 'Coreo ensamble', now() + interval '2 days', 'grupos', '{ensamble}') returning id into b;
  insert into rehearsals (production_id, titulo, inicia, convocatoria, personas) values ('showman', 'Vocal Barnum', now() + interval '3 days', 'personas', array['00000000-0000-0000-0000-0000000000c1'::uuid]) returning id into c;
  insert into ctx values (a, b, c);
  begin
    insert into rehearsals (production_id, inicia, convocatoria) values ('showman', now(), 'grupos');
    raise exception 'FALLO T1: grupo vacío';
  exception when check_violation then null;
  end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  select count(*) into n from rehearsals;
  if n <> 2 then raise exception 'FALLO T1a: reparto ve % ensayos (esperados 2)', n; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
  select count(*) into n from rehearsals;
  if n <> 2 then raise exception 'FALLO T1b: ensamble ve % ensayos (esperados 2)', n; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
  select count(*) into n from rehearsals;
  if n <> 0 then raise exception 'FALLO T1c: alguien fuera ve ensayos'; end if;
  begin
    insert into rehearsals (production_id, inicia) values ('showman', now());
    raise exception 'FALLO T1: alguien fuera creó un ensayo';
  exception when others then
    if sqlerrm not like '%row-level security%' then raise exception 'FALLO T1d: %', sqlerrm; end if;
  end;
  reset role;
end $$;

-- T2: asistencia solo a citados; el integrante avisa que no va y ve solo la suya
do $$ declare n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
  -- 0070: el aviso ahora es una solicitud de falta (ya no se escribe directo en rehearsal_absences).
  perform request_absence('showman', array[(select ens from ctx)], 'Examen');
  begin
    insert into rehearsal_attendance (rehearsal_id, user_id, estado) values ((select ens from ctx), auth.uid(), 'presente');
    raise exception 'FALLO T2: el integrante se tomó asistencia';
  exception when others then
    if sqlerrm not like '%row-level security%' then raise exception 'FALLO T2a: %', sqlerrm; end if;
  end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  begin
    insert into rehearsal_attendance (rehearsal_id, user_id, estado) values ((select pers from ctx), '00000000-0000-0000-0000-0000000000c2', 'presente');
    raise exception 'FALLO T2: asistencia a alguien no citado';
  exception when others then
    if sqlerrm not like '%row-level security%' then raise exception 'FALLO T2b: %', sqlerrm; end if;
  end;
  insert into rehearsal_attendance (rehearsal_id, user_id, estado) values ((select ens from ctx), '00000000-0000-0000-0000-0000000000c2', 'justificada');
  select count(*) into n from rehearsal_roster((select ens from ctx)) where aviso like '%Examen' and estado = 'justificada';
  if n <> 1 then raise exception 'FALLO T2c: la lista no trae aviso y estado'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  select count(*) into n from rehearsal_attendance;
  if n <> 0 then raise exception 'FALLO T2d: reparto ve asistencia de otros'; end if;
  reset role;
end $$;

-- T3: 3 retardos = 1 advertencia; 2 faltas = 1 advertencia; justificadas no cuentan; no se repiten
do $$ declare n int; r uuid; i int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  for i in 1..4 loop
    insert into rehearsals (production_id, titulo, inicia) values ('showman', 'R' || i, now() - (i || ' days')::interval) returning id into r;
    insert into rehearsal_attendance (rehearsal_id, user_id, estado, minutos_tarde) values (r, '00000000-0000-0000-0000-0000000000c1', 'retardo', 10);
    insert into rehearsal_attendance (rehearsal_id, user_id, estado) values (r, '00000000-0000-0000-0000-0000000000c2', case when i <= 2 then 'falta' else 'justificada' end);
  end loop;
  select count(*) into n from member_incidents where user_id = '00000000-0000-0000-0000-0000000000c1' and tipo = 'retardo' and origen = 'auto';
  if n <> 1 then raise exception 'FALLO T3a: % advertencias por retardos (esperada 1)', n; end if;
  select count(*) into n from member_incidents where user_id = '00000000-0000-0000-0000-0000000000c2' and tipo = 'falta' and origen = 'auto';
  if n <> 1 then raise exception 'FALLO T3b: % advertencias por faltas (esperada 1)', n; end if;
  update rehearsal_attendance set estado = 'retardo' where user_id = '00000000-0000-0000-0000-0000000000c1';
  select count(*) into n from member_incidents where user_id = '00000000-0000-0000-0000-0000000000c1' and tipo = 'retardo';
  if n <> 1 then raise exception 'FALLO T3c: se repitió la advertencia'; end if;
  select presentes + retardos + faltas + justificadas into n from attendance_summary('showman') where user_id = '00000000-0000-0000-0000-0000000000c2';
  if n <> 5 then raise exception 'FALLO T3d: resumen de asistencia %', n; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  select count(*) into n from member_incidents where tipo = 'retardo';
  if n <> 1 then raise exception 'FALLO T3e: el integrante no ve su advertencia automática'; end if;
  reset role;
end $$;

do $$ begin raise exception 'OK: 0043 pruebas T1–T3 (se aborta a propósito para no persistir)'; end $$;
