-- Ejecutar SOLO dentro de una transacción que termina abortada (no persiste nada).
-- Precede: el contenido de 0022_admin_delete_performance.sql en la misma transacción.

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_admin@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_staff@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-0000000000a1';
update profiles set rol = 'staff' where id = '00000000-0000-0000-0000-0000000000b1';

create temp table ctx as
select
  (select id from performances where production_id = 'showman' order by created_at limit 1) as perf_src,
  (select array_agg(id order by seat_label) from (select id, seat_label from seats where production_id='showman' and seat_label like 'Preferente B-K-%' order by seat_number limit 2) q) as seats2;
grant select on ctx to authenticated;

-- Función desechable con precios copiados de una real
create temp table newperf (id uuid);
grant all on newperf to authenticated;
do $$ declare p uuid; begin
  insert into performances (production_id, starts_at, on_sale) values ('showman', null, false) returning id into p;
  insert into performance_price_categories (performance_id, price_category_id, price)
    select p, price_category_id, price from performance_price_categories where performance_id = (select perf_src from ctx);
  insert into newperf values (p);
end $$;

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- T1: staff no puede eliminar
do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
  begin
    perform admin_delete_performance((select id from newperf));
    raise exception 'FALLO T1: staff eliminó';
  exception when others then
    if sqlerrm not like 'No autorizado%' then raise exception 'FALLO T1: %', sqlerrm; end if;
  end;
end $$;

-- T2: con boleto activo se rechaza y no se pierde nada
do $$ declare r json; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  r := admin_create_seated_order((select id from newperf), 'Ana', '1', (select seats2 from ctx));
  perform set_config('t.tk1', r->'tickets'->0->>'ticket_id', true);
  perform set_config('t.tk2', r->'tickets'->1->>'ticket_id', true);
  begin
    perform admin_delete_performance((select id from newperf));
    raise exception 'FALLO T2: eliminó con boletos activos';
  exception when others then
    if sqlerrm not like '%boletos activos%' then raise exception 'FALLO T2: %', sqlerrm; end if;
  end;
end $$;

-- T3: tras cancelar todos, se elimina junto con órdenes, boletos, bloqueos y precios
do $$ declare r json; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  insert into blocked_seats (performance_id, seat_id)
    select (select id from newperf), id from seats where production_id='showman' and seat_label='Preferente B-K-10';
  perform admin_cancel_ticket(current_setting('t.tk1')::uuid);
  perform admin_cancel_ticket(current_setting('t.tk2')::uuid);
  r := admin_delete_performance((select id from newperf));
  reset role;
  if (r->>'orders_removed')::int <> 1 then raise exception 'FALLO T3 orders_removed: %', r; end if;
  if exists (select 1 from performances where id = (select id from newperf)) then raise exception 'FALLO T3 sigue la función'; end if;
  if exists (select 1 from tickets where performance_id = (select id from newperf)) then raise exception 'FALLO T3 tickets'; end if;
  if exists (select 1 from blocked_seats where performance_id = (select id from newperf)) then raise exception 'FALLO T3 bloqueos'; end if;
  if exists (select 1 from performance_price_categories where performance_id = (select id from newperf)) then raise exception 'FALLO T3 precios'; end if;
end $$;

-- T4: función inexistente
do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  begin
    perform admin_delete_performance(gen_random_uuid());
    raise exception 'FALLO T4';
  exception when others then
    if sqlerrm not like '%no existe%' then raise exception 'FALLO T4: %', sqlerrm; end if;
  end;
end $$;

do $$ begin raise exception 'OK: TODAS LAS PRUEBAS PASARON (se aborta a proposito para no persistir)'; end $$;
