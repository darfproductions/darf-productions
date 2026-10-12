-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0031–0060 aplicadas.

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

do $$ declare per uuid; ev uuid; canto uuid; act uuid; n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform panel_add_member('showman', 't_ana@test.local', 'integrante');
  perform panel_add_member('showman', 't_cont@test.local', 'maestro');
  perform panel_add_member('showman', 't_taq@test.local', 'taquilla');
  perform rubric_seed('showman');
  select id into canto from rubric_criteria where production_id = 'showman' and nombre = 'Canto';
  select id into act from rubric_criteria where production_id = 'showman' and compartido;
  insert into rubric_teachers values ('showman', '00000000-0000-0000-0000-0000000000d1', canto);
  insert into rubric_periods (production_id, nombre, publicado_at) values ('showman', 'Final', now()) returning id into per;

  -- T1: empieza apagada: nadie captura
  begin
    insert into rubric_evaluations (production_id, period_id, user_id) values ('showman', per, '00000000-0000-0000-0000-0000000000e1');
    raise exception 'FALLO T1a: capturó con evaluaciones apagadas';
  exception when raise_exception then if sqlerrm not like '%apagadas%' then raise; end if;
  end;
  -- taquilla no la enciende; el Director sí
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
  begin
    perform rubric_set_active('showman', true);
    raise exception 'FALLO T1b: taquilla encendió evaluaciones';
  exception when raise_exception then if sqlerrm like 'FALLO%' then raise; end if;
  end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform rubric_set_active('showman', true);

  -- T2: el maestro de canto califica canto y su actitud; el Director corrige todo
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  insert into rubric_evaluations (production_id, period_id, user_id) values ('showman', per, '00000000-0000-0000-0000-0000000000e1') returning id into ev;
  insert into rubric_scores (evaluation_id, criterion_id, numero) values (ev, canto, 7);
  insert into rubric_shared_scores (evaluation_id, criterion_id, numero) values (ev, act, 6);
  insert into rubric_notes (evaluation_id, comentario) values (ev, 'Bien');
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  update rubric_scores set numero = 8 where evaluation_id = ev and criterion_id = canto;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALLO T2a: el Director no corrigió canto'; end if;
  update rubric_shared_scores set numero = 9 where evaluation_id = ev and teacher_id = '00000000-0000-0000-0000-0000000000d1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALLO T2b: el Director no corrigió la actitud del maestro'; end if;
  update rubric_notes set comentario = 'Muy bien' where evaluation_id = ev;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALLO T2c: el Director no corrigió el comentario'; end if;
  insert into rubric_scores (evaluation_id, criterion_id, numero) values (ev, (select id from rubric_criteria where production_id = 'showman' and nombre = 'Baile'), 9);

  -- T3: apagada: el alumno deja de ver; encendida, vuelve a ver
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
  select count(*) into n from rubric_scores;
  if n <> 2 then raise exception 'FALLO T3a: el alumno no ve lo publicado (%).', n; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform rubric_set_active('showman', false);
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
  select count(*) into n from rubric_scores;
  if n <> 0 then raise exception 'FALLO T3b: ve evaluaciones con la obra apagada'; end if;
  select count(*) into n from rubric_periods;
  if n <> 0 then raise exception 'FALLO T3c: ve periodos con la obra apagada'; end if;
  reset role;
end $$;

do $$ begin raise exception 'OK: 0060 pruebas T1–T3 (se aborta a propósito para no persistir)'; end $$;
