-- supabase/tests/0021_seat_map_rpcs_test.sql
-- Ejecutar SOLO dentro de esta transacción; termina en ROLLBACK (no persiste nada).
begin;

-- Usuarios temporales (se descartan con el rollback)
insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_admin@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_staff@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_fan@test.local');
-- handle_new_user() crea los profiles como 'fan'; subimos roles:
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-0000000000a1';
update profiles set rol = 'staff' where id = '00000000-0000-0000-0000-0000000000b1';

-- Contexto: primera función de Showman y 3 asientos Preferente distintos
create temp table ctx as
select
  (select id from performances where production_id = 'showman' order by created_at limit 1) as perf,
  (select array_agg(id order by seat_number) from (select id, seat_number from seats where production_id='showman' and seat_label like 'Preferente B-K-%' order by seat_number limit 3) q) as seats3;
grant select on ctx to authenticated, anon;

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- T1: fan y staff NO pueden crear orden
do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  begin
    perform admin_create_seated_order((select perf from ctx), 'X', '1', (select seats3 from ctx));
    raise exception 'FALLO: fan pudo vender';
  exception when others then
    if sqlerrm not like 'No autorizado%' then raise exception 'FALLO T1 fan: %', sqlerrm; end if;
  end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
  begin
    perform admin_create_seated_order((select perf from ctx), 'X', '1', (select seats3 from ctx));
    raise exception 'FALLO: staff pudo vender';
  exception when others then
    if sqlerrm not like 'No autorizado%' then raise exception 'FALLO T1 staff: %', sqlerrm; end if;
  end;
end $$;

-- T2: admin vende (función NO está en venta), precio sale de la BD, orden aprobada
do $$ declare r json; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  r := admin_create_seated_order((select perf from ctx), 'Ana <b>Test</b>', '5512345678', (select seats3 from ctx));
  if (r->>'total')::numeric <> 900 then raise exception 'FALLO T2 total esperado 900, fue %', r->>'total'; end if;
  if json_array_length(r->'tickets') <> 3 then raise exception 'FALLO T2 tickets'; end if;
  if (select status::text from orders where id = (r->>'order_id')::uuid) <> 'aprobado' then raise exception 'FALLO T2 status'; end if;
  perform set_config('t.order_id', r->>'order_id', true);
  perform set_config('t.ticket1', r->'tickets'->0->>'ticket_id', true);
  perform set_config('t.qr1', r->'tickets'->0->>'qr_token', true);
end $$;

-- T3: doble venta del mismo asiento falla completo (todo-o-nada)
do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  begin
    perform admin_create_seated_order((select perf from ctx), 'Otro', '1', (select seats3 from ctx));
    raise exception 'FALLO T3: permitió doble venta';
  exception when others then
    if sqlerrm not like '%ya no está disponible%' then raise exception 'FALLO T3: %', sqlerrm; end if;
  end;
end $$;

-- T4: asiento bloqueado no se vende
do $$ declare s uuid; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  select id into s from seats where production_id='showman' and seat_label='Preferente B-K-10';
  if s is null then s := (select id from seats where production_id='showman' and seat_label='Preferente B-K-20'); end if;
  insert into blocked_seats (performance_id, seat_id) values ((select perf from ctx), s);
  begin
    perform admin_create_seated_order((select perf from ctx), 'Z', '1', array[s]);
    raise exception 'FALLO T4: vendió asiento bloqueado';
  exception when others then
    if sqlerrm not like '%bloqueado%' then raise exception 'FALLO T4: %', sqlerrm; end if;
  end;
end $$;

-- T5: check_in — staff valida; segunda vez ya_usado; basura no_encontrado
do $$ declare r json; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
  r := check_in_ticket(current_setting('t.qr1'));
  if r->>'result' <> 'ok' then raise exception 'FALLO T5 ok: %', r; end if;
  r := check_in_ticket(upper(current_setting('t.qr1')));
  if r->>'result' <> 'ya_usado' then raise exception 'FALLO T5 ya_usado: %', r; end if;
  r := check_in_ticket('  no-es-uuid ');
  if r->>'result' <> 'no_encontrado' then raise exception 'FALLO T5 basura: %', r; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  begin
    perform check_in_ticket(current_setting('t.qr1'));
    raise exception 'FALLO T5: fan pudo validar';
  exception when others then
    if sqlerrm not like 'No autorizado%' then raise exception 'FALLO T5 fan: %', sqlerrm; end if;
  end;
end $$;

-- T6: cancelar libera el asiento, recalcula total y check_in da cancelado
do $$ declare r json; tk uuid; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
  begin
    perform admin_cancel_ticket(current_setting('t.ticket1')::uuid);
    raise exception 'FALLO T6: staff pudo cancelar';
  exception when others then
    if sqlerrm not like 'No autorizado%' then raise exception 'FALLO T6 staff: %', sqlerrm; end if;
  end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform admin_cancel_ticket(current_setting('t.ticket1')::uuid);
  if (select total from orders where id = current_setting('t.order_id')::uuid) <> 600 then
    raise exception 'FALLO T6: total debía bajar a 600'; end if;
  r := check_in_ticket(current_setting('t.qr1'));
  if r->>'result' <> 'cancelado' then raise exception 'FALLO T6 cancelado: %', r; end if;
  -- el asiento vuelve a poder venderse
  r := admin_create_seated_order((select perf from ctx), 'Re-venta', '1', array[(select seats3[1] from ctx)]);
end $$;

-- T7: anon no puede ejecutar nada
do $$ begin
  set local role anon;
  begin
    perform admin_cancel_ticket(gen_random_uuid());
    raise exception 'FALLO T7: anon ejecutó';
  exception when insufficient_privilege then null; end;
  reset role;
end $$;

-- T8: seats.lado completo y fila J correcta
do $$ begin
  reset role;
  if exists (select 1 from seats where production_id='showman' and lado is null) then raise exception 'FALLO T8: asientos sin lado'; end if;
  if (select count(*) from seats where production_id='showman' and lado='izquierda' and seat_label like 'Discapacitados-J-%') <> 3 then raise exception 'FALLO T8 disc izq'; end if;
end $$;

select 'TODAS LAS PRUEBAS PASARON' as resultado;
rollback;
