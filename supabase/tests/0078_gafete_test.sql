-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0078 aplicadas.

insert into auth.users (id, instance_id, aud, role, email)
values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_elenco@test.local'),
       ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_tarde@test.local'),
       ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_fan@test.local'),
       ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_admin@test.local'),
       ('00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_menor@test.local'),
       ('00000000-0000-0000-0000-0000000000c6', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_otra@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-0000000000c4';
update profiles set nombre = 'Ana Elenco', telefono = '4421112233' where id = '00000000-0000-0000-0000-0000000000c1';
update profiles set nombre = 'Mia Menor', telefono = '4429990000', fecha_nacimiento = hoy_mx() - interval '15 years' where id = '00000000-0000-0000-0000-0000000000c5';
insert into production_members (production_id, user_id, role_id) values
  ('showman', '00000000-0000-0000-0000-0000000000c1', 'integrante'),
  ('showman', '00000000-0000-0000-0000-0000000000c2', 'integrante'),
  ('showman', '00000000-0000-0000-0000-0000000000c5', 'integrante'),
  ('mm', '00000000-0000-0000-0000-0000000000c6', 'integrante');
update member_enrollment set ingreso = hoy_mx() - 30 where user_id in ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-0000000000c6');

create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create or replace function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
end $$;
create or replace function pg_temp.as_root() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

create temp table ctx (k text primary key, v text);
grant all on ctx to public;

-- T1: gafete solo para equipo y elencos; papel y franja.
do $$ declare j json; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
  if badge_mio() is not null then raise exception 'FALLO T1: un fan tiene gafete'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  j := badge_mio();
  if j is null or j->>'franja' <> 'crew' or j->>'papel' <> 'Elenco' then raise exception 'FALLO T1: gafete del elenco (%)', j; end if; -- 0080: sin obra; 0087: el elenco va en Crew
  if j->>'codigo' !~ '^DRF-[2-9A-HJ-NP-Z]{4}$' then raise exception 'FALLO T1: código corto'; end if;
  if (badge_mio()->>'token') <> j->>'token' then raise exception 'FALLO T1: cambió el token'; end if;
  insert into ctx values ('t1', j->>'token'), ('c1', j->>'codigo');
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c4');
  if badge_mio()->>'franja' <> 'manager' then raise exception 'FALLO T1: el Director no es manager'; end if; -- 0087
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
  insert into ctx values ('t2', badge_mio()->>'token');
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c5');
  insert into ctx values ('t5', badge_mio()->>'token');
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c6');
  insert into ctx values ('t6', badge_mio()->>'token');
  perform pg_temp.as_root();
end $$;

-- T2: público: por omisión solo nombre y papel; comparte lo elegido; un menor nunca teléfono/correo.
do $$ declare j json; begin
  perform pg_temp.as_anon();
  j := badge_publico((select v from ctx where k = 't1'));
  if j->>'nombre' <> 'Ana Elenco' or j->>'telefono' is not null or j->>'correo' is not null then raise exception 'FALLO T2: compartió sin permiso (%)', j; end if;
  if badge_publico('no-existe-este-token-0000000000') is not null then raise exception 'FALLO T2: token falso'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  perform badge_compartir(true, true, false, false);
  perform pg_temp.as_anon();
  j := badge_publico((select v from ctx where k = 't1'));
  if j->>'telefono' <> '4421112233' or j->>'correo' <> 't_elenco@test.local' then raise exception 'FALLO T2: no compartió (%)', j; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c5');
  perform badge_compartir(true, true, false, false);
  perform pg_temp.as_anon();
  j := badge_publico((select v from ctx where k = 't5'));
  if j->>'telefono' is not null or j->>'correo' is not null then raise exception 'FALLO T2: compartió datos de un menor'; end if;
  -- Nadie lee la tabla de gafetes de otros.
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
  if (select count(*) from badges) <> 1 then raise exception 'FALLO T2: ve gafetes ajenos'; end if;
  perform pg_temp.as_root();
end $$;

-- T3: checar asistencia: presente dentro de la tolerancia, retardo con minutos, repetido, no citado.
do $$ declare rid uuid; j json; begin
  insert into rehearsals (production_id, titulo, inicia) values ('showman', 'Ensayo prueba', now() - interval '25 minutes') returning id into rid;
  insert into production_discipline (production_id, tolerancia_min) values ('showman', 30)
    on conflict (production_id) do update set tolerancia_min = 30;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
  begin perform rehearsal_checkin(rid, (select v from ctx where k = 't1')); raise exception 'FALLO T3: un fan tomó asistencia';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;

  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c4');
  -- Con la liga completa del QR.
  j := rehearsal_checkin(rid, 'https://darf.mx/g/' || (select v from ctx where k = 't1'));
  if j->>'resultado' <> 'presente' then raise exception 'FALLO T3: debía ser presente (%)', j; end if;
  j := rehearsal_checkin(rid, (select v from ctx where k = 'c1'));
  if j->>'resultado' <> 'ya' then raise exception 'FALLO T3: repetido (%)', j; end if;
  -- Tolerancia a 10: 25 min tarde = retardo.
  perform pg_temp.as_root();
  update production_discipline set tolerancia_min = 10 where production_id = 'showman';
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c4');
  j := rehearsal_checkin(rid, lower((select v from ctx where k = 't2')));
  if j->>'resultado' <> 'retardo' or (j->>'minutos')::int not between 24 and 26 then raise exception 'FALLO T3: retardo (%)', j; end if;
  j := rehearsal_checkin(rid, (select v from ctx where k = 't6'));
  if j->>'resultado' <> 'no_citado' then raise exception 'FALLO T3: otra obra (%)', j; end if;
  j := rehearsal_checkin(rid, 'DRF-ZZZZ');
  if j->>'resultado' <> 'no_encontrado' then raise exception 'FALLO T3: código falso'; end if;
  perform pg_temp.as_root();
  if (select llegada_at from rehearsal_attendance where rehearsal_id = rid and user_id = '00000000-0000-0000-0000-0000000000c1') is null then raise exception 'FALLO T3: hora de llegada'; end if;
  if (select count(*) from rehearsal_attendance where rehearsal_id = rid) <> 2 then raise exception 'FALLO T3: registros'; end if;
end $$;

-- T4: regenerar invalida el código anterior.
do $$ declare viejo text := (select v from ctx where k = 't1'); begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  perform badge_regenerar();
  if badge_mio()->>'token' = viejo then raise exception 'FALLO T4: no cambió'; end if;
  perform pg_temp.as_anon();
  if badge_publico(viejo) is not null then raise exception 'FALLO T4: el viejo sigue sirviendo'; end if;
  perform pg_temp.as_root();
end $$;

do $$ begin raise exception 'OK: TODAS LAS PRUEBAS PASARON (0078)'; end $$;
