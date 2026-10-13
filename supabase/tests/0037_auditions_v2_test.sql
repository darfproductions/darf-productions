-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0031–0037 aplicadas.

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_admin@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_fan1@test.local'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_fan2@test.local'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_menor@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_dir@test.local'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_reg@test.local'),
  ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_juez@test.local'),
  ('00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_gestor@test.local');
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

create temp table ctx (gen uuid, esc uuid, s1 uuid, s2 uuid, app1 uuid, app2 uuid, app3 uuid, otra_app uuid);
grant all on ctx to authenticated, anon;

-- T1: solo el Director crea convocatorias generales; la Dirección de una obra no la ve en borrador
do $$ declare g uuid; n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform panel_add_member('showman', 't_dir@test.local', 'direccion');
  insert into auditions (titulo, numeracion) values ('Buscamos bailarines', 'previa') returning id into g;
  insert into ctx (gen) values (g);
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  begin
    insert into auditions (titulo) values ('General hecha por Dirección');
    raise exception 'FALLO T1: Dirección de obra creó convocatoria general';
  exception when others then
    if sqlerrm not like '%row-level security%' then raise exception 'FALLO T1a: %', sqlerrm; end if;
  end;
  select count(*) into n from auditions where id = g;
  if n <> 0 then raise exception 'FALLO T1b: Dirección de obra ve el borrador general'; end if;
  reset role;
end $$;

-- T2: equipo propio de la convocatoria general
do $$ declare n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  begin
    perform audition_add_member((select gen from ctx), 't_juez@test.local', 'juez');
    raise exception 'FALLO T2: Dirección de obra armó el equipo de una general';
  exception when raise_exception then
    if sqlerrm not like 'No tienes permiso%' then raise exception 'FALLO T2a: %', sqlerrm; end if;
  end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform audition_add_member((select gen from ctx), 't_reg@test.local', 'registro');
  perform audition_add_member((select gen from ctx), 't_juez@test.local', 'juez');
  perform audition_add_member((select gen from ctx), 't_gestor@test.local', 'direccion');
  begin
    perform audition_add_member((select gen from ctx), 't_fan1@test.local', 'taquilla');
    raise exception 'FALLO T2: aceptó un rol sin permisos de audiciones';
  exception when raise_exception then
    if sqlerrm not like 'Ese rol no tiene%' then raise exception 'FALLO T2b: %', sqlerrm; end if;
  end;
  select count(*) into n from audition_list_members((select gen from ctx));
  if n <> 3 then raise exception 'FALLO T2c: equipo con % filas', n; end if;
  -- El gestor del equipo propio configura la convocatoria y la abre
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d4');
  insert into audition_slots (audition_id, inicia, cupo) values ((select gen from ctx), now() + interval '10 days 2 hours', 10);
  insert into audition_slots (audition_id, inicia, cupo) values ((select gen from ctx), now() + interval '10 days', 10);
  update ctx set s1 = (select id from audition_slots where audition_id = (select gen from ctx) order by inicia limit 1),
                 s2 = (select id from audition_slots where audition_id = (select gen from ctx) order by inicia desc limit 1);
  update auditions set estado = 'abierta' where id = (select gen from ctx);
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALLO T2d: el gestor propio no pudo abrir la convocatoria'; end if;
  -- …pero no la puede mover a una obra donde no tiene permiso
  begin
    update auditions set production_id = 'showman' where id = (select gen from ctx);
    raise exception 'FALLO T2: el gestor propio movió la convocatoria a Showman';
  exception when raise_exception then
    if sqlerrm not like 'No tienes permiso para mover%' then raise exception 'FALLO T2e: %', sqlerrm; end if;
  end;
  -- Nadie más ve el equipo
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  select count(*) into n from audition_members;
  if n <> 0 then raise exception 'FALLO T2f: un aspirante ve el equipo'; end if;
  reset role;
end $$;

-- T3: numeración previa: número al inscribirse, orden automático por horario, intercambio
do $$ declare r json; n1 int; n2 int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  r := audition_apply((select gen from ctx), jsonb_build_object('nombre', 'Ana', 'telefono', '55', 'fecha_nacimiento', '1995-01-01',
        'consentimiento_datos', true, 'slot_id', (select s2 from ctx)));
  update ctx set app1 = (r->>'application_id')::uuid;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
  r := audition_apply((select gen from ctx), jsonb_build_object('nombre', 'Beto', 'telefono', '55', 'fecha_nacimiento', '1996-01-01',
        'consentimiento_datos', true, 'slot_id', (select s1 from ctx)));
  update ctx set app2 = (r->>'application_id')::uuid;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  select numero into n1 from audition_applications where id = (select app1 from ctx);
  if n1 is distinct from 1 then raise exception 'FALLO T3a: Ana tiene número %', n1; end if;
  -- Registro no puede reordenar; el gestor sí
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
  begin
    perform audition_auto_order((select gen from ctx));
    raise exception 'FALLO T3: Mesa de registro reordenó';
  exception when raise_exception then
    if sqlerrm not like 'No autorizado%' then raise exception 'FALLO T3b: %', sqlerrm; end if;
  end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d4');
  perform audition_auto_order((select gen from ctx));
  select numero into n1 from audition_applications where id = (select app1 from ctx);
  select numero into n2 from audition_applications where id = (select app2 from ctx);
  if n2 <> 1 or n1 <> 2 then raise exception 'FALLO T3c: orden por horario Beto=% Ana=%', n2, n1; end if;
  perform audition_swap((select gen from ctx), (select app1 from ctx), (select app2 from ctx));
  select numero into n1 from audition_applications where id = (select app1 from ctx);
  if n1 <> 1 then raise exception 'FALLO T3d: el intercambio no funcionó'; end if;
  reset role;
end $$;

-- T4: día de la audición: llegó (conserva número) → entró → terminó, con horas
do $$ declare r json; n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
  begin
    perform audition_step((select gen from ctx), (select app1 from ctx), 'entro');
    raise exception 'FALLO T4: entró sin llegar';
  exception when raise_exception then
    if sqlerrm not like 'Primero marca su llegada%' then raise exception 'FALLO T4a: %', sqlerrm; end if;
  end;
  r := audition_checkin((select gen from ctx), (select app1::text from ctx));
  if r->>'result' <> 'ok' or (r->>'numero')::int <> 1 then raise exception 'FALLO T4b: %', r; end if;
  begin
    perform audition_step((select gen from ctx), (select app1 from ctx), 'termino');
    raise exception 'FALLO T4: terminó sin entrar';
  exception when raise_exception then
    if sqlerrm not like 'Primero marca que entró%' then raise exception 'FALLO T4c: %', sqlerrm; end if;
  end;
  perform audition_step((select gen from ctx), (select app1 from ctx), 'entro');
  perform audition_step((select gen from ctx), (select app1 from ctx), 'termino');
  select count(*) into n from audition_day_list((select gen from ctx)) d
   where d.id = (select app1 from ctx) and d.checked_in_at is not null and d.entered_at is not null and d.finished_at is not null;
  if n <> 1 then raise exception 'FALLO T4d: faltan horas en la lista del día'; end if;
  perform audition_step((select gen from ctx), (select app1 from ctx), 'deshacer');
  select count(*) into n from audition_day_list((select gen from ctx)) d where d.id = (select app1 from ctx) and d.finished_at is null and d.entered_at is not null;
  if n <> 1 then raise exception 'FALLO T4e: deshacer no regresó un paso'; end if;
  -- Quien llega sin registro recibe el siguiente número
  r := audition_walk_in((select gen from ctx), jsonb_build_object('nombre', 'Caro', 'telefono', '55', 'fecha_nacimiento', '1990-05-05'));
  if (r->>'numero')::int <> 3 then raise exception 'FALLO T4f: walk-in con número %', r; end if;
  -- Un aspirante no puede usar la lista del día
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
  begin
    perform audition_day_list((select gen from ctx));
    raise exception 'FALLO T4: un aspirante vio la lista del día';
  exception when raise_exception then
    if sqlerrm not like 'No autorizado%' then raise exception 'FALLO T4g: %', sqlerrm; end if;
  end;
  -- El juez del equipo propio califica
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d3');
  select count(*) into n from audition_judge_list((select gen from ctx), 1);
  if n <> 2 then raise exception 'FALLO T4h: el juez ve % aspirantes', n; end if;
  insert into audition_scores (application_id, baile, notas) values ((select app1 from ctx), 5, 'Muy bien');
  reset role;
end $$;

-- T5: audición en escuela: sin datos del tutor, sin foto, el equipo asigna el horario
do $$ declare e uuid; r json; v audition_applications%rowtype; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  begin
    insert into auditions (production_id, titulo, pedir_tutor) values ('showman', 'Escuela', false);
    raise exception 'FALLO T5: aceptó apagar tutor sin la autorización de la escuela';
  exception when check_violation then null;
  end;
  insert into auditions (production_id, titulo, estado, pedir_tutor, autorizacion_escuela, pedir_foto, elegir_horario, visibilidad)
  values ('showman', 'Escuela', 'abierta', false, true, false, false, 'enlace') returning id into e;
  update ctx set esc = e;
  insert into audition_slots (audition_id, inicia, cupo) values (e, now() + interval '5 days', 30);
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
  r := audition_apply(e, jsonb_build_object('nombre', 'Mía', 'telefono', '55', 'fecha_nacimiento', (hoy_mx() - interval '12 years')::date,
        'consentimiento_datos', true, 'tutor_nombre', 'No se guarda', 'foto_path', e::text || '/00000000-0000-0000-0000-0000000000c3/x.jpg',
        'slot_id', (select id from audition_slots where audition_id = e)));
  select * into v from audition_applications where id = (r->>'application_id')::uuid;
  if not v.es_menor or v.tutor_nombre is not null or v.foto_path is not null or v.slot_id is not null then
    raise exception 'FALLO T5a: menor=% tutor=% foto=% horario=%', v.es_menor, v.tutor_nombre, v.foto_path, v.slot_id;
  end if;
  update ctx set app3 = v.id;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  perform audition_set_slot(e, v.id, (select id from audition_slots where audition_id = e));
  if (select slot_id from audition_applications where id = v.id) is null then raise exception 'FALLO T5b: no asignó horario'; end if;
  -- En una convocatoria normal el tutor sigue siendo obligatorio
  reset role;
end $$;

-- T6: videos ligados a la ficha
do $$ declare n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d4');
  insert into audition_videos (audition_id, application_id, titulo, url)
  values ((select gen from ctx), (select app1 from ctx), 'Coreografía', 'https://youtu.be/abc123');
  insert into audition_videos (audition_id, titulo, url) values ((select gen from ctx), 'Grupo 1', 'https://drive.google.com/x');
  begin
    insert into audition_videos (audition_id, titulo, url) values ((select gen from ctx), 'Mal', 'javascript:alert(1)');
    raise exception 'FALLO T6: aceptó un enlace inválido';
  exception when check_violation then null;
  end;
  begin
    insert into audition_videos (audition_id, application_id, titulo, url)
    values ((select gen from ctx), (select app3 from ctx), 'Otra', 'https://youtu.be/x');
    raise exception 'FALLO T6: ligó un video a un aspirante de otra convocatoria';
  exception when others then
    if sqlerrm not like '%row-level security%' then raise exception 'FALLO T6a: %', sqlerrm; end if;
  end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d3');
  select count(*) into n from audition_videos where audition_id = (select gen from ctx);
  if n <> 2 then raise exception 'FALLO T6b: el juez ve % videos', n; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  select count(*) into n from audition_videos;
  if n <> 0 then raise exception 'FALLO T6c: un aspirante ve videos'; end if;
  perform pg_temp.as_anon();
  begin
    select count(*) into n from audition_videos;
    raise exception 'FALLO T6d: un visitante consultó videos';
  exception when insufficient_privilege then null;
  end;
  reset role;
end $$;

-- T7: quitar a alguien del equipo le quita el acceso; queda en la bitácora
do $$ declare n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
  delete from audition_members where user_id = '00000000-0000-0000-0000-0000000000d3';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO T7: Mesa de registro quitó a un juez'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  delete from audition_members where user_id = '00000000-0000-0000-0000-0000000000d3';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALLO T7a: el Director no pudo quitar al juez'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d3');
  begin
    perform audition_judge_list((select gen from ctx), 1);
    raise exception 'FALLO T7: el juez quitado sigue calificando';
  exception when raise_exception then
    if sqlerrm not like 'No autorizado%' then raise exception 'FALLO T7b: %', sqlerrm; end if;
  end;
  reset role;
  select count(*) into n from audit_log where tabla = 'audition_members' and accion = 'delete';
  if n < 1 then raise exception 'FALLO T7c: la bitácora no registró la baja'; end if;
end $$;

-- T8: una convocatoria de obra creada antes conserva sus reglas (tutor obligatorio)
do $$ declare a uuid; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  insert into auditions (production_id, titulo, estado) values ('showman', 'Normal', 'abierta') returning id into a;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
  begin
    perform audition_apply(a, jsonb_build_object('nombre', 'Niño', 'telefono', '55', 'fecha_nacimiento', (hoy_mx() - interval '10 years')::date,
          'consentimiento_datos', true));
    raise exception 'FALLO T8: menor sin tutor en convocatoria normal';
  exception when raise_exception then
    if sqlerrm not like 'Como eres menor%' then raise exception 'FALLO T8a: %', sqlerrm; end if;
  end;
  reset role;
end $$;

do $$ begin raise exception 'OK: 0037 pruebas T1–T8 (se aborta a propósito para no persistir)'; end $$;
