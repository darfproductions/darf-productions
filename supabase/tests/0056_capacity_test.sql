-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0031–0056 aplicadas.

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_admin@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_cont@test.local'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_ana@test.local'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_fan@test.local'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_taq@test.local');
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

do $$ declare fid uuid; z uuid; asientos int; s jsonb; begin
  select id into fid from performances where production_id = 'showman' order by starts_at limit 1;
  select count(*) into asientos from seats where production_id = 'showman' and is_active;
  -- T1: sin zonas generales la capacidad son los asientos
  if performance_capacity(fid) <> asientos then raise exception 'FALLO T1'; end if;
  -- T2: suma el cupo de la zona general con precio en esa función; el cupo de la función manda
  insert into price_categories (production_id, nombre, cupo) values ('showman', 'Pista', 80) returning id into z;
  if performance_capacity(fid) <> asientos then raise exception 'FALLO T2a: contó una zona sin precio'; end if;
  insert into performance_price_categories (performance_id, price_category_id, price) values (fid, z, 100);
  if performance_capacity(fid) <> asientos + 80 then raise exception 'FALLO T2b'; end if;
  update performance_price_categories set cupo = 30 where performance_id = fid and price_category_id = z;
  if performance_capacity(fid) <> asientos + 30 then raise exception 'FALLO T2c'; end if;
  -- T3: el resumen y el reporte general la usan
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  s := season_summary('showman');
  if (s->>'capacidad')::int < asientos + 30
     or (select (x->>'capacidad')::int from jsonb_array_elements(s->'funciones') x order by (x->>'capacidad')::int desc limit 1) < asientos + 30 then
    raise exception 'FALLO T3a: resumen %', s->>'capacidad';
  end if;
  if (select capacidad from director_capacity() where production_id = 'showman') < asientos + 30 then raise exception 'FALLO T3b'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
  begin
    perform director_capacity();
    raise exception 'FALLO T3c: un fan ve la capacidad general';
  exception when raise_exception then if sqlerrm like 'FALLO%' then raise; end if;
  end;
  reset role;
end $$;

do $$ begin raise exception 'OK: 0056 pruebas T1–T3 (se aborta a propósito para no persistir)'; end $$;
