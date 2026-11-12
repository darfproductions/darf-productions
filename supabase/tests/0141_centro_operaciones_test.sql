-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0141 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000141a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't141_admin@test.local'),
  ('00000000-0000-0000-0000-000000141a02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't141_ana@test.local'),
  ('00000000-0000-0000-0000-000000141a03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't141_beto@test.local'),
  ('00000000-0000-0000-0000-000000141a04', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't141_dir@test.local'),
  ('00000000-0000-0000-0000-000000141a05', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't141_prod@test.local'),
  ('00000000-0000-0000-0000-000000141a06', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't141_maestro@test.local'),
  ('00000000-0000-0000-0000-000000141a07', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't141_ajeno@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-000000141a01';
update profiles set nombre = 'Ana López' where id = '00000000-0000-0000-0000-000000141a02';
update profiles set nombre = 'Dir Obra' where id = '00000000-0000-0000-0000-000000141a04';

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

insert into productions (id, nombre, estado, tipo, con_boleteria) values ('t141_obra', 'Obra 141', 'borrador', 'escuela', false);

do $$
declare adm text := '00000000-0000-0000-0000-000000141a01';
        ana text := '00000000-0000-0000-0000-000000141a02'; beto text := '00000000-0000-0000-0000-000000141a03';
        dir text := '00000000-0000-0000-0000-000000141a04'; prod text := '00000000-0000-0000-0000-000000141a05';
        mae text := '00000000-0000-0000-0000-000000141a06'; ajeno text := '00000000-0000-0000-0000-000000141a07';
        r1 uuid; r2 uuid; q uuid; faq uuid; j jsonb; n int; p_ana uuid; dt uuid; ok boolean;
begin
  perform pg_temp.as_user(adm);
  perform panel_add_member('t141_obra', 't141_dir@test.local', 'direccion');
  perform panel_add_member('t141_obra', 't141_prod@test.local', 'productor');
  perform panel_add_member('t141_obra', 't141_maestro@test.local', 'maestro');
  perform panel_add_member('t141_obra', 't141_ana@test.local', 'integrante');
  perform panel_add_member('t141_obra', 't141_beto@test.local', 'integrante');
  perform pg_temp.reset();
  update member_enrollment set ingreso = hoy_mx() - 365 where production_id = 't141_obra';
  insert into people (nombre, profile_id) values ('Ana López', ana::uuid) returning id into p_ana;
  insert into production_credits (production_id, person_id, tipo, papel) values ('t141_obra', p_ana, 'reparto', 'Lela');
  insert into production_puestos (production_id, puesto, area, user_id) values ('t141_obra', 'Productora', 'produccion', prod::uuid);
  insert into production_hitos (production_id, nombre, mes, dia) values ('t141_obra', 'Estreno', '2027-03-01', '2027-03-01');
  insert into production_lugares (production_id, tipo, nombre, direccion) values ('t141_obra', 'ensayo', 'Foro DARF', 'Calle 1');
  -- Dos ensayos: uno con encargado (la maestra), otro sin encargados.
  insert into rehearsals (production_id, titulo, inicia, encargados) values ('t141_obra', 'Con encargado', now() + interval '3 days', array[mae::uuid]) returning id into r1;
  insert into rehearsals (production_id, titulo, inicia) values ('t141_obra', 'Sin encargado', now() + interval '4 days') returning id into r2;
  insert into member_doc_types (production_id, nombre, obligatorio) values ('t141_obra', 'Reglamento firmado', true) returning id into dt;
  perform pg_temp.as_user(prod);
  insert into member_docs (doc_type_id, production_id, user_id, archivo_path, entregado_at) values (dt, 't141_obra', ana::uuid, 't141_obra/' || ana || '/regla.pdf', now());
  perform pg_temp.reset();

  -- T1: preguntas frecuentes. Producción escribe; el integrante lee pero no escribe; alguien ajeno no ve nada.
  perform pg_temp.as_user(prod);
  insert into production_faq (production_id, clave, pregunta, respuesta) values ('t141_obra', 'ensayos', '¿Dónde son los ensayos?', 'En el Foro DARF, sábados 10:00.') returning id into faq;
  insert into production_faq (production_id, pregunta, respuesta) values ('t141_obra', 'Sin respuesta todavía', '');
  perform pg_temp.reset();
  perform pg_temp.as_user(ana);
  if (select count(*) from production_faq where production_id = 't141_obra') <> 2 then raise exception 'FALLO T1a'; end if;
  begin
    update production_faq set respuesta = 'hackeada' where id = faq;
    ok := (select respuesta from production_faq where id = faq) = 'hackeada';
  exception when others then ok := false; end;
  if ok then raise exception 'FALLO T1b: el integrante editó una pregunta'; end if;
  -- Mi obra: solo las preguntas con respuesta; reparto, equipo (nombre y puesto, sin teléfono), hitos y lugares.
  j := obra_portal('t141_obra');
  if jsonb_array_length(j->'preguntas') <> 1 then raise exception 'FALLO T1c: %', j->'preguntas'; end if;
  if (j->'reparto'->0->>'papel') <> 'Lela' or not (j->'reparto'->0->>'yo')::boolean then raise exception 'FALLO T1d: %', j->'reparto'; end if;
  -- Equipo: productora, dirección artística y maestra (y Dirección general DARF, que la base agrega sola); no el elenco ni yo.
  if (select count(*) from jsonb_array_elements(j->'equipo') e where e->>'user_id' in (prod, dir, mae)) <> 3 then raise exception 'FALLO T1e: %', j->'equipo'; end if;
  if (select count(*) from jsonb_array_elements(j->'equipo') e where e->>'user_id' in (ana, beto)) <> 0 then raise exception 'FALLO T1e2: %', j->'equipo'; end if;
  if (select count(*) from jsonb_array_elements(j->'equipo') e where e->>'user_id' = prod and e->>'puesto' = 'Productora') <> 1 then raise exception 'FALLO T1f: %', j->'equipo'; end if;
  if (j->'equipo')::text like '%telefono%' then raise exception 'FALLO T1g'; end if;
  if (j->'hitos'->0->>'nombre') <> 'Estreno' or (j->'lugares'->0->>'nombre') <> 'Foro DARF' then raise exception 'FALLO T1h'; end if;
  perform pg_temp.reset();
  perform pg_temp.as_user(ajeno);
  if (select count(*) from production_faq where production_id = 't141_obra') <> 0 then raise exception 'FALLO T1i'; end if;
  if obra_portal('t141_obra') is not null then raise exception 'FALLO T1j'; end if;
  perform pg_temp.reset();

  -- T2: "Voy": el citado confirma (y puede quitarlo); alguien ajeno no; a un ensayo pasado no.
  perform pg_temp.as_user(ana);
  perform rehearsal_confirm(r1);
  perform rehearsal_confirm(r1);
  if (select count(*) from rehearsal_confirmations where rehearsal_id = r1 and user_id = ana::uuid) <> 1 then raise exception 'FALLO T2a'; end if;
  perform rehearsal_confirm(r1, false);
  if (select count(*) from rehearsal_confirmations where rehearsal_id = r1) <> 0 then raise exception 'FALLO T2b'; end if;
  perform rehearsal_confirm(r1);
  perform pg_temp.reset();
  perform pg_temp.as_user(ajeno);
  begin perform rehearsal_confirm(r1); raise exception 'FALLO T2c'; exception when others then if sqlerrm = 'FALLO T2c' then raise; end if; end;
  if (select count(*) from rehearsal_confirmations where rehearsal_id = r1) <> 0 then raise exception 'FALLO T2d: el ajeno ve confirmaciones'; end if;
  perform pg_temp.reset();
  update rehearsals set inicia = now() - interval '1 hour' where id = r2;
  perform pg_temp.as_user(beto);
  begin perform rehearsal_confirm(r2); raise exception 'FALLO T2e'; exception when others then if sqlerrm = 'FALLO T2e' then raise; end if; end;
  perform pg_temp.reset();
  update rehearsals set inicia = now() + interval '4 days' where id = r2;
  -- La encargada y quien gestiona ensayos ven quién confirmó.
  perform pg_temp.as_user(mae);
  if (select count(*) from rehearsal_confirmations where rehearsal_id = r1) <> 1 then raise exception 'FALLO T2f'; end if;
  perform pg_temp.reset();
  perform pg_temp.as_user(dir);
  if (select count(*) from rehearsal_confirmations where rehearsal_id = r1) <> 1 then raise exception 'FALLO T2g'; end if;
  perform pg_temp.reset();

  -- T3: una falta al ensayo con encargada avisa solo a ella; al ensayo sin encargados, a quien gestiona ensayos.
  delete from notifications where production_id = 't141_obra';
  perform pg_temp.as_user(ana);
  perform request_absence('t141_obra', array[r1], 'Examen final');
  set constraints all immediate;
  perform pg_temp.reset();
  if (select count(*) from notifications where production_id = 't141_obra' and tipo = 'solicitud') <> 1 then raise exception 'FALLO T3a: %', (select count(*) from notifications where production_id = 't141_obra'); end if;
  if (select user_id from notifications where production_id = 't141_obra' and tipo = 'solicitud') <> mae::uuid then raise exception 'FALLO T3b'; end if;
  delete from notifications where production_id = 't141_obra';
  perform pg_temp.as_user(beto);
  perform request_absence('t141_obra', array[r2], 'Viaje');
  set constraints all immediate;
  perform pg_temp.reset();
  select to_jsonb(array_agg(user_id order by user_id)) into j from (select user_id::text from notifications where production_id = 't141_obra' and tipo = 'solicitud') x;
  if not (j ? dir) or not (j ? prod) or (j ? mae) then raise exception 'FALLO T3c: %', j; end if;

  -- T4: "otra solicitud" avisa a Producción (dirección de la obra y productor), no a la maestra ni a dirección artística.
  delete from notifications where production_id = 't141_obra';
  perform pg_temp.as_user(ana);
  perform request_submit('t141_obra', 'otro', 'Quiero una beca', null, null, null, null, null, null, null);
  set constraints all immediate;
  perform pg_temp.reset();
  select to_jsonb(array_agg(user_id order by user_id)) into j from (select user_id::text from notifications where production_id = 't141_obra' and tipo = 'solicitud') x;
  if not (j ? prod) or (j ? mae) or (j ? dir) or (j ? ana) then raise exception 'FALLO T4a: %', j; end if;

  -- T5: mensaje a alguien del equipo: le llega solo a esa persona con el texto; ella lo ve y puede responder; a un
  -- compañero de elenco no se le puede escribir.
  delete from notifications where production_id = 't141_obra';
  perform pg_temp.as_user(ana);
  q := request_mensaje('t141_obra', prod::uuid, '¿Puedo llegar 7:30 el sábado? Salgo de la escuela tarde.');
  begin perform request_mensaje('t141_obra', beto::uuid, 'hola'); raise exception 'FALLO T5a'; exception when others then if sqlerrm = 'FALLO T5a' then raise; end if; end;
  begin perform request_mensaje('t141_obra', prod::uuid, '  '); raise exception 'FALLO T5b'; exception when others then if sqlerrm = 'FALLO T5b' then raise; end if; end;
  set constraints all immediate;
  perform pg_temp.reset();
  if (select count(*) from notifications where production_id = 't141_obra' and tipo = 'solicitud') <> 1 then raise exception 'FALLO T5c'; end if;
  if (select user_id from notifications where production_id = 't141_obra' and tipo = 'solicitud') <> prod::uuid then raise exception 'FALLO T5d'; end if;
  if (select titulo from notifications where production_id = 't141_obra' and tipo = 'solicitud') not like 'Ana López te escribió' then raise exception 'FALLO T5e'; end if;
  if (select detalle from notifications where production_id = 't141_obra' and tipo = 'solicitud') not like '%7:30%' then raise exception 'FALLO T5f'; end if;
  perform pg_temp.as_user(beto);
  if (select count(*) from member_requests where id = q) <> 0 then raise exception 'FALLO T5g: un compañero ve un mensaje que no es para él'; end if;
  perform pg_temp.reset();
  perform pg_temp.as_user(prod);
  if (select count(*) from member_requests where id = q) <> 1 then raise exception 'FALLO T5h'; end if;
  perform request_review(q, true, 'Sí, llega 7:30.');
  set constraints all immediate;
  perform pg_temp.reset();
  if (select count(*) from notifications where production_id = 't141_obra' and user_id = ana::uuid and titulo = 'Te respondieron tu mensaje') <> 1 then raise exception 'FALLO T5i'; end if;

  -- T6: ficha completa. Quien gestiona expedientes y pagos ve documentos y pagos; quien solo lleva ensayos, no;
  -- alguien ajeno no puede ni abrirla. La asistencia junta presentes, retardos y faltas.
  insert into member_payments (production_id, user_id, periodo, monto, metodo, registrado_por, concepto) values ('t141_obra', ana::uuid, '2026-10-01', 800, 'efectivo', prod::uuid, 'mensualidad');
  insert into rehearsal_attendance (rehearsal_id, user_id, estado, minutos_tarde) values (r1, ana::uuid, 'retardo', 12);
  update rehearsals set inicia = now() - interval '1 day' where id = r1;
  insert into member_incidents (production_id, user_id, tipo, nivel, descripcion, fecha, created_by) values ('t141_obra', ana::uuid, 'retardo', 'advertencia', 'Retardo', current_date, prod::uuid);
  perform pg_temp.as_user(prod);
  j := persona_ficha(ana::uuid);
  if jsonb_array_length(j->'obras') <> 1 or (j->'obras'->0->>'obra') <> 'Obra 141' then raise exception 'FALLO T6a: %', j->'obras'; end if;
  if jsonb_array_length(j->'documentos') <> 1 or (j->'documentos'->0->>'entregado_at') is null then raise exception 'FALLO T6b: %', j->'documentos'; end if;
  if jsonb_array_length(j->'pagos') <> 1 or (j->'pagos'->0->>'monto')::numeric <> 800 then raise exception 'FALLO T6c: %', j->'pagos'; end if;
  if (j->'asistencia'->0->>'retardos')::int <> 1 or (j->'asistencia'->0->>'citados')::int <> 1 then raise exception 'FALLO T6d: %', j->'asistencia'; end if;
  if jsonb_array_length(j->'ultimos') <> 1 or (j->'ultimos'->0->>'minutos_tarde')::int <> 12 then raise exception 'FALLO T6e: %', j->'ultimos'; end if;
  if jsonb_array_length(j->'incidencias') <> 1 then raise exception 'FALLO T6f'; end if;
  perform pg_temp.reset();
  -- La maestra lleva ensayos (0099): abre la ficha y ve asistencia, pero no documentos ni pagos.
  perform pg_temp.as_user(mae);
  j := persona_ficha(ana::uuid);
  if jsonb_array_length(j->'documentos') <> 0 or jsonb_array_length(j->'pagos') <> 0 or jsonb_array_length(j->'asistencia') <> 1 then raise exception 'FALLO T6g: %', j; end if;
  perform pg_temp.reset();
  perform pg_temp.as_user(dir);
  j := persona_ficha(ana::uuid);
  if jsonb_array_length(j->'documentos') <> 0 or jsonb_array_length(j->'pagos') <> 0 then raise exception 'FALLO T6h: dirección artística ve documentos o pagos'; end if;
  if jsonb_array_length(j->'asistencia') <> 1 or jsonb_array_length(j->'incidencias') <> 1 then raise exception 'FALLO T6i'; end if;
  if (j->'obras'->0->>'documentos')::boolean or not (j->'obras'->0->>'asistencia')::boolean then raise exception 'FALLO T6j'; end if;
  perform pg_temp.reset();
  perform pg_temp.as_user(ajeno);
  begin j := persona_ficha(ana::uuid); ok := true; exception when others then ok := false; end;
  if ok then raise exception 'FALLO T6k'; end if;
  perform pg_temp.reset();

  raise notice '0141 OK';
end $$;
