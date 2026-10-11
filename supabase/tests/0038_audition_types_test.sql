-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0031–0038 aplicadas.

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_admin@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_fan1@test.local'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_fan2@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_dir@test.local'),
  ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_juez@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-0000000000a1';

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create temp table ctx (linea uuid, inv uuid, pres uuid, campo uuid, app1 uuid, tpl uuid);
grant all on ctx to authenticated, anon;

-- T1: audición en línea con criterios propios: sin horario, el juez califica sin "llegada"
do $$ declare l uuid; f uuid; r json; n int; v jsonb; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  insert into auditions (titulo, estado, modalidad, criterios)
  values ('Aéreo en línea', 'abierta', 'en_linea', '[{"k":"tecnica","l":"Técnica"},{"k":"fuerza","l":"Fuerza"}]') returning id into l;
  insert into audition_slots (audition_id, inicia, cupo) values (l, now() + interval '3 days', 5);
  insert into audition_fields (audition_id, etiqueta, tipo, obligatorio) values (l, 'Video de tu rutina', 'enlace', true) returning id into f;
  perform audition_add_member(l, 't_juez@test.local', 'juez');
  insert into ctx (linea, campo) values (l, f);
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  r := audition_apply(l, jsonb_build_object('nombre', 'Ana', 'telefono', '55', 'fecha_nacimiento', '1995-01-01', 'consentimiento_datos', true,
        'respuestas', jsonb_build_object(f::text, 'https://youtu.be/rutina')));
  update ctx set app1 = (r->>'application_id')::uuid;
  if (select slot_id from audition_applications where id = (r->>'application_id')::uuid) is not null then
    raise exception 'FALLO T1a: en línea quedó con horario';
  end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d3');
  select count(*), max(q.enlaces::text) into n, v from audition_judge_queue(l, 1) q;
  if n <> 1 then raise exception 'FALLO T1b: el juez ve % aspirantes en línea', n; end if;
  if v::text not like '%https://youtu.be/rutina%' then raise exception 'FALLO T1c: el juez no ve el video: %', v; end if;
  insert into audition_scores (application_id, puntos, notas) values ((select app1 from ctx), '{"tecnica":5,"fuerza":4}', 'Limpia');
  begin
    update audition_scores set puntos = '{"canto":5}' where application_id = (select app1 from ctx);
    raise exception 'FALLO T1: aceptó un criterio que no es de la convocatoria';
  exception when check_violation then null;
  end;
  begin
    update audition_scores set puntos = '{"tecnica":6}' where application_id = (select app1 from ctx);
    raise exception 'FALLO T1: aceptó un 6';
  exception when check_violation then null;
  end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  select q.promedios into v from audition_board_v2(l, 1) q;
  if (v->>'tecnica')::numeric <> 5 or (v->>'fuerza')::numeric <> 4 then raise exception 'FALLO T1d: promedios %', v; end if;
  if (select q.promedio from audition_board_v2(l, 1) q) <> 4.5 then raise exception 'FALLO T1e: promedio general'; end if;
  reset role;
end $$;

-- T2: por invitación (siempre solo con enlace); solo entra el correo invitado
do $$ declare i uuid; r json; n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  begin
    insert into auditions (titulo, solo_invitados) values ('Pública por invitación', true);
    raise exception 'FALLO T2: aceptó invitación visible para todos';
  exception when check_violation then null;
  end;
  insert into auditions (titulo, estado, solo_invitados, visibilidad) values ('Particular', 'abierta', true, 'enlace') returning id into i;
  update ctx set inv = i;
  insert into audition_invites (audition_id, email) values (i, 'T_FAN2@test.local');
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  begin
    perform audition_apply(i, jsonb_build_object('nombre', 'Ana', 'telefono', '55', 'fecha_nacimiento', '1995-01-01', 'consentimiento_datos', true));
    raise exception 'FALLO T2: se inscribió alguien no invitado';
  exception when raise_exception then
    if sqlerrm not like '%solo por invitación%' then raise exception 'FALLO T2a: %', sqlerrm; end if;
  end;
  select count(*) into n from audition_invites;
  if n <> 0 then raise exception 'FALLO T2b: un aspirante ve la lista de invitados'; end if;
  begin
    insert into audition_invites (audition_id, email) values (i, 't_fan1@test.local');
    raise exception 'FALLO T2: un aspirante se invitó solo';
  exception when others then
    if sqlerrm not like '%row-level security%' then raise exception 'FALLO T2c: %', sqlerrm; end if;
  end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
  select count(*) into n from my_audition_invites() where audition_id = i and not inscrito;
  if n <> 1 then raise exception 'FALLO T2d: el invitado no ve su invitación'; end if;
  r := audition_apply(i, jsonb_build_object('nombre', 'Beto', 'telefono', '55', 'fecha_nacimiento', '1996-01-01', 'consentimiento_datos', true));
  select count(*) into n from my_audition_invites() where audition_id = i and inscrito;
  if n <> 1 then raise exception 'FALLO T2e: la invitación no se marca como inscrito'; end if;
  reset role;
end $$;

-- T3: criterios inválidos
do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  begin
    insert into auditions (titulo, criterios) values ('Sin criterios', '[]');
    raise exception 'FALLO T3: aceptó cero criterios';
  exception when check_violation then null;
  end;
  begin
    insert into auditions (titulo, criterios) values ('Repetidos', '[{"k":"a","l":"A"},{"k":"a","l":"B"}]');
    raise exception 'FALLO T3: aceptó criterios repetidos';
  exception when check_violation then null;
  end;
  reset role;
end $$;

-- T4: plantillas propias: las usa quien gestiona audiciones; solo su autor o el Director las borra
do $$ declare t uuid; n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform panel_add_member('showman', 't_dir@test.local', 'direccion');
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  insert into audition_templates (nombre, opciones, criterios, preguntas)
  values ('Aéreo DARF', '{"modalidad":"en_linea"}', '[{"k":"tecnica","l":"Técnica"}]', '[{"etiqueta":"Disciplina","tipo":"texto"}]') returning id into t;
  update ctx set tpl = t;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  select count(*) into n from audition_templates;
  if n <> 0 then raise exception 'FALLO T4a: un aspirante ve plantillas'; end if;
  begin
    insert into audition_templates (nombre, criterios) values ('Hack', '[{"k":"a","l":"A"}]');
    raise exception 'FALLO T4: un aspirante creó plantilla';
  exception when others then
    if sqlerrm not like '%row-level security%' then raise exception 'FALLO T4b: %', sqlerrm; end if;
  end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d3');   -- juez de una convocatoria: no gestiona
  select count(*) into n from audition_templates;
  if n <> 0 then raise exception 'FALLO T4c: un juez ve plantillas'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  select count(*) into n from audition_templates where id = (select tpl from ctx);
  if n <> 1 then raise exception 'FALLO T4d: el Director no ve la plantilla'; end if;
  reset role;
end $$;

-- T5: presencial sigue igual: el juez solo ve a quien llegó; las columnas antiguas siguen funcionando
do $$ declare p uuid; r json; n int; v jsonb; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  insert into auditions (titulo, estado) values ('Presencial', 'abierta') returning id into p;
  perform audition_add_member(p, 't_juez@test.local', 'juez');
  update ctx set pres = p;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  r := audition_apply(p, jsonb_build_object('nombre', 'Ana', 'telefono', '55', 'fecha_nacimiento', '1995-01-01', 'consentimiento_datos', true));
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d3');
  select count(*) into n from audition_judge_queue(p, 1);
  if n <> 0 then raise exception 'FALLO T5a: el juez ve a quien no ha llegado'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform audition_checkin(p, r->>'application_id');
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d3');
  insert into audition_scores (application_id, canto, baile) values ((r->>'application_id')::uuid, 4, 2);
  select puntos into v from audition_scores where application_id = (r->>'application_id')::uuid;
  if (v->>'canto')::int <> 4 or (v->>'baile')::int <> 2 then raise exception 'FALLO T5b: no se copió al formato nuevo: %', v; end if;
  update audition_scores set canto = 5 where application_id = (r->>'application_id')::uuid;
  select puntos into v from audition_scores where application_id = (r->>'application_id')::uuid;
  if (v->>'canto')::int <> 5 then raise exception 'FALLO T5c: el cambio en la columna anterior no llegó: %', v; end if;
  reset role;
end $$;

do $$ begin raise exception 'OK: 0038 pruebas T1–T5 (se aborta a propósito para no persistir)'; end $$;
