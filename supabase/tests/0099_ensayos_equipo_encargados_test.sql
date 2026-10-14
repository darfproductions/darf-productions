-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0099 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't99_dir@test.local'),
  ('00000000-0000-0000-0000-000000000a02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't99_maestro@test.local'),
  ('00000000-0000-0000-0000-000000000a03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't99_staff1@test.local'),
  ('00000000-0000-0000-0000-000000000a04', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't99_staff2@test.local'),
  ('00000000-0000-0000-0000-000000000a05', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't99_int1@test.local'),
  ('00000000-0000-0000-0000-000000000a06', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't99_int2@test.local'),
  ('00000000-0000-0000-0000-000000000a07', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't99_int3@test.local'),
  ('00000000-0000-0000-0000-000000000a08', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't99_ajeno@test.local'),
  ('00000000-0000-0000-0000-000000000a09', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't99_artistica@test.local');
-- Rol propio de categoría dirección, sin ningún permiso (Dirección artística).
insert into panel_roles (id, nombre, descripcion, es_sistema, orden, categoria) values ('t99artistica', 'Dirección artística', 'Prueba', false, 50, 'direccion');
insert into production_members (production_id, user_id, role_id) values
  ('showman', '00000000-0000-0000-0000-000000000a01', 'direccion'),
  ('showman', '00000000-0000-0000-0000-000000000a02', 'maestro'),
  ('showman', '00000000-0000-0000-0000-000000000a03', 'staff'),
  ('showman', '00000000-0000-0000-0000-000000000a04', 'staff'),
  ('showman', '00000000-0000-0000-0000-000000000a05', 'integrante'),
  ('showman', '00000000-0000-0000-0000-000000000a06', 'integrante'),
  ('showman', '00000000-0000-0000-0000-000000000a07', 'integrante'),
  ('showman', '00000000-0000-0000-0000-000000000a09', 't99artistica');

create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create or replace function pg_temp.as_root() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;
-- ¿Falla esta llamada? (true si lanzó error)
create or replace function pg_temp.falla(q text) returns boolean language plpgsql as $$
begin
  execute q; return false;
exception when others then return true;
end $$;
create temp table ctx (k text primary key, v text);
grant all on ctx to public;

-- Ensayo en 30 min: todo el elenco, staff1 del equipo, encargados int1 y staff2. Otro en 2 h y otro mañana.
do $$ declare r1 uuid; r2 uuid; r3 uuid; t text; u uuid; begin
  insert into rehearsals (production_id, titulo, inicia, convocatoria, equipo, encargados)
  values ('showman', 'General', now() + interval '30 minutes', 'todos', array['00000000-0000-0000-0000-000000000a03'::uuid],
          array['00000000-0000-0000-0000-000000000a05'::uuid, '00000000-0000-0000-0000-000000000a04'::uuid]) returning id into r1;
  insert into rehearsals (production_id, titulo, inicia, convocatoria, encargados)
  values ('showman', 'Tarde', now() + interval '2 hours', 'todos', array['00000000-0000-0000-0000-000000000a05'::uuid]) returning id into r2;
  insert into rehearsals (production_id, titulo, inicia, convocatoria, encargados, equipo_todos)
  values ('showman', 'Mañana', now() + interval '1 day', 'todos', array['00000000-0000-0000-0000-000000000a05'::uuid], true) returning id into r3;
  insert into ctx values ('r1', r1), ('r2', r2), ('r3', r3);
  -- Credenciales (QR) de staff1, staff2 e int2.
  foreach u in array array['00000000-0000-0000-0000-000000000a03', '00000000-0000-0000-0000-000000000a04', '00000000-0000-0000-0000-000000000a06']::uuid[] loop
    perform pg_temp.as_user(u);
    t := credencial_mia()->>'token';
    perform pg_temp.as_root();
    insert into ctx values ('qr' || right(u::text, 2), t);
  end loop;
end $$;

-- T1: citados: elenco, staff1 (equipo) y staff2 (encargado); no el maestro ni el ajeno. "Todo el equipo" cita al staff.
do $$ declare r1 uuid := (select v from ctx where k = 'r1'); r3 uuid := (select v from ctx where k = 'r3'); begin
  if not rehearsal_cites(r1, '00000000-0000-0000-0000-000000000a06') then raise exception 'FALLO T1: integrante'; end if;
  if not rehearsal_cites(r1, '00000000-0000-0000-0000-000000000a03') then raise exception 'FALLO T1: staff1 equipo'; end if;
  if not rehearsal_cites(r1, '00000000-0000-0000-0000-000000000a04') then raise exception 'FALLO T1: staff2 encargado'; end if;
  if rehearsal_cites(r1, '00000000-0000-0000-0000-000000000a02') then raise exception 'FALLO T1: maestro no citado'; end if;
  if rehearsal_cites(r1, '00000000-0000-0000-0000-000000000a08') then raise exception 'FALLO T1: ajeno'; end if;
  if not rehearsal_cites(r3, '00000000-0000-0000-0000-000000000a02') then raise exception 'FALLO T1: todo el equipo (maestro)'; end if;
  if not ('00000000-0000-0000-0000-000000000a03'::uuid = any(_citados((select r from rehearsals r where id = r1)))) then raise exception 'FALLO T1: aviso al staff'; end if;
end $$;

-- T2: maestro y Dirección artística (rol propio sin permisos) siempre pueden; el staff2 no antes de abrir.
do $$ declare r1 text := (select v from ctx where k = 'r1'); begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000a02');
  if not has_perm('showman', 'ensayos.gestionar') then raise exception 'FALLO T2: maestro sin permiso'; end if;
  if not exists (select 1 from my_panel_access() where production_id = 'showman' and permission_id = 'ensayos.gestionar') then raise exception 'FALLO T2: panel maestro'; end if;
  perform ensayo_marcar(r1::uuid, '00000000-0000-0000-0000-000000000a06', 'retardo', 5);
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000a09');
  if (select count(*) from rehearsal_roster(r1::uuid)) < 5 then raise exception 'FALLO T2: artística no ve la lista'; end if;
  perform ensayo_marcar(r1::uuid, '00000000-0000-0000-0000-000000000a03', 'presente');
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000a04');
  if not pg_temp.falla(format('select rehearsal_roster(%L)', r1)) then raise exception 'FALLO T2: staff2 vio la lista sin abrir'; end if;
  if not pg_temp.falla(format('select ensayo_marcar(%L, %L, %L)', r1, '00000000-0000-0000-0000-000000000a07', 'presente')) then raise exception 'FALLO T2: staff2 marcó sin abrir'; end if;
  perform pg_temp.as_root();
  -- Dos personas marcaron a distintas: la lista tiene las dos marcas y quién las hizo.
  if (select marcado_por from rehearsal_attendance where rehearsal_id = r1::uuid and user_id = '00000000-0000-0000-0000-000000000a03') <> '00000000-0000-0000-0000-000000000a09' then raise exception 'FALLO T2: marcado_por'; end if;
  if (select count(*) from rehearsal_attendance where rehearsal_id = r1::uuid) <> 2 then raise exception 'FALLO T2: lista completa'; end if;
end $$;

-- T3: el encargado int1 abre (30 min antes) y queda presente; ya puede pasar lista.
do $$ declare r1 text := (select v from ctx where k = 'r1'); j json; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000a05');
  j := ensayo_abrir(r1::uuid);
  if j->>'resultado' <> 'abierto' then raise exception 'FALLO T3: %', j; end if;
  perform pg_temp.as_root();
  if (select estado from rehearsal_attendance where rehearsal_id = r1::uuid and user_id = '00000000-0000-0000-0000-000000000a05') <> 'presente' then raise exception 'FALLO T3: quien abre presente'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000a05');
  perform rehearsal_roster(r1::uuid);
  perform pg_temp.as_root();
end $$;

-- T4: el segundo encargado (staff2) no abre de nuevo; lo escanean y entonces sí pasa lista (QR de int2: ya, por el retardo).
do $$ declare r1 text := (select v from ctx where k = 'r1'); j json; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000a04');
  if ensayo_abrir(r1::uuid)->>'resultado' <> 'ya_abierto' then raise exception 'FALLO T4: segundo abre'; end if;
  if not pg_temp.falla(format('select ensayo_marcar(%L, %L, %L)', r1, '00000000-0000-0000-0000-000000000a07', 'presente')) then raise exception 'FALLO T4: sin escanear marcó'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000a05');
  j := rehearsal_checkin(r1::uuid, (select v from ctx where k = 'qr04'));
  if j->>'resultado' <> 'presente' then raise exception 'FALLO T4: escanear staff2 %', j; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000a04');
  if rehearsal_checkin(r1::uuid, (select v from ctx where k = 'qr06'))->>'resultado' <> 'ya' then raise exception 'FALLO T4: int2 ya registrado'; end if;
  if rehearsal_checkin(r1::uuid, (select v from ctx where k = 'qr03'))->>'resultado' <> 'ya' then raise exception 'FALLO T4: staff1 ya registrado'; end if;
  perform pg_temp.as_root();
end $$;

-- T5: ventanas para abrir: 2 h antes no, mañana no; el ajeno no puede nada.
do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000a05');
  if not pg_temp.falla(format('select ensayo_abrir(%L)', (select v from ctx where k = 'r2'))) then raise exception 'FALLO T5: 2 h antes'; end if;
  if not pg_temp.falla(format('select ensayo_abrir(%L)', (select v from ctx where k = 'r3'))) then raise exception 'FALLO T5: mañana'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000a08');
  if not pg_temp.falla(format('select ensayo_abrir(%L)', (select v from ctx where k = 'r1'))) then raise exception 'FALLO T5: ajeno abre'; end if;
  if not pg_temp.falla(format('select rehearsal_roster(%L)', (select v from ctx where k = 'r1'))) then raise exception 'FALLO T5: ajeno ve lista'; end if;
  if not pg_temp.falla(format('select ensayo_cerrar(%L)', (select v from ctx where k = 'r1'))) then raise exception 'FALLO T5: ajeno cierra'; end if;
  perform pg_temp.as_root();
end $$;

-- T6: Mis ensayos (staff1: citado como equipo; staff2: encargado).
do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000a03');
  if not exists (select 1 from mis_ensayos_equipo() where id = (select v from ctx where k = 'r1')::uuid) then raise exception 'FALLO T6: staff1'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000a04');
  if not (select puede_pasar_lista from mis_ensayos_equipo() where id = (select v from ctx where k = 'r1')::uuid) then raise exception 'FALLO T6: staff2 puede'; end if;
  perform pg_temp.as_root();
end $$;

-- T7: cerrar lista (el ensayo ya empezó): int3 sin registro queda en falta; después el encargado ya no marca, el maestro sí.
do $$ declare r1 text := (select v from ctx where k = 'r1'); j json; begin
  update rehearsals set inicia = now() - interval '5 minutes' where id = r1::uuid;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000a04');
  j := ensayo_cerrar(r1::uuid);
  if (j->>'faltas')::int < 1 then raise exception 'FALLO T7: %', j; end if;
  perform pg_temp.as_root();
  if (select estado from rehearsal_attendance where rehearsal_id = r1::uuid and user_id = '00000000-0000-0000-0000-000000000a07') <> 'falta' then raise exception 'FALLO T7: int3 falta'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000a04');
  if not pg_temp.falla(format('select ensayo_marcar(%L, %L, %L)', r1, '00000000-0000-0000-0000-000000000a07', 'presente')) then raise exception 'FALLO T7: encargado tras cerrar'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000a02');
  perform ensayo_marcar(r1::uuid, '00000000-0000-0000-0000-000000000a07', 'justificada');
  perform pg_temp.as_root();
  if (select estado from rehearsal_attendance where rehearsal_id = r1::uuid and user_id = '00000000-0000-0000-0000-000000000a07') <> 'justificada' then raise exception 'FALLO T7: maestro corrige'; end if;
end $$;

-- T8: advertencias automáticas también para el equipo (2 faltas de staff1).
do $$ declare a uuid; b uuid; begin
  -- Ensayos solo del equipo (sin elenco).
  insert into rehearsals (production_id, titulo, inicia, convocatoria, equipo) values
    ('showman', 'X1', now() - interval '3 days', 'ninguno', array['00000000-0000-0000-0000-000000000a03'::uuid]) returning id into a;
  insert into rehearsals (production_id, titulo, inicia, convocatoria, equipo) values
    ('showman', 'X2', now() - interval '2 days', 'ninguno', array['00000000-0000-0000-0000-000000000a03'::uuid]) returning id into b;
  if rehearsal_cites(a, '00000000-0000-0000-0000-000000000a05') then raise exception 'FALLO T8: solo equipo citó elenco'; end if;
  if not pg_temp.falla($q$insert into rehearsals (production_id, titulo, inicia, convocatoria) values ('showman', 'X3', now(), 'ninguno')$q$) then
    raise exception 'FALLO T8: solo equipo sin equipo';
  end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000a01');
  perform ensayo_marcar(a, '00000000-0000-0000-0000-000000000a03', 'falta');
  perform ensayo_marcar(b, '00000000-0000-0000-0000-000000000a03', 'falta');
  perform pg_temp.as_root();
  if not exists (select 1 from member_incidents where production_id = 'showman' and user_id = '00000000-0000-0000-0000-000000000a03' and auto_key = 'faltas:1') then
    raise exception 'FALLO T8: advertencia del equipo';
  end if;
end $$;

select 'OK 0099';
