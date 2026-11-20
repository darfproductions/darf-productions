-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0158 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000158a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't158_juez@test.local'),
  ('00000000-0000-0000-0000-000000158a02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't158_aspi@test.local'),
  ('00000000-0000-0000-0000-000000158a03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't158_nadie@test.local');
insert into productions (id, nombre, estado) values ('t158_obra', 'Obra 158', 'borrador');
insert into production_members (production_id, user_id, role_id) values ('t158_obra', '00000000-0000-0000-0000-000000158a01', 'juez');

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create or replace function pg_temp.uids(j json) returns text[] language sql as $$
  select coalesce(array_agg(e->>'uid'), '{}') from json_array_elements(j->'eventos') e
$$;

do $$
declare juez text := '00000000-0000-0000-0000-000000158a01'; aspi text := '00000000-0000-0000-0000-000000158a02'; nadie text := '00000000-0000-0000-0000-000000158a03';
        aid uuid; s1 uuid; j1 uuid; ap uuid; tj text; ta text; tn text; u text[]; ok boolean;
begin
  insert into auditions (production_id, titulo, estado, sede, callback_cuando, callback_fecha) values ('t158_obra', 'Casting 158', 'abierta', 'Teatro', 'otra_fecha', now() + interval '12 days') returning id into aid;
  insert into audition_slots (audition_id, inicia, termina, cupo) values (aid, date_trunc('day', now()) + interval '10 days 16 hours', date_trunc('day', now()) + interval '10 days 16 hours 20 minutes', 5) returning id into s1;
  insert into audition_slots (audition_id, inicia, cupo) values (aid, date_trunc('day', now()) + interval '10 days 20 hours', 5);
  insert into audition_applications (audition_id, user_id, nombre, fecha_nacimiento, telefono, slot_id) values (aid, aspi::uuid, 'Aspi', '2000-01-01', '55', s1) returning id into ap;

  perform pg_temp.as_user(juez); tj := mi_calendario_liga();
  perform pg_temp.as_user(aspi); ta := mi_calendario_liga();
  perform pg_temp.as_user(nadie); tn := mi_calendario_liga();
  set local role postgres;

  -- T1: sin horario del equipo, el juez ve el día (de la primera a la última hora) y el callback del equipo.
  u := pg_temp.uids(calendario_eventos(tj));
  if not exists (select 1 from unnest(u) x where x like 'audicion-dia-' || aid || '-%') then raise exception 'FALLO T1a: %', u; end if;
  if not ('callback-equipo-' || aid = any(u)) then raise exception 'FALLO T1b: callback equipo'; end if;
  if (select (e->>'termina')::timestamptz from json_array_elements(calendario_eventos(tj)->'eventos') e where e->>'uid' like 'audicion-dia-%')
     <> date_trunc('day', now()) + interval '10 days 20 hours 30 minutes' then raise exception 'FALLO T1c: hora de fin del día'; end if;

  -- T2: con horario del equipo, sale ese (y ya no el calculado). Solo quien gestiona lo puede escribir.
  perform pg_temp.as_user(juez);
  begin insert into audition_jornadas (audition_id, inicia, termina) values (aid, now() + interval '10 days', now() + interval '10 days 6 hours'); ok := false;
  exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T2a: el juez escribió el horario'; end if;
  set local role postgres;
  insert into audition_jornadas (audition_id, inicia, termina, lugar) values (aid, now() + interval '10 days', now() + interval '10 days 6 hours', 'Salón') returning id into j1;
  u := pg_temp.uids(calendario_eventos(tj));
  if not ('audicion-equipo-' || j1 = any(u)) or exists (select 1 from unnest(u) x where x like 'audicion-dia-%') then raise exception 'FALLO T2b: %', u; end if;
  perform pg_temp.as_user(juez);
  if (select count(*) from audition_jornadas where audition_id = aid) <> 1 then raise exception 'FALLO T2c: el juez no lo lee'; end if;
  set local role postgres;

  -- T3: el aspirante ve su turno (con fin), no lo del equipo; tras pasar a callback, ve su callback.
  u := pg_temp.uids(calendario_eventos(ta));
  if u <> array['audicion-' || ap] then raise exception 'FALLO T3a: %', u; end if;
  update audition_applications set ronda = 2 where id = ap;
  if not ('callback-' || ap = any(pg_temp.uids(calendario_eventos(ta)))) then raise exception 'FALLO T3b: callback aspirante'; end if;

  -- T4: alguien ajeno no ve nada; en borrador, ni el equipo.
  if cardinality(pg_temp.uids(calendario_eventos(tn))) <> 0 then raise exception 'FALLO T4a'; end if;
  update auditions set estado = 'borrador' where id = aid;
  if exists (select 1 from unnest(pg_temp.uids(calendario_eventos(tj))) x where x like '%equipo%' or x like 'audicion-dia-%') then raise exception 'FALLO T4b: borrador'; end if;
end $$;

do $$ begin raise notice '0158 OK'; end $$;
