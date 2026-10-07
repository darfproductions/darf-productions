-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: el contenido de 0023_public_checkout.sql en la misma transacción.

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_admin@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_fan1@test.local'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_fan2@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-0000000000a1';

-- Función desechable con precios copiados, EN VENTA y con fecha
create temp table ctx (perf uuid, perf_off uuid, seats4 uuid[]);
grant all on ctx to authenticated, anon;
do $$ declare src uuid; p uuid; p2 uuid; begin
  select id into src from performances where production_id='showman' order by created_at limit 1;
  insert into performances (production_id, starts_at, on_sale) values ('showman', now() + interval '30 days', true) returning id into p;
  insert into performances (production_id, starts_at, on_sale) values ('showman', now() + interval '31 days', false) returning id into p2;
  insert into performance_price_categories (performance_id, price_category_id, price)
    select p, price_category_id, price from performance_price_categories where performance_id = src;
  insert into performance_price_categories (performance_id, price_category_id, price)
    select p2, price_category_id, price from performance_price_categories where performance_id = src;
  insert into ctx values (p, p2,
    (select array_agg(id order by seat_label) from (select id, seat_label from seats where production_id='showman' and seat_label like 'Preferente B-K-%' order by seat_number limit 4) q));
end $$;

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- T1: anon no puede comprar pero sí ver asientos tomados
do $$ begin
  reset role; set local role anon;
  begin
    perform create_seated_ticket_order((select perf from ctx), 'X', '1', array[(select seats4[1] from ctx)]);
    raise exception 'FALLO T1: anon compró';
  exception when insufficient_privilege then null; end;
  perform count(*) from get_taken_seats((select perf from ctx));
  reset role;
end $$;

-- T2: función sin venta no se puede comprar
do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  begin
    perform create_seated_ticket_order((select perf_off from ctx), 'Ana', '1', array[(select seats4[1] from ctx)]);
    raise exception 'FALLO T2: compró función sin venta';
  exception when others then
    if sqlerrm not like '%no está disponible para venta%' then raise exception 'FALLO T2: %', sqlerrm; end if;
  end;
end $$;

-- T3: compra válida -> pendiente, precio de la BD, aparta asientos, vendedor opcional
do $$ declare r json; begin
  reset role;
  insert into sellers (nombre, codigo, active) values ('Vend Test', 'TST1', true);
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  r := create_seated_ticket_order((select perf from ctx), 'Ana', '55', array[(select seats4[1] from ctx),(select seats4[2] from ctx)], ' tst1 ');
  if (r->>'total')::numeric <> 600 then raise exception 'FALLO T3 total %', r; end if;
  if r->>'status' <> 'pendiente' then raise exception 'FALLO T3 status'; end if;
  if json_array_length(r->'seats') <> 2 then raise exception 'FALLO T3 labels'; end if;
  reset role;
  if (select seller_id from orders where id = (r->>'order_id')::uuid) is null then raise exception 'FALLO T3 vendedor'; end if;
  if (select buyer_user_id from orders where id = (r->>'order_id')::uuid) <> '00000000-0000-0000-0000-0000000000c1' then raise exception 'FALLO T3 buyer'; end if;
  perform set_config('t.order1', r->>'order_id', true);
  -- get_taken_seats ve los 2 asientos apartados
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
  if (select count(*) from get_taken_seats((select perf from ctx))) <> 2 then raise exception 'FALLO T3 taken'; end if;
end $$;

-- T4: otro usuario no puede tomar un asiento apartado; vendedor inválido; sin sesión
do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
  begin
    perform create_seated_ticket_order((select perf from ctx), 'Luis', '1', array[(select seats4[1] from ctx)]);
    raise exception 'FALLO T4: doble reserva';
  exception when others then
    if sqlerrm not like '%ya no está disponible%' then raise exception 'FALLO T4: %', sqlerrm; end if;
  end;
  begin
    perform create_seated_ticket_order((select perf from ctx), 'Luis', '1', array[(select seats4[3] from ctx)], 'NOEXISTE');
    raise exception 'FALLO T4b: vendedor inexistente aceptado';
  exception when others then
    if sqlerrm not like '%vendedor no existe%' then raise exception 'FALLO T4b: %', sqlerrm; end if;
  end;
end $$;

-- T5: tope de 3 pendientes por usuario
do $$ declare s uuid[]; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  perform create_seated_ticket_order((select perf from ctx), 'Ana', '55', array[(select seats4[3] from ctx)]);
  perform create_seated_ticket_order((select perf from ctx), 'Ana', '55', array[(select seats4[4] from ctx)]);
  begin
    perform create_seated_ticket_order((select perf from ctx), 'Ana', '55', array[(select id from seats where production_id='showman' and seat_label='Preferente B-K-10')]);
    raise exception 'FALLO T5: cuarta pendiente aceptada';
  exception when others then
    if sqlerrm not like '%3 solicitudes pendientes%' then raise exception 'FALLO T5: %', sqlerrm; end if;
  end;
end $$;

-- T6: rechazar libera asientos; aprobar los conserva
do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform reject_order(current_setting('t.order1')::uuid);
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
  if (select count(*) from get_taken_seats((select perf from ctx))) <> 2 then raise exception 'FALLO T6: tras rechazar deben quedar 2 (las otras dos órdenes)'; end if;
  perform create_seated_ticket_order((select perf from ctx), 'Luis', '1', array[(select seats4[1] from ctx)]);
end $$;

do $$ begin raise exception 'OK: TODAS LAS PRUEBAS PASARON (se aborta a proposito para no persistir)'; end $$;
