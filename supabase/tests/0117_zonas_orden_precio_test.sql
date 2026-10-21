-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0117 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000b71', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't117_admin@test.local'),
  ('00000000-0000-0000-0000-000000000b72', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't117_nadie@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-000000000b71';

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

insert into productions (id, nombre, estado) values ('t117_obra', 'Obra 117', 'borrador');

do $$ declare vip uuid; gen uuid; disc uuid; pasada uuid; futura uuid; nueva uuid; ok boolean; n int; begin
  insert into price_categories (production_id, nombre) values ('t117_obra', 'VIP') returning id into vip;
  insert into price_categories (production_id, nombre) values ('t117_obra', 'General') returning id into gen;
  insert into price_categories (production_id, nombre) values ('t117_obra', 'Discapacitados') returning id into disc;
  -- Las nuevas van al final.
  if (select array_agg(nombre order by orden) from price_categories where production_id = 't117_obra') <> array['VIP', 'General', 'Discapacitados'] then
    raise exception 'FALLO: orden al crear';
  end if;
  insert into seats (production_id, seat_row, seat_number, seat_label, lado, price_category_id) values
    ('t117_obra', 'A', 1, 'A1', 'central', disc), ('t117_obra', 'A', 2, 'A2', 'central', disc), ('t117_obra', 'B', 1, 'B1', 'central', gen);
  insert into performances (production_id, starts_at) values ('t117_obra', now() - interval '3 days') returning id into pasada;
  insert into performances (production_id, starts_at) values ('t117_obra', now() + interval '3 days') returning id into futura;

  perform pg_temp.as_user('00000000-0000-0000-0000-000000000b71');
  -- T1: mover Discapacitados arriba de General.
  perform zona_mover(disc, true);
  -- T2: precio de la zona: solo funciones que no han pasado.
  n := zona_precio(gen, 250);
  if n <> 1 then raise exception 'FALLO T2: funciones %', n; end if;
  perform pg_temp.as_root();
  if (select array_agg(nombre order by orden) from price_categories where production_id = 't117_obra') <> array['VIP', 'Discapacitados', 'General'] then
    raise exception 'FALLO T1: mover';
  end if;
  if (select price from performance_price_categories where performance_id = futura and price_category_id = gen) <> 250 then raise exception 'FALLO T2: futura'; end if;
  if exists (select 1 from performance_price_categories where performance_id = pasada and price_category_id = gen) then raise exception 'FALLO T2: pasada'; end if;
  -- Una función nueva toma el precio de la zona.
  insert into performances (production_id, starts_at) values ('t117_obra', now() + interval '9 days') returning id into nueva;
  if (select price from performance_price_categories where performance_id = nueva and price_category_id = gen) <> 250 then raise exception 'FALLO T2: nueva'; end if;

  -- T3: borrar: con asientos pide destino; con destino los pasa.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000b71');
  begin perform zona_borrar(disc, null); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T3: sin destino'; end if;
  n := zona_borrar(disc, gen);
  if n <> 2 then raise exception 'FALLO T3: movidos %', n; end if;
  perform zona_borrar(vip, null); -- sin asientos ni boletos
  perform pg_temp.as_root();
  if (select count(*) from seats where production_id = 't117_obra' and price_category_id = gen) <> 3 then raise exception 'FALLO T3: asientos'; end if;
  if exists (select 1 from price_categories where id in (disc, vip)) then raise exception 'FALLO T3: borrada'; end if;

  -- T4: sin permiso, nada.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000b72');
  begin perform zona_precio(gen, 1); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T4: precio'; end if;
  begin perform zona_mover(gen, true); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T4: mover'; end if;
  begin perform zona_borrar(gen, null); ok := false; exception when others then ok := true; end;
  perform pg_temp.as_root();
  if not ok then raise exception 'FALLO T4: borrar'; end if;
end $$;

-- T5: con boletos vendidos de la zona (entrada general), no se borra.
do $$ declare z uuid; pf uuid; o uuid; ok boolean; begin
  insert into price_categories (production_id, nombre, cupo) values ('t117_obra', 'Pista', 50) returning id into z;
  insert into performances (production_id, starts_at) values ('t117_obra', now() + interval '5 days') returning id into pf;
  insert into orders (order_code, performance_id, status, buyer_nombre, buyer_telefono, total) values ('T117', pf, 'aprobado', 'X', '5512345678', 100) returning id into o;
  insert into tickets (order_id, performance_id, unit_price, price_category_id) values (o, pf, 100, z);
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000b71');
  begin perform zona_borrar(z, null); ok := false; exception when others then ok := true; end;
  perform pg_temp.as_root();
  if not ok then raise exception 'FALLO T5'; end if;
end $$;

select 'TODO OK';
