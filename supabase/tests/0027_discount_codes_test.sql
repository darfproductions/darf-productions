-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: el contenido de 0027_discount_codes.sql en la misma transacción
-- (sin su begin/commit propios si tu editor ya abre una transacción).
-- Termina con un error intencional "OK: ..." si todo pasa.

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_admin@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_fan1@test.local'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_fan2@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-0000000000a1';

-- Dos funciones desechables con precios copiados, EN VENTA y con fecha
create temp table ctx (perf uuid, perf2 uuid, vip uuid[], gen uuid[], vipcat uuid, code_id uuid);
grant all on ctx to authenticated, anon;
do $$ declare src uuid; p uuid; p2 uuid; begin
  select id into src from performances where production_id='showman' order by created_at limit 1;
  insert into performances (production_id, starts_at, on_sale) values ('showman', now() + interval '30 days', true) returning id into p;
  insert into performances (production_id, starts_at, on_sale) values ('showman', now() + interval '31 days', true) returning id into p2;
  insert into performance_price_categories (performance_id, price_category_id, price)
    select p, price_category_id, price from performance_price_categories where performance_id = src
    on conflict do nothing;
  insert into performance_price_categories (performance_id, price_category_id, price)
    select p2, price_category_id, price from performance_price_categories where performance_id = src
    on conflict do nothing;
  insert into ctx (perf, perf2, vip, gen, vipcat) values (p, p2,
    (select array_agg(id order by seat_label) from (select id, seat_label from seats where production_id='showman' and seat_label like 'VIP-A-%' order by seat_number limit 6) q),
    (select array_agg(id order by seat_label) from (select id, seat_label from seats where production_id='showman' and seat_label like 'General-R-%' order by seat_number limit 6) q),
    (select id from price_categories where production_id='showman' and nombre='VIP'));
end $$;

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- T1: admin crea un código 15 % solo VIP, solo función 1, 1 uso total, máx 2 boletos por compra
do $$ declare v_id uuid; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  v_id := admin_save_discount_code(null, 'showman', ' vip15 ', 15, null, now() + interval '10 days',
          1, 2, true, array[(select vipcat from ctx)], array[(select perf from ctx)]);
  reset role;
  update ctx set code_id = v_id;
  if (select codigo from discount_codes where id = (select code_id from ctx)) <> 'VIP15' then
    raise exception 'FALLO T1: código no normalizado'; end if;
  if (select count(*) from discount_code_categories where discount_code_id = v_id) <> 1 then
    raise exception 'FALLO T1: categorías'; end if;
end $$;

-- T2: un fan no puede crear ni leer códigos
do $$ declare n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  begin
    perform admin_save_discount_code(null, 'showman', 'HACK10', 10, null, null, null, null, true, '{}', '{}');
    raise exception 'FALLO T2: fan creó un código';
  exception when others then
    if sqlerrm not like '%Solo un admin%' then raise exception 'FALLO T2: %', sqlerrm; end if;
  end;
  select count(*) into n from discount_codes;
  if n <> 0 then raise exception 'FALLO T2: fan lee % códigos', n; end if;
  reset role;
end $$;

-- T3: vista previa del fan
do $$ declare r json; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  r := preview_discount_code((select perf from ctx), 'vip15');
  if (r->>'percent')::numeric <> 15 then raise exception 'FALLO T3 %', r; end if;
  begin
    perform preview_discount_code((select perf from ctx), 'NOEXISTE');
    raise exception 'FALLO T3: código inexistente aceptado';
  exception when others then
    if sqlerrm not like '%no existe%' then raise exception 'FALLO T3b: %', sqlerrm; end if;
  end;
  begin
    perform preview_discount_code((select perf2 from ctx), 'VIP15');
    raise exception 'FALLO T3: código aplicó a otra función';
  exception when others then
    if sqlerrm not like '%no aplica a esta función%' then raise exception 'FALLO T3c: %', sqlerrm; end if;
  end;
  reset role;
end $$;

-- T4: compra con código: VIP (400) con 15 % + General (250) sin descuento = 590
do $$ declare r json; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  r := create_seated_ticket_order((select perf from ctx), 'Ana', '55',
        array[(select vip[1] from ctx), (select gen[1] from ctx)], null, ' vip15');
  if (r->>'total')::numeric <> 590 then raise exception 'FALLO T4 total %', r; end if;
  if (r->>'discount_amount')::numeric <> 60 then raise exception 'FALLO T4 descuento %', r; end if;
  reset role;
  if (select sum(unit_price) from tickets where order_id = (r->>'order_id')::uuid) <> 590 then
    raise exception 'FALLO T4: unit_price no descontado'; end if;
  if (select discount_codigo from orders where id = (r->>'order_id')::uuid) <> 'VIP15' then
    raise exception 'FALLO T4: orders.discount_codigo'; end if;
end $$;

-- T5: usos totales = 1 -> la segunda orden se agota; al rechazar la primera, se libera
do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
  begin
    perform create_seated_ticket_order((select perf from ctx), 'Beto', '56', array[(select vip[2] from ctx)], null, 'VIP15');
    raise exception 'FALLO T5: excedió usos totales';
  exception when others then
    if sqlerrm not like '%se agotó%' then raise exception 'FALLO T5: %', sqlerrm; end if;
  end;
  reset role;
  update orders set status = 'rechazado', rejected_at = now()
    where discount_code_id = (select code_id from ctx);
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
  perform create_seated_ticket_order((select perf from ctx), 'Beto', '56', array[(select vip[2] from ctx)], null, 'VIP15');
  reset role;
end $$;

-- T6: máximo de boletos por compra (código sin restricción de zona, máx 2)
do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform admin_save_discount_code(null, 'showman', 'MAX2', 10, null, null, null, 2, true, '{}', '{}');
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  begin
    perform create_seated_ticket_order((select perf from ctx), 'Ana', '55',
      array[(select gen[2] from ctx),(select gen[3] from ctx),(select gen[4] from ctx)], null, 'MAX2');
    raise exception 'FALLO T6: pasó el máximo por compra';
  exception when others then
    if sqlerrm not like '%máximo 2 boletos%' then raise exception 'FALLO T6: %', sqlerrm; end if;
  end;
  reset role;
end $$;

-- T7: vencido, inactivo y no aplicable a los asientos
do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform admin_save_discount_code(null, 'showman', 'VENCIDO', 10, now() - interval '5 days', now() - interval '1 day', null, null, true, '{}', '{}');
  perform admin_save_discount_code(null, 'showman', 'APAGADO', 10, null, null, null, null, false, '{}', '{}');
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  begin perform create_seated_ticket_order((select perf from ctx), 'Ana', '55', array[(select gen[2] from ctx)], null, 'VENCIDO');
        raise exception 'FALLO T7a'; exception when others then if sqlerrm not like '%venció%' then raise exception 'FALLO T7a: %', sqlerrm; end if; end;
  begin perform create_seated_ticket_order((select perf from ctx), 'Ana', '55', array[(select gen[2] from ctx)], null, 'APAGADO');
        raise exception 'FALLO T7b'; exception when others then if sqlerrm not like '%no está activo%' then raise exception 'FALLO T7b: %', sqlerrm; end if; end;
  -- VIP15 solo aplica a VIP: una orden solo con General no es elegible
  reset role;
  update orders set status = 'rechazado', rejected_at = now() where discount_code_id = (select code_id from ctx);
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  begin perform create_seated_ticket_order((select perf from ctx), 'Ana', '55', array[(select gen[2] from ctx)], null, 'VIP15');
        raise exception 'FALLO T7c'; exception when others then if sqlerrm not like '%no aplica a los asientos%' then raise exception 'FALLO T7c: %', sqlerrm; end if; end;
  reset role;
end $$;

-- T8: sin código, el total sigue siendo el de la BD
do $$ declare r json; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  r := create_seated_ticket_order((select perf from ctx), 'Ana', '55', array[(select gen[5] from ctx)]);
  if (r->>'total')::numeric <> 250 or (r->>'discount_amount')::numeric <> 0 then raise exception 'FALLO T8 %', r; end if;
  reset role;
end $$;

-- T9: borrar un código ya usado lo desactiva; uno sin usar se borra
do $$ declare r json; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  r := admin_delete_discount_code((select code_id from ctx));
  if (r->>'deleted')::boolean then raise exception 'FALLO T9: borró un código usado'; end if;
  r := admin_delete_discount_code((select id from discount_codes where codigo = 'MAX2'));
  if not (r->>'deleted')::boolean then raise exception 'FALLO T9: no borró un código sin usar'; end if;
  reset role;
end $$;

do $$ begin
  raise exception 'OK: TODAS LAS PRUEBAS PASARON (se aborta a propósito para no persistir)';
end $$;
