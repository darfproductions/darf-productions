-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0128 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000128a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't128_admin@test.local'),
  ('00000000-0000-0000-0000-000000128f01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't128_fan@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-000000128a01';

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

insert into productions (id, nombre, estado) values ('t128_obra', 'Obra 128', 'borrador');
insert into performances (production_id, starts_at, venue, on_sale) values ('t128_obra', now() + interval '20 days', 'Teatro', true);

do $$
declare
  adm text := '00000000-0000-0000-0000-000000128a01'; fan text := '00000000-0000-0000-0000-000000128f01';
  fid uuid; o1 uuid; o2 uuid; e timestamptz; n int;
begin
  select id into fid from performances where production_id = 't128_obra';

  -- T1: por omisión vence a las 24 h (como antes).
  insert into orders (order_code, performance_id, buyer_nombre, buyer_telefono, total) values ('T128-1', fid, 'A', '1', 100) returning id, expires_at into o1, e;
  if abs(extract(epoch from e - (now() + interval '24 hours'))) > 60 then raise exception 'FALLO T1: plazo por omisión %', e; end if;

  -- T2: sin permiso no se cambia.
  perform pg_temp.as_user(fan);
  begin
    perform obra_apartados('t128_obra', false, 24);
    raise exception 'FALLO T2: un fan cambió los apartados';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  perform pg_temp.reset();

  -- T3: apagar → la pendiente deja de vencer; las nuevas nacen sin plazo; expire_due_orders no las toca.
  perform pg_temp.as_user(adm);
  n := obra_apartados('t128_obra', false, 24);
  perform pg_temp.reset();
  if n <> 1 then raise exception 'FALLO T3a: ajustó % órdenes', n; end if;
  if (select expires_at from orders where id = o1) is not null then raise exception 'FALLO T3b: la pendiente sigue con plazo'; end if;
  insert into orders (order_code, performance_id, buyer_nombre, buyer_telefono, total) values ('T128-2', fid, 'B', '1', 100) returning id, expires_at into o2, e;
  if e is not null then raise exception 'FALLO T3c: orden nueva con plazo %', e; end if;
  perform expire_due_orders('t128_obra');
  if (select status::text from orders where id = o2) <> 'pendiente' then raise exception 'FALLO T3d: venció sin plazo'; end if;

  -- T4: encender con 48 h → las que no tenían plazo lo toman; las nuevas vencen a las 48 h.
  perform pg_temp.as_user(adm);
  n := obra_apartados('t128_obra', true, 48);
  perform pg_temp.reset();
  if n <> 2 then raise exception 'FALLO T4a: ajustó % órdenes', n; end if;
  if abs(extract(epoch from (select expires_at from orders where id = o2) - (now() + interval '48 hours'))) > 60 then raise exception 'FALLO T4b: plazo al encender'; end if;
  insert into orders (order_code, performance_id, buyer_nombre, buyer_telefono, total) values ('T128-3', fid, 'C', '1', 100) returning expires_at into e;
  if abs(extract(epoch from e - (now() + interval '48 hours'))) > 60 then raise exception 'FALLO T4c: plazo 48 h %', e; end if;

  -- T5: el tope de 3 h antes de la función se respeta.
  update performances set starts_at = now() + interval '10 hours' where id = fid;
  insert into orders (order_code, performance_id, buyer_nombre, buyer_telefono, total) values ('T128-4', fid, 'D', '1', 100) returning expires_at into e;
  if abs(extract(epoch from e - (now() + interval '7 hours'))) > 60 then raise exception 'FALLO T5: tope 3 h antes %', e; end if;

  -- T6: plazo fuera de rango.
  perform pg_temp.as_user(adm);
  begin
    perform obra_apartados('t128_obra', true, 1000);
    raise exception 'FALLO T6: aceptó 1000 h';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  perform pg_temp.reset();

  -- T7: la venta de taquilla sigue sin plazo.
  insert into orders (order_code, performance_id, buyer_nombre, buyer_telefono, total, status, created_by_staff_id)
  values ('T128-5', fid, 'E', '1', 100, 'aprobado', adm::uuid) returning expires_at into e;
  if e is not null then raise exception 'FALLO T7: taquilla con plazo'; end if;

  raise notice '0128 OK';
end $$;
