-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0034 y 0035 aplicadas (datos de PRUEBA de Showman).

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

create temp table ctx (perf uuid, seat uuid, orden uuid, qr text);
grant all on ctx to authenticated, anon;
do $$ declare src uuid; p uuid; begin
  select id into src from performances where production_id = 'showman' order by created_at limit 1;
  insert into performances (production_id, starts_at, on_sale) values ('showman', now() + interval '30 days', true) returning id into p;
  insert into performance_price_categories (performance_id, price_category_id, price)
    select p, price_category_id, price from performance_price_categories where performance_id = src on conflict do nothing;
  insert into ctx (perf, seat) values (p, (select id from seats where production_id = 'showman' and seat_label like 'VIP-A-%' order by seat_number limit 1));
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform panel_add_member('showman', 't_puerta@test.local', 'puerta');
  reset role;
end $$;

-- T1: compra pendiente → puerta responde "no_aprobado" y no la marca
do $$ declare r json; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  r := create_seated_ticket_order((select perf from ctx), 'Ana', '55', array[(select seat from ctx)], null, null);
  reset role;
  update ctx set orden = (r->>'order_id')::uuid, qr = (select qr_token::text from tickets where order_id = (r->>'order_id')::uuid);
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b6');
  r := check_in_ticket((select qr from ctx));
  if r->>'result' <> 'no_aprobado' then raise exception 'FALLO T1: %', r; end if;
  reset role;
  if (select checked_in_at from tickets where order_id = (select orden from ctx)) is not null then
    raise exception 'FALLO T1: marcó como usado un boleto sin aprobar';
  end if;
end $$;

-- T2: al aprobarse, el mismo QR ya entra (y solo una vez)
do $$ declare r json; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform approve_order((select orden from ctx));
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b6');
  r := check_in_ticket((select qr from ctx));
  if r->>'result' <> 'ok' then raise exception 'FALLO T2: %', r; end if;
  r := check_in_ticket((select qr from ctx));
  if r->>'result' <> 'ya_usado' then raise exception 'FALLO T2b: %', r; end if;
  reset role;
end $$;

do $$ begin raise exception 'OK: 0035 pruebas T1–T2 (se aborta a propósito para no persistir)'; end $$;
