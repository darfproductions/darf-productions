-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0140 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000140a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't140_admin@test.local'),
  ('00000000-0000-0000-0000-000000140a02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't140_a@test.local'),
  ('00000000-0000-0000-0000-000000140a03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't140_b@test.local'),
  ('00000000-0000-0000-0000-000000140a04', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't140_c@test.local'),
  ('00000000-0000-0000-0000-000000140a05', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't140_d@test.local'),
  ('00000000-0000-0000-0000-000000140a06', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't140_e@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-000000140a01';

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

insert into productions (id, nombre, estado) values ('t140_obra', 'Obra 140', 'borrador');

do $$
declare adm text := '00000000-0000-0000-0000-000000140a01';
        ua text := '00000000-0000-0000-0000-000000140a02'; ub text := '00000000-0000-0000-0000-000000140a03'; uc text := '00000000-0000-0000-0000-000000140a04';
        ud text := '00000000-0000-0000-0000-000000140a05'; ue text := '00000000-0000-0000-0000-000000140a06';
        aid uuid; fg uuid; a uuid; b uuid; c uuid; d uuid; e uuid; f uuid; s1 uuid; ops text[]; j json; ok boolean;
begin
  -- Como Teen Beach Movie: turnos antes del día ("previa") y una pregunta abierta "Grupo" con respuestas escritas de
  -- formas distintas. Un horario con hora de fin.
  insert into auditions (production_id, titulo, estado, numeracion, sede) values ('t140_obra', 'Audición 140', 'abierta', 'previa', 'Foro DARF') returning id into aid;
  insert into audition_slots (audition_id, inicia, termina, cupo) values (aid, '2026-11-08T17:50:00Z', '2026-11-08T18:10:00Z', 10) returning id into s1;
  begin insert into audition_slots (audition_id, inicia, termina, cupo) values (aid, '2026-11-08T17:50:00Z', '2026-11-08T17:40:00Z', 10); ok := false; exception when check_violation then ok := true; end;
  if not ok then raise exception 'FALLO T0: termina antes de inicia'; end if;
  insert into audition_fields (audition_id, etiqueta, tipo, orden) values (aid, 'Grupo', 'texto', 1) returning id into fg;
  insert into audition_applications (audition_id, user_id, nombre, fecha_nacimiento, telefono, respuestas) values (aid, ua::uuid, 'Ana López', '2010-01-01', '551', jsonb_build_object(fg::text, 'Grupo B')) returning id into a;
  insert into audition_applications (audition_id, user_id, nombre, fecha_nacimiento, telefono, respuestas) values (aid, ub::uuid, 'Beto Ruiz', '2010-01-01', '552', jsonb_build_object(fg::text, 'A')) returning id into b;
  insert into audition_applications (audition_id, user_id, nombre, fecha_nacimiento, telefono, respuestas) values (aid, uc::uuid, 'Caro Díaz', '2010-01-01', '553', jsonb_build_object(fg::text, ' grupo a. ')) returning id into c;
  insert into audition_applications (audition_id, user_id, nombre, fecha_nacimiento, telefono, respuestas) values (aid, ud::uuid, 'Dani Mora', '2010-01-01', '554', jsonb_build_object(fg::text, 'b')) returning id into d;
  insert into audition_applications (audition_id, user_id, nombre, fecha_nacimiento, telefono, respuestas) values (aid, ue::uuid, 'Eli Vega', '2010-01-01', '555', jsonb_build_object(fg::text, 'Grupo A')) returning id into e;
  update audition_applications set created_at = timestamptz '2026-10-01T10:00:00Z' + (telefono::int - 550) * interval '1 min' where audition_id = aid;

  -- T1: antes de repartir turnos nadie tiene número (aunque la numeración sea "previa").
  if (select count(*) from audition_applications where audition_id = aid and numero is not null) <> 0 then raise exception 'FALLO T1a'; end if;

  -- T2: marcar la pregunta como Grupo la vuelve opción múltiple con las respuestas que ya existen; cada respuesta se reescribe.
  perform pg_temp.as_user(adm);
  perform audition_pregunta_sistema(aid, 'grupo', fg);
  perform pg_temp.reset();
  select opciones into ops from audition_fields where id = fg;
  if (select tipo from audition_fields where id = fg) <> 'opcion' then raise exception 'FALLO T2a'; end if;
  if cardinality(ops) <> 2 then raise exception 'FALLO T2b: %', ops; end if;
  if (select respuestas->>fg::text from audition_applications where id = c) <> (select respuestas->>fg::text from audition_applications where id = b) then raise exception 'FALLO T2c'; end if;
  if (select respuestas->>fg::text from audition_applications where id = d) <> (select respuestas->>fg::text from audition_applications where id = a) then raise exception 'FALLO T2d'; end if;
  -- La forma más usada gana; en empate, la más completa ("Grupo A", no "A").
  if (select respuestas->>fg::text from audition_applications where id = b) <> 'Grupo A' then raise exception 'FALLO T2e'; end if;
  if (select respuestas->>fg::text from audition_applications where id = d) <> 'Grupo B' then raise exception 'FALLO T2f'; end if;

  -- T3: "Asignar turnos ahora" reparte a TODOS por grupo (hay pregunta de Grupo): grupo A primero, luego B; 1..5.
  perform pg_temp.as_user(adm);
  if audition_numerar_ahora(aid) <> 5 then raise exception 'FALLO T3z'; end if;
  perform pg_temp.reset();
  if (select numeros_asignados_at from auditions where id = aid) is null then raise exception 'FALLO T3y'; end if;
  -- Quien se inscribe después pasa al último.
  insert into audition_applications (audition_id, nombre, fecha_nacimiento, telefono, walk_in) values (aid, 'Fede Tarde', '2010-01-01', '556', true) returning id into f;
  if (select numero from audition_applications where id = f) <> 6 then raise exception 'FALLO T3x'; end if;
  delete from audition_applications where id = f;
  -- Las opciones quedan en orden natural de clave: "a" antes que "b".
  if (select numero from audition_applications where id = b) > (select numero from audition_applications where id = a) then raise exception 'FALLO T3a'; end if;
  if (select array_agg(numero order by numero) from audition_applications where audition_id = aid) <> '{1,2,3,4,5}' then raise exception 'FALLO T3b'; end if;

  -- T4: Ana (grupo B) y Beto (grupo A) pasan juntos: comparten número y el turno va donde le toca a Beto (grupo A).
  perform pg_temp.as_user(adm);
  perform audition_agrupar(aid, array[a, b]);
  perform audition_reordenar(aid, 'grupo');
  perform pg_temp.reset();
  if (select numero from audition_applications where id = a) <> (select numero from audition_applications where id = b) then raise exception 'FALLO T4a'; end if;
  if (select numero from audition_applications where id = a) > (select numero from audition_applications where id = d) then raise exception 'FALLO T4b'; end if;
  -- Sin huecos: 4 turnos → números 1..4.
  if (select max(numero) from audition_applications where audition_id = aid) <> 4 then raise exception 'FALLO T4c'; end if;

  -- T5: mover a mano: Dani (grupo B, último) al lugar 1; luego abajo; luego al final.
  perform pg_temp.as_user(adm);
  perform audition_mover(aid, d, null, 1);
  perform pg_temp.reset();
  if (select numero from audition_applications where id = d) <> 1 then raise exception 'FALLO T5a'; end if;
  perform pg_temp.as_user(adm);
  perform audition_mover(aid, d, 'abajo');
  perform pg_temp.reset();
  if (select numero from audition_applications where id = d) <> 2 then raise exception 'FALLO T5b'; end if;
  perform pg_temp.as_user(adm);
  perform audition_al_final(aid, d);
  perform pg_temp.reset();
  if (select numero from audition_applications where id = d) <> 4 then raise exception 'FALLO T5c'; end if;
  if (select count(distinct numero) from audition_applications where audition_id = aid) <> 4 then raise exception 'FALLO T5d'; end if;

  -- T6: separar renumera sin huecos: 5 turnos.
  perform pg_temp.as_user(adm);
  perform audition_separar(aid, a);
  perform pg_temp.reset();
  if (select max(numero) from audition_applications where audition_id = aid) <> 5 then raise exception 'FALLO T6'; end if;

  -- T6b: el aviso de turno lleva el horario con hora de fin y la sede.
  update audition_applications set slot_id = s1 where id = d;
  perform pg_temp.as_user(adm);
  if audition_avisar_turnos(aid) < 1 then raise exception 'FALLO T6b'; end if;
  perform pg_temp.reset();
  if not exists (select 1 from notifications where user_id = ud::uuid and titulo like 'Tu turno: Nº %' and titulo like '%11:50 a.m. a 12:10 p.m.%') then raise exception 'FALLO T6c'; end if;

  -- T7: llegada en modo "llegada": el compañero de grupo toma el mismo número que quien ya llegó.
  update auditions set numeracion = 'llegada', numeros_asignados_at = null where id = aid;
  update audition_applications set numero = null where audition_id = aid;
  perform pg_temp.as_user(adm);
  perform audition_agrupar(aid, array[c, e]);
  j := audition_checkin(aid, c::text);
  if (j->>'result') <> 'ok' then raise exception 'FALLO T7a: %', j; end if;
  j := audition_checkin(aid, e::text);
  perform pg_temp.reset();
  if (select numero from audition_applications where id = e) <> (select numero from audition_applications where id = c) then raise exception 'FALLO T7b'; end if;

  -- T8: alguien ajeno no mueve la fila.
  perform pg_temp.as_user(ua);
  begin perform audition_mover(aid, d, 'arriba'); raise exception 'FALLO T8'; exception when others then if sqlerrm = 'FALLO T8' then raise; end if; end;
  perform pg_temp.reset();

  raise notice '0140 OK';
end $$;
