-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0126 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000126a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't126_admin@test.local'),
  ('00000000-0000-0000-0000-000000126d01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't126_dir@test.local'),
  ('00000000-0000-0000-0000-000000126c01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't126_ana@test.local'),
  ('00000000-0000-0000-0000-000000126c02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't126_beto@test.local'),
  ('00000000-0000-0000-0000-000000126c03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't126_fan@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-000000126a01';

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create or replace function pg_temp.reset() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;
create or replace function pg_temp.falla(sql text, txt text) returns boolean language plpgsql as $$
begin
  execute sql;
  return false;
exception when others then
  if position(lower(txt) in lower(sqlerrm)) = 0 then raise exception 'mensaje inesperado: % (esperaba "%")', sqlerrm, txt; end if;
  return true;
end $$;

do $$
declare
  adm text := '00000000-0000-0000-0000-000000126a01'; dir text := '00000000-0000-0000-0000-000000126d01';
  ana uuid := '00000000-0000-0000-0000-000000126c01'; beto uuid := '00000000-0000-0000-0000-000000126c02';
  fut uuid; r2 uuid; r3 uuid; r4 uuid; r5 uuid; q uuid; q2 uuid; rr rehearsals; est text; a rehearsal_attendance;
begin
  perform pg_temp.as_user(adm);
  perform panel_add_member('showman', 't126_dir@test.local', 'direccion');
  perform panel_add_member('showman', 't126_ana@test.local', 'integrante');
  perform panel_add_member('showman', 't126_beto@test.local', 'integrante');
  perform pg_temp.reset();
  update member_enrollment set ingreso = hoy_mx() - 365 where production_id = 'showman';
  insert into production_discipline (production_id, tolerancia_min, auto_retardos, auto_faltas, aviso_falta_horas) values ('showman', 10, 1, 2, 0)
  on conflict (production_id) do update set tolerancia_min = 10, auto_retardos = 1, auto_faltas = 2, aviso_falta_horas = 0;
  insert into rehearsals (production_id, titulo, inicia, termina, convocatoria, personas)
    values ('showman', 'Ensayo futuro', now() + interval '2 hours', now() + interval '4 hours', 'personas', array[ana]) returning id into fut;

  -- T1: pedir. Hora fuera de rango, ensayo sin citar, duplicado y falta encima.
  perform pg_temp.as_user(ana::text);
  if not pg_temp.falla(format('select request_late(%L, %L, %L, %L)', 'showman', fut, now() + interval '1 hour', 'Tráfico'), 'después de que empiece') then raise exception 'FALLO T1: antes del inicio'; end if;
  if not pg_temp.falla(format('select request_late(%L, %L, %L, %L)', 'showman', fut, now() + interval '5 hours', 'Tráfico'), 'después de que termina') then raise exception 'FALLO T1: después del fin'; end if;
  if not pg_temp.falla(format('select request_late(%L, %L, %L, %L)', 'showman', fut, now() + interval '150 minutes', ''), 'razón') then raise exception 'FALLO T1: sin razón'; end if;
  q := request_late('showman', fut, now() + interval '150 minutes', 'Salgo tarde de la escuela');
  if (select tipo || ':' || estado from member_requests where id = q) <> 'llegada:pendiente' then raise exception 'FALLO T1: no se creó'; end if;
  if not pg_temp.falla(format('select request_late(%L, %L, %L, %L)', 'showman', fut, now() + interval '160 minutes', 'Otra'), 'Ya mandaste') then raise exception 'FALLO T1: duplicado'; end if;
  if not pg_temp.falla(format('select request_absence(%L, array[%L]::uuid[], %L)', 'showman', fut, 'Mejor falto'), 'Ya mandaste') then raise exception 'FALLO T1: falta encima'; end if;
  perform pg_temp.as_user(beto::text);
  if not pg_temp.falla(format('select request_late(%L, %L, %L, %L)', 'showman', fut, now() + interval '150 minutes', 'x'), 'No estás citado') then raise exception 'FALLO T1: sin citar'; end if;
  if not pg_temp.falla(format('select request_review(%L, true, null)', q), 'permiso') then raise exception 'FALLO T1: integrante revisa'; end if;
  perform pg_temp.reset();
  if request_label((select m from member_requests m where id = q)) not like 'Llegada tarde (%' then raise exception 'FALLO T1: etiqueta'; end if;

  -- T2: ya empezado no se puede pedir.
  insert into rehearsals (production_id, titulo, inicia, convocatoria, personas)
    values ('showman', 'Ensayo empezado', now() - interval '40 minutes', 'personas', array[ana, beto]) returning id into r2;
  perform pg_temp.as_user(ana::text);
  if not pg_temp.falla(format('select request_late(%L, %L, %L, %L)', 'showman', r2, now() + interval '10 minutes', 'x'), 'ya empezó') then raise exception 'FALLO T2: empezado'; end if;
  perform pg_temp.reset();

  -- T3: aprobada antes de llegar. Hora pedida hace 5 min → presente; hace 20 min → retardo de 20.
  insert into member_requests (production_id, user_id, tipo, motivo, llegada_hora, estado) values ('showman', ana, 'llegada', 'x', now() - interval '5 minutes', 'aprobada') returning id into q2;
  insert into member_request_rehearsals values (q2, r2);
  insert into member_requests (production_id, user_id, tipo, motivo, llegada_hora, estado) values ('showman', beto, 'llegada', 'x', now() - interval '20 minutes', 'aprobada') returning id into q2;
  insert into member_request_rehearsals values (q2, r2);
  select * into rr from rehearsals where id = r2;
  est := _llegada(rr, ana, 'Gafete');
  if est <> 'presente' then raise exception 'FALLO T3: Ana %', est; end if;
  est := _llegada(rr, beto, 'Gafete');
  select * into a from rehearsal_attendance where rehearsal_id = r2 and user_id = beto;
  if est <> 'retardo' or a.minutos_tarde <> 20 then raise exception 'FALLO T3: Beto % %', est, a.minutos_tarde; end if;
  if hora_entrada(r2, ana) >= now() or hora_entrada(fut, ana) <> (select inicia from rehearsals where id = fut) then raise exception 'FALLO T3: hora_entrada'; end if;

  -- T4: aprobada después de llegar: llegó con 30 min de retardo (advertencia automática) y había pedido llegar 25 min tarde → presente y se anula.
  insert into rehearsals (production_id, titulo, inicia, convocatoria, personas)
    values ('showman', 'Ensayo T4', now() - interval '30 minutes', 'personas', array[ana]) returning id into r4;
  select * into rr from rehearsals where id = r4;
  est := _llegada(rr, ana, 'Gafete');
  if est <> 'retardo' then raise exception 'FALLO T4: debía ser retardo (%)', est; end if;
  if not exists (select 1 from member_incidents where production_id = 'showman' and user_id = ana and auto_key = 'retardos:1' and anulada_at is null) then
    raise exception 'FALLO T4: no se creó la advertencia';
  end if;
  insert into member_requests (production_id, user_id, tipo, motivo, llegada_hora) values ('showman', ana, 'llegada', 'Doctor', now() - interval '5 minutes') returning id into q2;
  insert into member_request_rehearsals values (q2, r4);
  perform pg_temp.as_user(dir);
  perform request_review(q2, true, null);
  perform pg_temp.reset();
  select * into a from rehearsal_attendance where rehearsal_id = r4 and user_id = ana;
  if a.estado <> 'presente' or a.minutos_tarde is not null then raise exception 'FALLO T4: % %', a.estado, a.minutos_tarde; end if;
  if exists (select 1 from member_incidents where production_id = 'showman' and user_id = ana and auto_key = 'retardos:1' and anulada_at is null) then
    raise exception 'FALLO T4: la advertencia sigue';
  end if;

  -- T5: rechazada → cuenta contra el inicio normal.
  insert into rehearsals (production_id, titulo, inicia, convocatoria, personas)
    values ('showman', 'Ensayo T5', now() - interval '25 minutes', 'personas', array[beto]) returning id into r5;
  insert into member_requests (production_id, user_id, tipo, motivo, llegada_hora) values ('showman', beto, 'llegada', 'x', now() - interval '20 minutes') returning id into q2;
  insert into member_request_rehearsals values (q2, r5);
  perform pg_temp.as_user(dir);
  if not pg_temp.falla(format('select request_review(%L, false, null)', q2), 'por qué') then raise exception 'FALLO T5: rechazo sin razón'; end if;
  perform request_review(q2, false, 'Sin justificante');
  perform pg_temp.reset();
  select * into rr from rehearsals where id = r5;
  est := _llegada(rr, beto, 'Gafete');
  select * into a from rehearsal_attendance where rehearsal_id = r5 and user_id = beto;
  if est <> 'retardo' or a.minutos_tarde <> 25 then raise exception 'FALLO T5: % %', est, a.minutos_tarde; end if;

  -- T6: la lista del ensayo muestra la llegada tarde.
  perform pg_temp.as_user(dir);
  if not exists (select 1 from rehearsal_roster(r2) x where x.user_id = ana and x.aviso like 'Llega a las % (aprobada)%') then raise exception 'FALLO T6: lista'; end if;
  perform pg_temp.reset();
end $$;

select 'TODO OK' as resultado;
