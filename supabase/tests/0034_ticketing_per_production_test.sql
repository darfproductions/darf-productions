-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0029–0034 aplicadas (datos de PRUEBA de Showman con asientos y precios).
-- Comprueba que la boletería se opera POR OBRA y que staff y fans quedan como antes.

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_admin@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_fan1@test.local'),
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_taq@test.local'),
  ('00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_taqmm@test.local'),
  ('00000000-0000-0000-0000-0000000000b6', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_puerta@test.local'),
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_staff@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-0000000000a1';
update profiles set rol = 'staff' where id = '00000000-0000-0000-0000-0000000000f1';

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- Función de Showman EN VENTA con precios copiados, y asientos VIP libres.
create temp table ctx (perf uuid, vip uuid[], pending uuid, qr text, ticket uuid);
grant all on ctx to authenticated, anon;
do $$ declare src uuid; p uuid; begin
  select id into src from performances where production_id = 'showman' order by created_at limit 1;
  insert into performances (production_id, starts_at, on_sale) values ('showman', now() + interval '30 days', true) returning id into p;
  insert into performance_price_categories (performance_id, price_category_id, price)
    select p, price_category_id, price from performance_price_categories where performance_id = src on conflict do nothing;
  insert into ctx (perf, vip) values (p,
    (select array_agg(id order by seat_label) from (select id, seat_label from seats where production_id = 'showman' and seat_label like 'VIP-A-%' order by seat_number limit 4) q));
end $$;

do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform panel_add_member('showman', 't_taq@test.local', 'taquilla');
  perform panel_add_member('mm', 't_taqmm@test.local', 'taquilla');
  perform panel_add_member('showman', 't_puerta@test.local', 'puerta');
  reset role;
end $$;

-- T1: un fan compra (pendiente); taquilla de OTRA obra y staff no aprueban; taquilla de Showman sí
do $$ declare r json; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  r := create_seated_ticket_order((select perf from ctx), 'Ana', '55', array[(select vip[1] from ctx)], null, null);
  update ctx set pending = (r->>'order_id')::uuid;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b5');
  begin
    perform approve_order((select pending from ctx));
    raise exception 'FALLO T1: taquilla de mm aprobó Showman';
  exception when raise_exception then
    if sqlerrm not like 'No autorizado%' then raise exception 'FALLO T1a: %', sqlerrm; end if;
  end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
  begin
    perform approve_order((select pending from ctx));
    raise exception 'FALLO T1: staff aprobó (no puede hoy)';
  exception when raise_exception then
    if sqlerrm not like 'No autorizado%' then raise exception 'FALLO T1b: %', sqlerrm; end if;
  end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b3');
  r := approve_order((select pending from ctx));
  if r->>'status' <> 'aprobado' then raise exception 'FALLO T1c: %', r; end if;
  reset role;
end $$;

-- T2: taquilla de Showman vende en taquilla; la de mm no
do $$ declare r json; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b5');
  begin
    perform admin_create_seated_order((select perf from ctx), 'X', '1', array[(select vip[2] from ctx)]);
    raise exception 'FALLO T2: taquilla de mm vendió Showman';
  exception when raise_exception then
    if sqlerrm not like 'No autorizado%' then raise exception 'FALLO T2a: %', sqlerrm; end if;
  end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b3');
  r := admin_create_seated_order((select perf from ctx), 'Taquilla', '5512345678', array[(select vip[2] from ctx)]);
  update ctx set qr = r->'tickets'->0->>'qr_token', ticket = (r->'tickets'->0->>'ticket_id')::uuid;
  reset role;
end $$;

-- T3: cada taquilla ve solo las órdenes de su obra
do $$ declare n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b3');
  select count(*) into n from orders where performance_id = (select perf from ctx);
  if n <> 2 then raise exception 'FALLO T3: taquilla Showman ve % órdenes', n; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b5');
  select count(*) into n from orders where performance_id = (select perf from ctx);
  if n <> 0 then raise exception 'FALLO T3: taquilla mm ve % órdenes de Showman', n; end if;
  reset role;
end $$;

-- T4: puerta de Showman valida; quien no es puerta no; staff sigue validando
do $$ declare r json; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b5');
  begin
    perform check_in_ticket((select qr from ctx));
    raise exception 'FALLO T4: taquilla de mm validó';
  exception when raise_exception then
    if sqlerrm not like 'No autorizado%' then raise exception 'FALLO T4a: %', sqlerrm; end if;
  end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b6');
  r := check_in_ticket(upper((select qr from ctx)));
  if r->>'result' <> 'ok' then raise exception 'FALLO T4b: %', r; end if;
  r := check_in_ticket('  no-es-uuid ');
  if r->>'result' <> 'no_encontrado' then raise exception 'FALLO T4c: %', r; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
  r := check_in_ticket((select qr from ctx));
  if r->>'result' <> 'ya_usado' then raise exception 'FALLO T4d: %', r; end if;
  reset role;
end $$;

-- T5: cancelar boleto: taquilla de Showman sí, staff no
do $$ declare r json; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
  begin
    perform admin_cancel_ticket((select ticket from ctx));
    raise exception 'FALLO T5: staff canceló';
  exception when raise_exception then
    if sqlerrm not like 'No autorizado%' then raise exception 'FALLO T5a: %', sqlerrm; end if;
  end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b3');
  r := admin_cancel_ticket((select ticket from ctx));
  if (r->>'cancelled')::boolean is not true then raise exception 'FALLO T5b: %', r; end if;
  reset role;
end $$;

-- T6: descuentos por obra
do $$ declare n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b3');
  perform admin_save_discount_code(null, 'showman', 'TAQ10', 10, null, null, null, null, true, '{}', '{}');
  select count(*) into n from admin_list_discount_codes('showman');
  if n < 1 then raise exception 'FALLO T6: no lista'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b5');
  begin
    perform admin_save_discount_code(null, 'showman', 'HACK', 10, null, null, null, null, true, '{}', '{}');
    raise exception 'FALLO T6: taquilla mm creó código en Showman';
  exception when raise_exception then
    if sqlerrm not like 'No tienes permiso%' then raise exception 'FALLO T6b: %', sqlerrm; end if;
  end;
  reset role;
end $$;

-- T7: funciones y precios por obra; staff ya no cambia precio/venta de la obra
do $$ declare p uuid; n int; old numeric; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b3');
  insert into performances (production_id, starts_at, on_sale) values ('showman', now() + interval '60 days', false) returning id into p;
  update performances set venue = 'Sala 2' where id = p;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b5');
  begin
    insert into performances (production_id, starts_at) values ('showman', now() + interval '61 days');
    raise exception 'FALLO T7: taquilla mm creó función en Showman';
  exception when others then
    if sqlerrm not like '%row-level security%' then raise exception 'FALLO T7a: %', sqlerrm; end if;
  end;
  select price into old from productions where id = 'showman';
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
  update productions set price = 1 where id = 'showman';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO T7: staff cambió el precio de la obra'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b3');
  perform admin_delete_performance(p);
  if exists (select 1 from performances where id = p) then raise exception 'FALLO T7b: no borró'; end if;
  reset role;
end $$;

do $$ begin raise exception 'OK: 0034 pruebas T1–T7 (se aborta a propósito para no persistir)'; end $$;
