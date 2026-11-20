-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0156 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000156a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't156_ana@test.local'),
  ('00000000-0000-0000-0000-000000156a02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't156_beto@test.local');

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
create or replace function pg_temp.uids(j json) returns text[] language sql as $$
  select coalesce(array_agg(e->>'uid'), '{}') from json_array_elements(j->'eventos') e
$$;

insert into productions (id, nombre, estado) values ('t156_obra', 'Obra 156', 'borrador'), ('t156_otra', 'Otra 156', 'borrador');

do $$
declare ana text := '00000000-0000-0000-0000-000000156a01'; beto text := '00000000-0000-0000-0000-000000156a02';
        r1 uuid; r2 uuid; rc uuid; pf uuid; pf2 uuid; tka text; tkb text; tk2 text; j json; ok boolean;
begin
  insert into production_members (production_id, user_id, role_id) values ('t156_obra', ana::uuid, 'integrante');
  insert into rehearsals (production_id, titulo, inicia, termina) values ('t156_obra', 'Coreografía', now() + interval '2 days', now() + interval '2 days 3 hours') returning id into r1;
  insert into rehearsals (production_id, titulo, inicia, convocatoria, personas) values ('t156_obra', 'Solo Beto', now() + interval '3 days', 'personas', array[beto::uuid]) returning id into r2;
  insert into rehearsals (production_id, titulo, inicia, estado) values ('t156_obra', 'Cancelado', now() + interval '4 days', 'cancelado') returning id into rc;
  insert into performances (production_id, starts_at) values ('t156_obra', now() + interval '20 days') returning id into pf;
  insert into performances (production_id, starts_at) values ('t156_otra', now() + interval '30 days') returning id into pf2;
  -- Beto compró boletos para la otra obra.
  insert into orders (order_code, performance_id, status, buyer_nombre, buyer_telefono, total, buyer_user_id, approved_at)
    values ('T156B', pf2, 'aprobado', 'Beto', '2', 100, beto::uuid, now());

  -- Sin sesión no hay liga; cada quien la suya.
  begin perform mi_calendario_liga(); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T1: liga sin sesión'; end if;
  perform pg_temp.as_user(ana);
  tka := mi_calendario_liga();
  if tka !~ '^[0-9a-f]{64}$' or mi_calendario_liga() <> tka then raise exception 'FALLO T1b: liga de Ana'; end if;
  begin perform 1 from calendario_ligas; ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T1c: lee la tabla de ligas'; end if;
  perform pg_temp.as_user(beto);
  tkb := mi_calendario_liga();
  if tkb = tka then raise exception 'FALLO T1d: misma liga'; end if;

  -- T2: el calendario de Ana trae su ensayo y la función de su obra; nada de Beto ni lo cancelado.
  perform pg_temp.reset();
  perform set_config('role', 'anon', true);
  j := calendario_eventos(tka);
  if not ('ensayo-' || r1 = any(pg_temp.uids(j))) then raise exception 'FALLO T2a: falta su ensayo %', j; end if;
  if not ('funcion-' || pf = any(pg_temp.uids(j))) then raise exception 'FALLO T2b: falta la función de su obra'; end if;
  if 'ensayo-' || r2 = any(pg_temp.uids(j)) or 'ensayo-' || rc = any(pg_temp.uids(j)) or exists (select 1 from unnest(pg_temp.uids(j)) u where u like 'orden-%') then raise exception 'FALLO T2c: trae lo de otros: %', pg_temp.uids(j); end if;

  -- T3: el de Beto trae solo su boleto (no es de la obra: no le salen sus ensayos).
  j := calendario_eventos(tkb);
  if cardinality(pg_temp.uids(j)) <> 1 or (pg_temp.uids(j))[1] not like 'orden-%' then raise exception 'FALLO T3: %', pg_temp.uids(j); end if;

  -- T4: liga mala o vieja: nada.
  if calendario_eventos('basura') is not null or calendario_eventos(repeat('0', 64)) is not null then raise exception 'FALLO T4a'; end if;
  perform pg_temp.reset();
  perform pg_temp.as_user(ana);
  tk2 := mi_calendario_liga(true);
  if tk2 = tka then raise exception 'FALLO T4b: no cambió'; end if;
  perform pg_temp.reset();
  if calendario_eventos(tka) is not null then raise exception 'FALLO T4c: la vieja sigue sirviendo'; end if;
  if calendario_eventos(tk2) is null then raise exception 'FALLO T4d: la nueva no sirve'; end if;
end $$;

do $$ begin raise notice '0156 OK'; end $$;
