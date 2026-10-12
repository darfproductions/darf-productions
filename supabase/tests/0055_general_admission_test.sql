-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0031–0055 aplicadas.

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

do $$ declare fid uuid; z uuid; z2 uuid; r json; n int; oid uuid; tok uuid; dc uuid; begin
  update productions set estado = 'publicada' where id = 'showman';
  select id into fid from performances where production_id = 'showman' order by starts_at limit 1;
  update performances set starts_at = now() + interval '10 days', on_sale = true where id = fid;
  insert into price_categories (production_id, nombre, cupo) values ('showman', 'Pista', 5) returning id into z;
  insert into performance_price_categories (performance_id, price_category_id, price) values (fid, z, 100);

  -- T1: disponibilidad
  select libres into n from general_availability(fid) where price_category_id = z;
  if n <> 5 then raise exception 'FALLO T1: libres %', n; end if;

  -- T2: un fan compra 3 (pendiente, sin asiento, con plazo)
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
  r := create_general_ticket_order(fid, 'Fan', '555', z, 3);
  reset role;
  oid := (r->>'order_id')::uuid;
  if (select count(*) from tickets where order_id = oid and seat_id is null and price_category_id = z) <> 3 then raise exception 'FALLO T2a: boletos'; end if;
  if (select status::text from orders where id = oid) <> 'pendiente' or (select expires_at from orders where id = oid) is null then raise exception 'FALLO T2b: estado o plazo'; end if;
  if (r->>'total')::numeric <> 300 then raise exception 'FALLO T2c: total %', r->>'total'; end if;
  if (select libres from general_availability(fid) where price_category_id = z) <> 2 then raise exception 'FALLO T2d: libres'; end if;

  -- T3: sin sobreventa y máximo 10 por compra
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
  begin
    perform create_general_ticket_order(fid, 'Fan', '555', z, 3);
    raise exception 'FALLO T3a: sobreventa';
  exception when raise_exception then if sqlerrm not like 'Solo quedan 2%' then raise; end if;
  end;
  begin
    perform create_general_ticket_order(fid, 'Fan', '555', z, 11);
    raise exception 'FALLO T3b: más de 10';
  exception when raise_exception then if sqlerrm not like 'Máximo 10%' then raise; end if;
  end;
  reset role;

  -- T4: cupo distinto en esta función
  update performance_price_categories set cupo = 10 where performance_id = fid and price_category_id = z;
  if (select libres from general_availability(fid) where price_category_id = z) <> 7 then raise exception 'FALLO T4: cupo por función'; end if;

  -- T5: descuentos: uno de otra zona no aplica; uno general sí (50 %)
  insert into price_categories (production_id, nombre, cupo) values ('showman', 'Gradas', 50) returning id into z2;
  insert into discount_codes (production_id, codigo, percent) values ('showman', 'SOLOGRADAS', 50) returning id into dc;
  insert into discount_code_categories values (dc, z2);
  insert into discount_codes (production_id, codigo, percent) values ('showman', 'MITAD', 50);
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
  begin
    perform create_general_ticket_order(fid, 'Ana', '555', z, 1, null, 'SOLOGRADAS');
    raise exception 'FALLO T5a: descuento de otra zona';
  exception when raise_exception then if sqlerrm not like '%no aplica a esta zona%' then raise; end if;
  end;
  r := create_general_ticket_order(fid, 'Ana', '555', z, 2, null, 'mitad');
  reset role;
  if (r->>'total')::numeric <> 100 or (r->>'discount_amount')::numeric <> 100 then raise exception 'FALLO T5b: descuento %', r; end if;

  -- T6: taquilla vende aprobada; otro sin permiso no
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform panel_add_member('showman', 't_taq@test.local', 'taquilla');
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
  r := admin_create_general_order(fid, 'Taquilla', '555', z, 2);
  if r->>'status' <> 'aprobado' then raise exception 'FALLO T6a: taquilla'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
  begin
    perform admin_create_general_order(fid, 'X', '555', z, 1);
    raise exception 'FALLO T6b: un fan vendió en taquilla';
  exception when raise_exception then if sqlerrm like 'FALLO%' then raise; end if;
  end;
  reset role;

  -- T7: zona general sin asientos; zona con asientos no puede volverse general
  begin
    update seats set price_category_id = z where id = (select id from seats where production_id = 'showman' limit 1);
    raise exception 'FALLO T7a: asiento en zona general';
  exception when raise_exception then if sqlerrm like 'FALLO%' then raise; end if;
  end;
  begin
    update price_categories set cupo = 10 where id = (select price_category_id from seats where production_id = 'showman' and price_category_id is not null limit 1);
    raise exception 'FALLO T7b: zona con asientos se volvió general';
  exception when raise_exception then if sqlerrm like 'FALLO%' then raise; end if;
  end;

  -- T8: en puerta se ve "General · Pista"
  select t.qr_token into tok from tickets t join orders o on o.id = t.order_id where o.status = 'aprobado' and t.price_category_id = z limit 1;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  r := check_in_ticket(tok::text);
  reset role;
  if r->>'result' <> 'ok' or r->>'seat_label' <> 'General · Pista' then raise exception 'FALLO T8: puerta %', r; end if;
end $$;

do $$ begin raise exception 'OK: 0055 pruebas T1–T8 (se aborta a propósito para no persistir)'; end $$;
