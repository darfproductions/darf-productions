-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0132 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000132a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't132_admin@test.local'),
  ('00000000-0000-0000-0000-000000132a02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't132_nadie@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-000000132a01';

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

insert into productions (id, nombre, estado) values ('t132_obra', 'Obra 132', 'borrador');

do $$
declare vip uuid; gen uuid; f1 uuid; f2 uuid; o uuid; s uuid; ok boolean; r record;
        tot numeric; suma numeric;
begin
  insert into price_categories (production_id, nombre) values ('t132_obra', 'VIP') returning id into vip;
  insert into price_categories (production_id, nombre) values ('t132_obra', 'General') returning id into gen;
  insert into performances (production_id, starts_at, on_sale) values ('t132_obra', now() + interval '5 days', true) returning id into f1;
  insert into performances (production_id, starts_at, on_sale) values ('t132_obra', now() + interval '6 days', true) returning id into f2;

  -- F1, orden A aprobada: 1 VIP ($300) + 1 General (entrada general, $100) con descuento: pagó $320.
  insert into orders (order_code, performance_id, status, buyer_nombre, buyer_telefono, total, approved_at)
    values ('T132A', f1, 'aprobado', 'Ana', '1', 320, now()) returning id into o;
  insert into seats (production_id, seat_row, seat_number, seat_label, price_category_id) values ('t132_obra', 'A', 1, 'A1', vip) returning id into s;
  insert into tickets (order_id, performance_id, seat_id, unit_price) values (o, f1, s, 300);
  insert into tickets (order_id, performance_id, price_category_id, unit_price) values (o, f1, gen, 100);
  -- Un boleto cancelado de la misma orden no cuenta.
  insert into tickets (order_id, performance_id, price_category_id, unit_price, is_active, cancelled_at) values (o, f1, gen, 100, false, now());
  -- El descuento se aplica a la orden (el total lo recalcula la base al agregar boletos): $400 − $80 = $320.
  update orders set discount_amount = 80, total = 320 where id = o;
  -- F1, cortesía (General, $0).
  insert into orders (order_code, performance_id, status, buyer_nombre, buyer_telefono, total, approved_at, metodo_pago)
    values ('T132B', f1, 'aprobado', 'Beto', '2', 0, now(), 'cortesia') returning id into o;
  insert into tickets (order_id, performance_id, price_category_id, unit_price) values (o, f1, gen, 0);
  -- F2, orden por aprobar: 2 General apartados.
  insert into orders (order_code, performance_id, status, buyer_nombre, buyer_telefono, total)
    values ('T132C', f2, 'pendiente', 'Caro', '3', 200) returning id into o;
  insert into tickets (order_id, performance_id, price_category_id, unit_price) values (o, f2, gen, 100), (o, f2, gen, 100);
  -- F2, orden rechazada: no cuenta.
  insert into orders (order_code, performance_id, status, buyer_nombre, buyer_telefono, total)
    values ('T132D', f2, 'rechazado', 'Dani', '4', 100) returning id into o;
  insert into tickets (order_id, performance_id, price_category_id, unit_price, is_active) values (o, f2, gen, 100, false);

  perform pg_temp.as_user('00000000-0000-0000-0000-000000132a01');
  -- T1: VIP en F1 = 1 boleto, $240 (300/400 de 320); General en F1 = 1 vendido + 1 cortesía, $80.
  select * into r from ventas_por_zona('t132_obra') where performance_id = f1 and zona_id = vip;
  if r.vendidos <> 1 or r.cortesias <> 0 or r.ingresos <> 240 then raise exception 'FALLO T1a: %', row_to_json(r); end if;
  select * into r from ventas_por_zona('t132_obra') where performance_id = f1 and zona_id = gen;
  if r.vendidos <> 1 or r.cortesias <> 1 or r.apartados <> 0 or r.ingresos <> 80 then raise exception 'FALLO T1b: %', row_to_json(r); end if;
  -- T2: F2 = 2 apartados, $0 cobrado; la rechazada no aparece.
  select * into r from ventas_por_zona('t132_obra') where performance_id = f2 and zona_id = gen;
  if r.vendidos <> 0 or r.apartados <> 2 or r.ingresos <> 0 then raise exception 'FALLO T2: %', row_to_json(r); end if;
  -- T3: la suma de las zonas da los ingresos aprobados del resumen.
  select sum(ingresos) into suma from ventas_por_zona('t132_obra');
  tot := (production_sales_summary('t132_obra')->>'ingresos')::numeric;
  if suma <> tot then raise exception 'FALLO T3: zonas % vs resumen %', suma, tot; end if;

  -- T4: sin permiso de ventas no se ve.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000132a02');
  begin perform ventas_por_zona('t132_obra'); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T4: sin permiso'; end if;
  perform pg_temp.reset();

  raise notice '0132 OK';
end $$;
