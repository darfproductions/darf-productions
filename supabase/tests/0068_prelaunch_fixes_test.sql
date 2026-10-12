-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0031–0068 aplicadas (datos de PRUEBA de Showman).

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_admin@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_fan1@test.local'),
  ('00000000-0000-0000-0000-0000000000b6', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_puerta@test.local');
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

create temp table ctx (perf uuid, perf2 uuid, seat uuid, orden uuid, qr text);
grant all on ctx to authenticated, anon;
do $$ declare src uuid; p uuid; p2 uuid; begin
  select id into src from performances where production_id = 'showman' order by created_at limit 1;
  insert into performances (production_id, starts_at, on_sale) values ('showman', now() + interval '30 days', true) returning id into p;
  insert into performances (production_id, starts_at, on_sale) values ('showman', now() + interval '31 days', true) returning id into p2;
  insert into performance_price_categories (performance_id, price_category_id, price)
    select p, price_category_id, price from performance_price_categories where performance_id = src on conflict do nothing;
  insert into ctx (perf, perf2, seat) values (p, p2, (select id from seats where production_id = 'showman' and seat_label like 'VIP-A-%' order by seat_number limit 1));
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform panel_add_member('showman', 't_puerta@test.local', 'puerta');
  reset role;
end $$;

-- T1: boleto aprobado de la función 1 validado en la función 2 → otra_funcion, sin gastarse
do $$ declare r json; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  r := create_seated_ticket_order((select perf from ctx), 'Ana', '55', array[(select seat from ctx)], null, null);
  reset role;
  update ctx set orden = (r->>'order_id')::uuid, qr = (select qr_token::text from tickets where order_id = (r->>'order_id')::uuid);
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform approve_order((select orden from ctx));
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b6');
  r := check_in_ticket((select qr from ctx), (select perf2 from ctx));
  if r->>'result' <> 'otra_funcion' or r->>'performance_starts_at' is null or r->>'production' is null then raise exception 'FALLO T1: %', r; end if;
  reset role;
  if (select checked_in_at from tickets where order_id = (select orden from ctx)) is not null then raise exception 'FALLO T1: se gastó'; end if;
  -- en su función sí entra, y una sola vez
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b6');
  r := check_in_ticket((select qr from ctx), (select perf from ctx));
  if r->>'result' <> 'ok' or r->>'production' is null then raise exception 'FALLO T1b: %', r; end if;
  r := check_in_ticket((select qr from ctx), (select perf from ctx));
  if r->>'result' <> 'ya_usado' then raise exception 'FALLO T1c: %', r; end if;
  reset role;
end $$;

-- T2: resumen de ventas en SQL (incluye la orden aprobada) y solo con permiso
do $$ declare r json; ok boolean := false; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  r := production_sales_summary('showman', (select perf from ctx));
  if (r->>'vendidos')::int <> 1 or (r->>'validados')::int <> 1 or (r->>'ingresos')::numeric <= 0 then raise exception 'FALLO T2: %', r; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  begin perform production_sales_summary('showman'); exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T2b: un fan ve el resumen'; end if;
  reset role;
end $$;

-- T3: contacto con límite por correo
do $$ declare i int; ok boolean := false; begin
  perform pg_temp.as_anon();
  for i in 1..5 loop insert into contact_messages (nombre, correo, mensaje) values ('X', 'spam@test.local', 'hola'); end loop;
  begin insert into contact_messages (nombre, correo, mensaje) values ('X', 'SPAM@test.local', 'hola'); exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T3: sexto mensaje aceptado'; end if;
  insert into contact_messages (nombre, correo, mensaje) values ('Y', 'otro@test.local', 'hola');
  ok := false;
  begin insert into contact_messages (nombre, correo, mensaje) values ('Z', 'largo@test.local', repeat('a', 4001)); exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T3b: mensaje demasiado largo aceptado'; end if;
  reset role;
end $$;

-- T4: push sin acceso anónimo (desde 0071 cualquiera con sesión puede probar su teléfono)
do $$ begin
  if has_function_privilege('anon', 'push_test()', 'execute') or has_function_privilege('anon', 'push_subscribe(text,text,text,text)', 'execute') then
    raise exception 'FALLO T4: anon puede ejecutar push_*'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b6');
  perform push_test();
  reset role;
end $$;

-- T5: Mi cuenta ve los asientos de su orden pendiente (sin QR) y nadie más
do $$ declare r json; n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  r := create_seated_ticket_order((select perf from ctx), 'Ana', '55', array[(select id from seats where production_id = 'showman' and seat_label like 'VIP-A-%' order by seat_number offset 1 limit 1)], null, null);
  select count(*) into n from my_pending_order_items() where order_id = (r->>'order_id')::uuid;
  if n <> 1 then raise exception 'FALLO T5: %', n; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b6');
  select count(*) into n from my_pending_order_items();
  if n <> 0 then raise exception 'FALLO T5b: ve órdenes ajenas'; end if;
  reset role;
end $$;

do $$ begin raise exception 'OK: 0068 pendientes antes de publicar'; end $$;
