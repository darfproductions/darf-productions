-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0031–0059 aplicadas.

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

do $$ declare per uuid; ev uuid; canto uuid; baile uuid; act uuid; n int; x jsonb; r1 uuid; r2 uuid; r3 uuid; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform panel_add_member('showman', 't_ana@test.local', 'integrante');
  perform panel_add_member('showman', 't_cont@test.local', 'maestro');
  perform panel_add_member('showman', 't_taq@test.local', 'maestro');
  -- T1: el coordinador arma la rúbrica y asigna materias
  perform rubric_seed('showman');
  select id into canto from rubric_criteria where production_id = 'showman' and nombre = 'Canto';
  select id into baile from rubric_criteria where production_id = 'showman' and nombre = 'Baile';
  select id into act from rubric_criteria where production_id = 'showman' and compartido;
  if act is null then raise exception 'FALLO T1a: falta Actitud y conducta compartida'; end if;
  insert into rubric_teachers values ('showman', '00000000-0000-0000-0000-0000000000d1', canto), ('showman', '00000000-0000-0000-0000-0000000000d2', baile);
  insert into rubric_periods (production_id, nombre, desde, hasta) values ('showman', 'Bimestre 1', current_date - 30, current_date) returning id into per;
  insert into rubric_evaluations (production_id, period_id, user_id, comentario) values ('showman', per, '00000000-0000-0000-0000-0000000000e1', 'General') returning id into ev;

  -- T2: la maestra de canto califica canto, no baile; no toca la estructura ni el comentario general
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  insert into rubric_scores (evaluation_id, criterion_id, numero) values (ev, canto, 9);
  begin
    insert into rubric_scores (evaluation_id, criterion_id, numero) values (ev, baile, 9);
    raise exception 'FALLO T2a: calificó una materia ajena';
  exception when insufficient_privilege then null;
  end;
  update rubric_criteria set nombre = 'X' where id = baile;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO T2b: cambió la rúbrica'; end if;
  update rubric_evaluations set comentario = 'Mío' where id = ev;
  reset role;
  if (select comentario from rubric_evaluations where id = ev) <> 'General' then raise exception 'FALLO T2c: cambió el comentario general'; end if;

  -- T3: actitud compartida: cada maestro la suya; nadie escribe por otro
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  insert into rubric_shared_scores (evaluation_id, criterion_id, numero) values (ev, act, 8);
  insert into rubric_notes (evaluation_id, comentario) values (ev, 'Afinada');
  begin
    insert into rubric_scores (evaluation_id, criterion_id, numero) values (ev, act, 8);
    raise exception 'FALLO T3a: compartido en la tabla normal';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
  insert into rubric_shared_scores (evaluation_id, criterion_id, numero) values (ev, act, 10);
  begin
    insert into rubric_shared_scores (evaluation_id, criterion_id, teacher_id, numero) values (ev, act, '00000000-0000-0000-0000-0000000000d1', 1);
    raise exception 'FALLO T3b: calificó por otro maestro';
  exception when insufficient_privilege then null;
  end;
  reset role;
  if (select avg(numero) from rubric_shared_scores where evaluation_id = ev) <> 9 then raise exception 'FALLO T3c: promedio'; end if;

  -- T4: boleta: asistencia y llamadas de atención del periodo (Ana entró hace un año)
  update member_enrollment set ingreso = current_date - 365 where production_id = 'showman' and user_id = '00000000-0000-0000-0000-0000000000e1';
  insert into rehearsals (production_id, inicia) values ('showman', now() - interval '5 days') returning id into r1;
  insert into rehearsals (production_id, inicia) values ('showman', now() - interval '4 days') returning id into r2;
  insert into rehearsals (production_id, inicia) values ('showman', now() - interval '60 days') returning id into r3;
  insert into rehearsal_attendance (rehearsal_id, user_id, estado) values (r1, '00000000-0000-0000-0000-0000000000e1', 'presente'), (r2, '00000000-0000-0000-0000-0000000000e1', 'retardo'), (r3, '00000000-0000-0000-0000-0000000000e1', 'falta');
  insert into member_incidents (production_id, user_id, tipo, nivel, descripcion, fecha) values
    ('showman', '00000000-0000-0000-0000-0000000000e1', 'conducta', 'advertencia', 'Uso del celular', current_date - 2),
    ('showman', '00000000-0000-0000-0000-0000000000e1', 'otro', 'nota', 'Nota interna', current_date - 2),
    ('showman', '00000000-0000-0000-0000-0000000000e1', 'falta', 'advertencia', 'Antigua', current_date - 90);
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
  x := rubric_period_extras(per, '00000000-0000-0000-0000-0000000000e1');
  if (x->>'citados')::int <> 2 or (x->>'presentes')::int <> 1 or (x->>'retardos')::int <> 1 or (x->>'faltas')::int <> 0 then raise exception 'FALLO T4a: asistencia %', x; end if;
  if jsonb_array_length(x->'incidencias') <> 1 then raise exception 'FALLO T4b: incidencias %', x->'incidencias'; end if;
  -- el alumno no la ve hasta publicar; luego sí, con las notas de los maestros
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
  begin
    perform rubric_period_extras(per, '00000000-0000-0000-0000-0000000000e1');
    raise exception 'FALLO T4c: vio su boleta sin publicar';
  exception when raise_exception then if sqlerrm like 'FALLO%' then raise; end if;
  end;
  reset role;
  update rubric_periods set publicado_at = now() where id = per;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
  if (select count(*) from rubric_shared_scores) <> 2 or (select count(*) from rubric_notes) <> 1 then raise exception 'FALLO T4d: no ve actitud o comentarios'; end if;
  x := rubric_period_extras(per, '00000000-0000-0000-0000-0000000000e1');
  if jsonb_array_length(x->'notas') <> 1 or x->'notas'->0->'materias'->>0 <> 'Canto' then raise exception 'FALLO T4e: notas %', x->'notas'; end if;
  reset role;
end $$;

do $$ begin raise exception 'OK: 0059 pruebas T1–T4 (se aborta a propósito para no persistir)'; end $$;
