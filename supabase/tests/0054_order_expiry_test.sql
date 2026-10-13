-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0031–0054 aplicadas.

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

do $$ declare fid uuid; sid uuid; oid uuid; o2 uuid; e timestamptz; n int; begin
  select id into fid from performances where production_id = 'showman' order by starts_at limit 1;
  select id into sid from seats where production_id = 'showman' and is_active
     and id not in (select seat_id from tickets where performance_id = fid and is_active and seat_id is not null) limit 1;

  -- T1: plazo de 24 h si la función está lejos; 3 h antes si está cerca; mínimo 30 min
  update performances set starts_at = now() + interval '10 days' where id = fid;
  insert into orders (order_code, performance_id, buyer_nombre, buyer_telefono, total) values ('T-EXP-1', fid, 'X', '1', 100) returning id, expires_at into oid, e;
  if abs(extract(epoch from e - (now() + interval '24 hours'))) > 60 then raise exception 'FALLO T1a: plazo % ', e; end if;
  update performances set starts_at = now() + interval '10 hours' where id = fid;
  insert into orders (order_code, performance_id, buyer_nombre, buyer_telefono, total) values ('T-EXP-2', fid, 'X', '1', 100) returning expires_at into e;
  if abs(extract(epoch from e - (now() + interval '7 hours'))) > 60 then raise exception 'FALLO T1b: 3 h antes %', e; end if;
  update performances set starts_at = now() + interval '1 hour' where id = fid;
  insert into orders (order_code, performance_id, buyer_nombre, buyer_telefono, total) values ('T-EXP-3', fid, 'X', '1', 100) returning expires_at into e;
  if abs(extract(epoch from e - (now() + interval '30 minutes'))) > 60 then raise exception 'FALLO T1c: mínimo 30 min %', e; end if;
  -- T2: taquilla no vence
  insert into orders (order_code, performance_id, buyer_nombre, buyer_telefono, total, status, created_by_staff_id)
  values ('T-EXP-4', fid, 'X', '1', 100, 'aprobado', '00000000-0000-0000-0000-0000000000a1') returning expires_at into e;
  if e is not null then raise exception 'FALLO T2: venta de taquilla con plazo'; end if;

  -- T3: al vencer se libera el asiento y la orden queda vencida
  insert into tickets (order_id, performance_id, seat_id, unit_price) values (oid, fid, sid, 100);
  update orders set expires_at = now() - interval '1 minute' where id = oid;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
  n := expire_due_orders('showman');
  reset role;
  if n < 1 then raise exception 'FALLO T3a: no liberó boletos'; end if;
  if (select status::text from orders where id = oid) <> 'rechazado' or (select vencida_at from orders where id = oid) is null then raise exception 'FALLO T3b: orden no vencida'; end if;
  if exists (select 1 from tickets where order_id = oid and is_active) then raise exception 'FALLO T3c: boleto sigue activo'; end if;
  -- el mismo asiento se puede volver a vender
  insert into orders (order_code, performance_id, buyer_nombre, buyer_telefono, total) values ('T-EXP-5', fid, 'Y', '1', 100) returning id into o2;
  insert into tickets (order_id, performance_id, seat_id, unit_price) values (o2, fid, sid, 100);
  -- T4: lo que no ha vencido no se toca
  if (select status::text from orders where order_code = 'T-EXP-2') <> 'pendiente' then raise exception 'FALLO T4: venció antes de tiempo'; end if;
  -- T5: sin sesión no se puede llamar
  perform pg_temp.as_anon();
  begin
    perform expire_due_orders(null);
    raise exception 'FALLO T5: sin sesión liberó órdenes';
  exception when insufficient_privilege then null;
  end;
  reset role;
end $$;

do $$ begin raise exception 'OK: 0054 pruebas T1–T5 (se aborta a propósito para no persistir)'; end $$;
