-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0031–0058 aplicadas.

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

do $$ declare per uuid; ev uuid; crit uuid; lvl uuid; n int; ext uuid; begin
  -- Desde 0060 las evaluaciones empiezan apagadas: estas pruebas las encienden.
  if to_regclass('public.rubric_settings') is not null then execute 'insert into rubric_settings (production_id, activa) values (''showman'', true)'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform panel_add_member('showman', 't_ana@test.local', 'integrante');
  perform panel_add_member('showman', 't_fan@test.local', 'integrante');
  perform panel_add_member('showman', 't_cont@test.local', 'maestro');

  -- T1: el maestro arma la rúbrica, evalúa; no ve expedientes ni pagos
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  perform rubric_seed('showman');
  select count(*) into n from rubric_criteria where production_id = 'showman';
  if n < 4 then raise exception 'FALLO T1a: criterios %', n; end if;  -- 0059 cambió la rúbrica básica a 4
  insert into rubric_periods (production_id, nombre, orden) values ('showman', 'Bimestre 1', 1) returning id into per;
  insert into rubric_evaluations (production_id, period_id, user_id, comentario) values ('showman', per, '00000000-0000-0000-0000-0000000000e1', 'Gran avance') returning id into ev;
  select id into crit from rubric_criteria where production_id = 'showman' order by orden limit 1;
  select id into lvl from rubric_levels where production_id = 'showman' order by orden limit 1;
  insert into rubric_scores (evaluation_id, criterion_id, level_id, numero) values (ev, crit, lvl, 9.5);
  begin
    insert into rubric_scores (evaluation_id, criterion_id, numero) values (ev, (select id from rubric_criteria where production_id = 'showman' order by orden offset 1 limit 1), 11);
    raise exception 'FALLO T1b: número fuera de 0–10';
  exception when check_violation then null;
  end;
  if (select count(*) from rubric_roster('showman')) <> 2 then raise exception 'FALLO T1c: lista de alumnos'; end if;
  select count(*) into n from person_files;
  if n <> 0 then raise exception 'FALLO T1d: el maestro ve expedientes'; end if;
  select count(*) into n from member_payments;
  if n <> 0 then raise exception 'FALLO T1e: el maestro ve pagos'; end if;

  -- T2: el alumno no ve nada hasta publicar; luego solo lo suyo
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
  select count(*) into n from rubric_evaluations;
  if n <> 0 then raise exception 'FALLO T2a: ve una evaluación sin publicar'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  update rubric_periods set publicado_at = now() where id = per;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
  select count(*) into n from rubric_scores s join rubric_evaluations e on e.id = s.evaluation_id where e.user_id = auth.uid();
  if n <> 1 then raise exception 'FALLO T2b: no ve su calificación publicada'; end if;
  select count(*) into n from rubric_criteria where production_id = 'showman';
  if n < 4 then raise exception 'FALLO T2c: no ve los criterios para su boleta'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
  select count(*) into n from rubric_evaluations;
  if n <> 0 then raise exception 'FALLO T2d: otro alumno ve la evaluación de Ana'; end if;

  -- T3: el alumno no puede cambiar su calificación; taquilla tampoco evalúa
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
  update rubric_scores set numero = 10 where evaluation_id = ev;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO T3a: el alumno se cambió la calificación'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform panel_add_member('showman', 't_taq@test.local', 'taquilla');
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
  begin
    perform rubric_roster('showman');
    raise exception 'FALLO T3b: taquilla ve la lista de alumnos';
  exception when raise_exception then if sqlerrm like 'FALLO%' then raise; end if;
  end;
  reset role;

  -- T4: no se mezclan obras
  insert into rubric_criteria (production_id, nombre) values ('mm', 'Otro') returning id into ext;
  begin
    insert into rubric_scores (evaluation_id, criterion_id, numero) values (ev, ext, 5);
    raise exception 'FALLO T4: criterio de otra obra';
  exception when raise_exception then if sqlerrm like 'FALLO%' then raise; end if;
  end;

  -- T5: el rol Maestro existe y no tiene permisos de dinero ni expedientes
  if exists (select 1 from role_permissions where role_id = 'maestro' and permission_id in ('expedientes.ver', 'mensualidades.gestionar', 'ventas.ver')) then
    raise exception 'FALLO T5: el maestro tiene permisos de más';
  end if;
end $$;

do $$ begin raise exception 'OK: 0058 pruebas T1–T5 (se aborta a propósito para no persistir)'; end $$;
