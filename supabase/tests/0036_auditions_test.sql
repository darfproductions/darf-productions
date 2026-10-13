-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0031–0036 aplicadas.

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_admin@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_fan1@test.local'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_fan2@test.local'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_menor@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_dir@test.local'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_reg@test.local'),
  ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_juez@test.local');
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

create temp table ctx (aud uuid, borrador uuid, rol1 uuid, rol2 uuid, slot1 uuid, slot2 uuid, campo uuid, app1 uuid, qr1 text, app3 uuid);
grant all on ctx to authenticated, anon;

-- Dirección artística crea la convocatoria (Showman) y la abre.
do $$ declare a uuid; b uuid; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform panel_add_member('showman', 't_dir@test.local', 'direccion');
  perform panel_add_member('showman', 't_reg@test.local', 'registro');
  perform panel_add_member('showman', 't_juez@test.local', 'juez');
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  insert into auditions (production_id, titulo, estado, edad_min) values ('showman', 'Audición Showman', 'abierta', 10) returning id into a;
  insert into auditions (production_id, titulo) values ('showman', 'Borrador') returning id into b;
  insert into ctx (aud, borrador) values (a, b);
  reset role;
end $$;
do $$ declare a uuid := (select aud from ctx); r1 uuid; r2 uuid; s1 uuid; s2 uuid; f uuid; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  insert into audition_roles (audition_id, nombre, orden) values (a, 'Barnum', 1) returning id into r1;
  insert into audition_roles (audition_id, nombre, orden) values (a, 'Jenny', 2) returning id into r2;
  insert into audition_slots (audition_id, inicia, cupo) values (a, now() + interval '10 days', 1) returning id into s1;
  insert into audition_slots (audition_id, inicia, cupo) values (a, now() + interval '10 days 1 hour', 5) returning id into s2;
  insert into audition_fields (audition_id, etiqueta, tipo, obligatorio) values (a, 'Video de canto', 'enlace', true) returning id into f;
  reset role;
  update ctx set rol1 = r1, rol2 = r2, slot1 = s1, slot2 = s2, campo = f;
end $$;

-- T1: el público ve la convocatoria abierta (no el borrador) y los cupos
do $$ declare n int; begin
  perform pg_temp.as_anon();
  select count(*) into n from auditions where id in ((select aud from ctx), (select borrador from ctx));
  if n <> 1 then raise exception 'FALLO T1: el público ve % convocatorias', n; end if;
  select count(*) into n from audition_slot_availability((select aud from ctx));
  if n <> 2 then raise exception 'FALLO T1: % horarios', n; end if;
  reset role;
end $$;

-- T2: inscripción, cupo lleno, campo obligatorio
do $$ declare r json; p jsonb; begin
  p := jsonb_build_object('nombre', 'Ana Fan', 'telefono', '55', 'fecha_nacimiento', '2000-01-01', 'slot_id', (select slot1 from ctx),
       'roles', jsonb_build_array((select rol1 from ctx)), 'respuestas', jsonb_build_object((select campo from ctx)::text, 'https://youtu.be/x'),
       'consentimiento_datos', true);
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  r := audition_apply((select aud from ctx), p);
  update ctx set app1 = (r->>'application_id')::uuid;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
  begin
    perform audition_apply((select aud from ctx), p || jsonb_build_object('nombre', 'Beto'));
    raise exception 'FALLO T2: pasó el cupo';
  exception when raise_exception then
    if sqlerrm not like 'Ese horario ya está lleno%' then raise exception 'FALLO T2a: %', sqlerrm; end if;
  end;
  begin
    perform audition_apply((select aud from ctx), p || jsonb_build_object('slot_id', (select slot2 from ctx), 'respuestas', '{}'::jsonb));
    raise exception 'FALLO T2: aceptó sin campo obligatorio';
  exception when raise_exception then
    if sqlerrm not like 'Falta responder%' then raise exception 'FALLO T2b: %', sqlerrm; end if;
  end;
  perform audition_apply((select aud from ctx), p || jsonb_build_object('nombre', 'Beto', 'slot_id', (select slot2 from ctx)));
  begin
    perform audition_apply((select borrador from ctx), p);
    raise exception 'FALLO T2: se inscribió a un borrador';
  exception when raise_exception then
    if sqlerrm not like '%no está abierta%' then raise exception 'FALLO T2c: %', sqlerrm; end if;
  end;
  reset role;
  update ctx set qr1 = (select qr_token::text from audition_applications where id = (select app1 from ctx));
end $$;

-- T3: menor de edad necesita tutor y autorización; edad mínima
do $$ declare r json; p jsonb; begin
  p := jsonb_build_object('nombre', 'Carla', 'telefono', '56', 'fecha_nacimiento', (hoy_mx() - interval '14 years')::date::text,
       'slot_id', (select slot2 from ctx), 'respuestas', jsonb_build_object((select campo from ctx)::text, 'x'), 'consentimiento_datos', true);
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
  begin
    perform audition_apply((select aud from ctx), p);
    raise exception 'FALLO T3: menor sin tutor';
  exception when raise_exception then
    if sqlerrm not like '%menor de edad%' then raise exception 'FALLO T3a: %', sqlerrm; end if;
  end;
  begin
    perform audition_apply((select aud from ctx), p || jsonb_build_object('fecha_nacimiento', (hoy_mx() - interval '8 years')::date::text));
    raise exception 'FALLO T3: aceptó menor de la edad mínima';
  exception when raise_exception then
    if sqlerrm not like '%mayores de 10%' then raise exception 'FALLO T3b: %', sqlerrm; end if;
  end;
  r := audition_apply((select aud from ctx), p || jsonb_build_object('tutor_nombre', 'Mamá', 'tutor_telefono', '57', 'consentimiento_tutor', true));
  if (r->>'es_menor')::boolean is not true then raise exception 'FALLO T3c: %', r; end if;
  update ctx set app3 = (r->>'application_id')::uuid;
  reset role;
end $$;

-- T4: privacidad: cada aspirante ve solo lo suyo; registro y juez no leen la tabla (sin teléfonos)
do $$ declare n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  select count(*) into n from audition_applications;
  if n <> 1 then raise exception 'FALLO T4: aspirante ve % solicitudes', n; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
  select count(*) into n from audition_applications;
  if n <> 0 then raise exception 'FALLO T4: registro lee % solicitudes completas', n; end if;
  select count(*) into n from audition_desk_list((select aud from ctx));
  if n <> 3 then raise exception 'FALLO T4: registro ve % en su lista', n; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d3');
  select count(*) into n from audition_applications;
  if n <> 0 then raise exception 'FALLO T4: juez lee % solicitudes completas', n; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  select count(*) into n from audition_applications;
  if n <> 3 then raise exception 'FALLO T4: dirección ve %', n; end if;
  reset role;
end $$;

-- T5: día de la audición: QR → número 1; repetido; alta rápida → número 2; un fan no puede
do $$ declare r json; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
  r := audition_checkin((select aud from ctx), upper((select qr1 from ctx)));
  if r->>'result' <> 'ok' or (r->>'numero')::int <> 1 then raise exception 'FALLO T5: %', r; end if;
  r := audition_checkin((select aud from ctx), (select qr1 from ctx));
  if r->>'result' <> 'ya_registrado' then raise exception 'FALLO T5b: %', r; end if;
  r := audition_walk_in((select aud from ctx), jsonb_build_object('nombre', 'Llegó Sin Cita', 'telefono', '58', 'fecha_nacimiento', '1999-05-05'));
  if (r->>'numero')::int <> 2 then raise exception 'FALLO T5c: %', r; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
  begin
    perform audition_checkin((select aud from ctx), (select qr1 from ctx));
    raise exception 'FALLO T5: fan registró asistencia';
  exception when raise_exception then
    if sqlerrm not like 'No autorizado%' then raise exception 'FALLO T5d: %', sqlerrm; end if;
  end;
  reset role;
end $$;

-- T6: el juez ve solo a quienes llegaron y califica; fuera de rango falla; resultados para dirección
do $$ declare n int; r record; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d3');
  select count(*) into n from audition_judge_list((select aud from ctx), 1);
  if n <> 2 then raise exception 'FALLO T6: juez ve %', n; end if;
  insert into audition_scores (application_id, canto, baile, actuacion, actitud, notas) values ((select app1 from ctx), 5, 4, 5, 4, 'Gran voz');
  begin
    insert into audition_scores (application_id, canto) values ((select app3 from ctx), 7);
    raise exception 'FALLO T6: aceptó un 7';
  exception when check_violation then null;
  end;
  begin
    perform audition_board((select aud from ctx), 1);
    raise exception 'FALLO T6: juez vio resultados consolidados';
  exception when raise_exception then
    if sqlerrm not like 'No autorizado%' then raise exception 'FALLO T6b: %', sqlerrm; end if;
  end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  select * into r from audition_board((select aud from ctx), 1) where id = (select app1 from ctx);
  if r.promedio <> 4.5 or r.jueces <> 1 then raise exception 'FALLO T6c: promedio % jueces %', r.promedio, r.jueces; end if;
  update audition_applications set estado = 'callback', ronda = 2 where id = (select app1 from ctx);
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d3');
  select count(*) into n from audition_judge_list((select aud from ctx), 2);
  if n <> 1 then raise exception 'FALLO T6d: callback muestra %', n; end if;
  update audition_applications set estado = 'seleccionado' where id = (select app1 from ctx);
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO T6: juez cambió el estado'; end if;
  reset role;
end $$;

-- T7: fotos privadas: cada aspirante en su carpeta; el juez puede verlas; otro aspirante no
do $$ declare n int; a text := (select aud from ctx)::text; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  insert into storage.objects (bucket_id, name, owner) values ('audiciones', a || '/00000000-0000-0000-0000-0000000000c1/foto.jpg', '00000000-0000-0000-0000-0000000000c1');
  begin
    insert into storage.objects (bucket_id, name, owner) values ('audiciones', a || '/00000000-0000-0000-0000-0000000000c2/hack.jpg', '00000000-0000-0000-0000-0000000000c1');
    raise exception 'FALLO T7: subió en carpeta ajena';
  exception when others then
    if sqlerrm not like '%row-level security%' then raise exception 'FALLO T7a: %', sqlerrm; end if;
  end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
  select count(*) into n from storage.objects where bucket_id = 'audiciones';
  if n <> 0 then raise exception 'FALLO T7: otro aspirante ve fotos'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d3');
  select count(*) into n from storage.objects where bucket_id = 'audiciones';
  if n <> 1 then raise exception 'FALLO T7: juez no ve la foto'; end if;
  reset role;
end $$;

-- T8: cancelar la propia inscripción (si no ha llegado) y volver a inscribirse
do $$ declare n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
  perform audition_cancel_mine((select app3 from ctx));
  if (select estado from audition_applications where id = (select app3 from ctx)) <> 'cancelado' then raise exception 'FALLO T8'; end if;
  perform audition_apply((select aud from ctx), jsonb_build_object('nombre', 'Carla', 'telefono', '56', 'fecha_nacimiento', (hoy_mx() - interval '14 years')::date::text,
    'slot_id', (select slot2 from ctx), 'respuestas', jsonb_build_object((select campo from ctx)::text, 'x'), 'consentimiento_datos', true,
    'tutor_nombre', 'Mamá', 'tutor_telefono', '57', 'consentimiento_tutor', true));
  if (select estado from audition_applications where id = (select app3 from ctx)) <> 'inscrito' then raise exception 'FALLO T8b'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  begin
    perform audition_cancel_mine((select app1 from ctx));
    raise exception 'FALLO T8: canceló después de llegar';
  exception when raise_exception then
    if sqlerrm not like 'No se pudo cancelar%' then raise exception 'FALLO T8c: %', sqlerrm; end if;
  end;
  reset role;
end $$;

do $$ begin raise exception 'OK: 0036 pruebas T1–T8 (se aborta a propósito para no persistir)'; end $$;
