-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0031–0070 aplicadas.

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_admin@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_rep@test.local'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_ens@test.local'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_fan@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_dir@test.local'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_prod@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-0000000000a1';

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
-- ¿La llamada falla con un mensaje que contiene `txt`?
create or replace function pg_temp.falla(sql text, txt text) returns boolean language plpgsql as $$
begin
  execute sql;
  return false;
exception when others then
  if position(lower(txt) in lower(sqlerrm)) = 0 then raise exception 'mensaje inesperado: % (esperaba "%")', sqlerrm, txt; end if;
  return true;
end $$;

create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated, anon;

do $$ declare p1 uuid; r uuid; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform panel_add_member('showman', 't_dir@test.local', 'direccion');
  perform panel_add_member('showman', 't_prod@test.local', 'productor');
  perform panel_add_member('showman', 't_rep@test.local', 'integrante');
  perform panel_add_member('showman', 't_ens@test.local', 'integrante');
  perform pg_temp.reset();
  update member_enrollment set ingreso = hoy_mx() - 365;
  insert into people (nombre, profile_id) values ('Rep', '00000000-0000-0000-0000-0000000000c1') returning id into p1;
  insert into production_credits (production_id, person_id, tipo, papel) values ('showman', p1, 'reparto', 'Barnum');
  insert into production_discipline (production_id, auto_faltas, aviso_falta_horas) values ('showman', 1, 24)
    on conflict (production_id) do update set auto_faltas = 1, aviso_falta_horas = 24;
  insert into rehearsals (production_id, titulo, inicia) values ('showman', 'Lejos', now() + interval '3 days') returning id into r;
  insert into ctx values ('lejos', r);
  insert into rehearsals (production_id, titulo, inicia) values ('showman', 'Lejos 2', now() + interval '4 days') returning id into r;
  insert into ctx values ('lejos2', r);
  insert into rehearsals (production_id, titulo, inicia) values ('showman', 'Mañana', now() + interval '10 hours') returning id into r;
  insert into ctx values ('cerca', r);
  insert into rehearsals (production_id, titulo, inicia) values ('showman', 'Ayer', now() - interval '1 day') returning id into r;
  insert into ctx values ('ayer', r);
  insert into rehearsals (production_id, titulo, inicia, convocatoria, personas) values ('showman', 'Solo Ens', now() + interval '5 days', 'personas', array['00000000-0000-0000-0000-0000000000c2'::uuid]) returning id into r;
  insert into ctx values ('soloens', r);
  insert into member_doc_types (production_id, nombre) values ('showman', 'Acta de nacimiento') returning id into r;
  insert into ctx values ('acta', r);
end $$;

do $$ declare n int; q uuid; q2 uuid; aviso_txt text; begin
  -- T1: faltas: se pide antes del límite; no fuera de tiempo, ni ensayos ajenos, ni repetida.
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  q := request_absence('showman', array[(select v from ctx where k = 'lejos'), (select v from ctx where k = 'lejos2')], 'Tengo examen');
  if (select count(*) from member_request_rehearsals where request_id = q) <> 2 then raise exception 'FALLO T1: ensayos de la solicitud'; end if;
  if not pg_temp.falla(format('select request_absence(%L, array[%L]::uuid[], %L)', 'showman', (select v from ctx where k = 'cerca'), 'x'), '24 horas') then raise exception 'FALLO T1: aceptó dentro de las 24 h'; end if;
  if not pg_temp.falla(format('select request_absence(%L, array[%L]::uuid[], %L)', 'showman', (select v from ctx where k = 'ayer'), 'x'), 'límite') then raise exception 'FALLO T1: aceptó un ensayo pasado'; end if;
  if not pg_temp.falla(format('select request_absence(%L, array[%L]::uuid[], %L)', 'showman', (select v from ctx where k = 'soloens'), 'x'), 'No estás citado') then raise exception 'FALLO T1: ensayo ajeno'; end if;
  if not pg_temp.falla(format('select request_absence(%L, array[%L]::uuid[], %L)', 'showman', (select v from ctx where k = 'lejos'), 'otra vez'), 'Ya mandaste') then raise exception 'FALLO T1: repetida'; end if;
  if not pg_temp.falla(format('select request_absence(%L, array[%L]::uuid[], %L)', 'showman', (select v from ctx where k = 'lejos'), '  '), 'razón') then raise exception 'FALLO T1: sin razón'; end if;
  -- Con límite 0 se puede hasta que empiece.
  perform pg_temp.reset();
  update production_discipline set aviso_falta_horas = 0 where production_id = 'showman';
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  q2 := request_absence('showman', array[(select v from ctx where k = 'cerca')], 'Cita médica');
  -- Insert directo: no se puede.
  begin
    insert into member_requests (production_id, user_id, tipo, motivo) values ('showman', auth.uid(), 'otro', 'x');
    raise exception 'FALLO T1: insert directo';
  exception when insufficient_privilege then null;
  end;
  -- Alguien que no es del elenco no puede pedir.
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
  if not pg_temp.falla('select request_submit(''showman'', ''otro'', ''hola'', null, null, null, null, null, null, null)', 'Solo el elenco') then raise exception 'FALLO T1: fan pidió'; end if;

  -- T2: quién revisa: el integrante no; Dirección (ensayos) sí las faltas, pero no pagos.
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
  if not pg_temp.falla(format('select request_review(%L, true, null)', q), 'permiso') then raise exception 'FALLO T2: integrante aprobó'; end if;
  select count(*) into n from member_requests where id = q;
  if n <> 0 then raise exception 'FALLO T2: otro integrante ve la solicitud'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  if not pg_temp.falla(format('select request_review(%L, false, %L)', q2, ' '), 'por qué') then raise exception 'FALLO T2: rechazo sin respuesta'; end if;
  perform request_review(q2, false, 'Avísalo antes, por favor.');
  if (select estado from member_requests where id = q2) <> 'rechazada' then raise exception 'FALLO T2: no quedó rechazada'; end if;

  -- T3: aprobar la falta justifica los dos ensayos y no genera advertencia; avisa al integrante.
  perform request_review(q, true, 'Éxito en tu examen');
  select count(*) into n from rehearsal_attendance where user_id = '00000000-0000-0000-0000-0000000000c1' and estado = 'justificada';
  if n <> 2 then raise exception 'FALLO T3: % justificadas', n; end if;
  if not pg_temp.falla(format('select request_review(%L, true, null)', q), 'ya fue revisada') then raise exception 'FALLO T3: revisó dos veces'; end if;
  perform pg_temp.reset();
  select count(*) into n from member_incidents where user_id = '00000000-0000-0000-0000-0000000000c1' and anulada_at is null;
  if n <> 0 then raise exception 'FALLO T3: generó advertencia'; end if;
  select count(*) into n from notifications where user_id = '00000000-0000-0000-0000-0000000000c1' and tipo = 'solicitud';
  if n <> 2 then raise exception 'FALLO T3: notificaciones al integrante (%)', n; end if;
  select count(*) into n from notifications where user_id = '00000000-0000-0000-0000-0000000000d1' and tipo = 'solicitud';
  if n < 1 then raise exception 'FALLO T3: no avisó a Dirección'; end if;

  -- T4: una falta ya marcada que se justifica después anula la advertencia automática.
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
  q := request_absence('showman', array[(select v from ctx where k = 'soloens')], 'Viaje');
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  insert into rehearsal_attendance (rehearsal_id, user_id, estado) values ((select v from ctx where k = 'soloens'), '00000000-0000-0000-0000-0000000000c2', 'falta');
  perform pg_temp.reset();
  if (select count(*) from member_incidents where user_id = '00000000-0000-0000-0000-0000000000c2' and anulada_at is null) <> 1 then raise exception 'FALLO T4: no hubo advertencia previa'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  perform request_review(q, true, null);
  perform pg_temp.reset();
  if (select count(*) from member_incidents where user_id = '00000000-0000-0000-0000-0000000000c2' and anulada_at is null) <> 0 then raise exception 'FALLO T4: la advertencia sigue'; end if;

  -- T5: comprobante de pago: Dirección no lo ve; Producción lo aprueba con monto corregido → pago registrado.
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  if not pg_temp.falla('select request_submit(''showman'', ''pago'', null, ''showman/00000000-0000-0000-0000-0000000000c2/x.pdf'', null, null, ''mensualidad'', ''2026-10-15'', 500, ''transferencia'')', 'Archivo no válido') then raise exception 'FALLO T5: archivo ajeno'; end if;
  if not pg_temp.falla('select request_submit(''showman'', ''pago'', null, ''showman/00000000-0000-0000-0000-0000000000c1/x.pdf'', null, null, ''mensualidad'', null, 500, ''transferencia'')', 'mes') then raise exception 'FALLO T5: sin mes'; end if;
  q := request_submit('showman', 'pago', 'Pago de octubre', 'showman/00000000-0000-0000-0000-0000000000c1/x.pdf', null, null, 'mensualidad', '2026-10-15', 500, 'transferencia');
  if (select periodo from member_requests where id = q) <> '2026-10-01' then raise exception 'FALLO T5: periodo'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  select count(*) into n from member_requests where id = q;
  if n <> 0 then raise exception 'FALLO T5: Dirección ve pagos'; end if;
  if not pg_temp.falla(format('select request_review(%L, true, null)', q), 'permiso') then raise exception 'FALLO T5: Dirección aprobó pago'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
  perform request_review(q, true, null, 450);
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  if (select monto from member_payments where user_id = auth.uid() and periodo = '2026-10-01') <> 450 then raise exception 'FALLO T5: pago no registrado'; end if;
  if (select monto_aprobado from member_requests where id = q) <> 450 then raise exception 'FALLO T5: monto aprobado'; end if;

  -- T6: documento de la lista aprobado → entregado en su expediente; "Otro" solo queda registrado.
  q := request_submit('showman', 'documento', null, 'showman/00000000-0000-0000-0000-0000000000c1/acta.pdf', (select v from ctx where k = 'acta'), null, null, null, null, null);
  if (select doc_nombre from member_requests where id = q) <> 'Acta de nacimiento' then raise exception 'FALLO T6: nombre de la lista'; end if;
  q2 := request_submit('showman', 'documento', null, 'showman/00000000-0000-0000-0000-0000000000c1/carta.pdf', null, 'Carta de la escuela', null, null, null, null);
  if not pg_temp.falla('select request_submit(''showman'', ''documento'', null, ''showman/00000000-0000-0000-0000-0000000000c1/a.pdf'', null, '' '', null, null, null, null)', 'nombre del documento') then raise exception 'FALLO T6: sin nombre'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
  perform request_review(q, true, null);
  perform request_review(q2, true, 'Recibida');
  perform pg_temp.reset();
  if (select entregado_at from member_docs where user_id = '00000000-0000-0000-0000-0000000000c1' and doc_type_id = (select v from ctx where k = 'acta')) is null then
    raise exception 'FALLO T6: no quedó entregado'; end if;

  -- T7: cancelar: solo lo propio y pendiente; el otro integrante no.
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  q := request_submit('showman', 'otro', 'Quiero hablar de mi beca', null, null, null, null, null, null, null);
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
  if not pg_temp.falla(format('select request_cancel(%L)', q), 'ya no se puede') then raise exception 'FALLO T7: canceló ajena'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  perform request_cancel(q);
  if not pg_temp.falla(format('select request_cancel(%L)', q), 'ya no se puede') then raise exception 'FALLO T7: canceló dos veces'; end if;
  -- "Otro" lo ve cualquiera de los tres permisos (Dirección por ensayos).
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  if (select count(*) from member_requests where id = q) <> 1 then raise exception 'FALLO T7: Dirección no ve "otro"'; end if;

  -- T8: el viejo "No podré ir" ya no se escribe directo.
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  begin
    insert into rehearsal_absences (rehearsal_id, user_id, motivo) values ((select v from ctx where k = 'lejos'), auth.uid(), 'x');
    raise exception 'FALLO T8: aviso viejo escribible';
  exception when insufficient_privilege then null;
  end;

  -- T9: el inicio del panel cuenta solicitudes del elenco por revisar.
  q := request_submit('showman', 'otro', 'Duda', null, null, null, null, null, null, null);
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  if not exists (select 1 from jsonb_array_elements(panel_home()->'pendientes') e where e->>'tipo' = 'solicitudes_elenco' and e->>'production_id' = 'showman') then
    raise exception 'FALLO T9: no aparece en el inicio'; end if;
  if (select nombre from request_people('showman') where user_id = '00000000-0000-0000-0000-0000000000c1') <> 'Rep' then raise exception 'FALLO T9: nombre'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
  if not pg_temp.falla('select * from request_people(''showman'')', 'No autorizado') then raise exception 'FALLO T9: fan ve nombres'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  -- Y la lista de asistencia muestra la solicitud.
  select aviso into aviso_txt from rehearsal_roster((select v from ctx where k = 'lejos')) where user_id = '00000000-0000-0000-0000-0000000000c1';
  if aviso_txt not like 'Falta justificada por solicitud%' then raise exception 'FALLO T9: roster (%)', aviso_txt; end if;
  perform pg_temp.reset();

  raise exception 'OK: 0070 solicitudes del elenco';
end $$;
