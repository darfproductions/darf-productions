-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0129 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000129a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't129_admin@test.local'),
  ('00000000-0000-0000-0000-000000129f01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't129_vende@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-000000129a01';

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
-- n boletos aprobados de un vendedor, cada uno en su orden (pagados uno tras otro).
create or replace function pg_temp.vender(fid uuid, sid uuid, n int, precio numeric, metodo text default 'efectivo', base timestamptz default now()) returns void
language plpgsql as $$
declare oid uuid;
begin
  for i in 1..n loop
    insert into orders (order_code, performance_id, buyer_nombre, buyer_telefono, total, seller_id, status, approved_at, metodo_pago)
      values ('T129-' || substr(md5(random()::text), 1, 8), fid, 'C', '1', precio, sid, 'aprobado', base + make_interval(secs => i), metodo)
      returning id into oid;
    insert into tickets (order_id, performance_id, unit_price) values (oid, fid, precio);
  end loop;
end $$;

insert into productions (id, nombre, estado) values ('t129_obra', 'Obra 129', 'borrador');
insert into performances (production_id, starts_at, venue, on_sale) values
  ('t129_obra', now() + interval '20 days', 'Teatro', true),
  ('t129_obra', now() + interval '21 days', 'Teatro', true);

do $$
declare
  adm text := '00000000-0000-0000-0000-000000129a01'; ven text := '00000000-0000-0000-0000-000000129f01';
  f1 uuid; f2 uuid; s1 uuid; s2 uuid; s3 uuid; c record; n int; pago uuid; tk uuid;
begin
  select id into f1 from performances where production_id = 't129_obra' order by starts_at limit 1;
  select id into f2 from performances where production_id = 't129_obra' order by starts_at desc limit 1;
  insert into sellers (nombre, codigo, active) values ('Ana', 'T129ANA', true) returning id into s1;
  insert into sellers (nombre, codigo, active) values ('Beto', 'T129BETO', true) returning id into s2;
  -- Cada cuenta ya tiene su código de vendedor (0050).
  s3 := ensure_account_seller(ven::uuid);
  insert into seller_productions (seller_id, production_id, activo) values (s1, 't129_obra', true), (s2, 't129_obra', true), (s3, 't129_obra', true);

  -- T1: el ejemplo de Showman. 45 boletos de $250 repartidos en dos funciones:
  --     del 26 al 35 al 10 % (10 × 25 = 250) y del 36 al 45 al 20 % (10 × 50 = 500) → $750.
  perform pg_temp.as_user(adm);
  n := comision_guardar('t129_obra', null, '[{"desde":26,"hasta":35,"porcentaje":10},{"desde":36,"hasta":45,"porcentaje":20}]');
  perform pg_temp.reset();
  if n <> 2 then raise exception 'FALLO T1a: guardó % tramos', n; end if;
  perform pg_temp.vender(f1, s1, 30, 250, 'efectivo', now() - interval '2 days');
  perform pg_temp.vender(f2, s1, 15, 250, 'transferencia', now() - interval '1 day');
  perform pg_temp.as_user(adm);
  select * into c from comisiones_obra('t129_obra') where seller_id = s1;
  perform pg_temp.reset();
  if c.boletos <> 45 or c.base <> 11250 or c.comision <> 750 then raise exception 'FALLO T1b: % boletos, base %, comisión %', c.boletos, c.base, c.comision; end if;
  if c.pct_actual <> 0 or c.siguiente_desde is not null then raise exception 'FALLO T1c: tramo actual % / siguiente %', c.pct_actual, c.siguiente_desde; end if;

  -- T2: cortesías no cuentan; un boleto cancelado baja el total (el 45 deja de existir: 9 × 50 = 450 → 700).
  perform pg_temp.vender(f1, s1, 3, 0, 'cortesia');
  select t.id into tk from tickets t join orders o on o.id = t.order_id where o.seller_id = s1 and o.metodo_pago = 'transferencia'
   order by o.approved_at desc limit 1;
  update tickets set is_active = false, cancelled_at = now() where id = tk;
  select * into c from comision_calculo('t129_obra') where seller_id = s1;
  if c.boletos <> 44 or c.comision <> 700 then raise exception 'FALLO T2: % boletos, comisión %', c.boletos, c.comision; end if;
  if c.pct_actual <> 20 then raise exception 'FALLO T2b: el boleto 45 debería ir al 20 %%, va al %', c.pct_actual; end if;

  -- T3: Beto lleva 12 boletos: va al 0 %, el siguiente tramo empieza en el 26 al 10 %.
  perform pg_temp.vender(f1, s2, 12, 300);
  select * into c from comision_calculo('t129_obra') where seller_id = s2;
  if c.comision <> 0 or c.siguiente_desde <> 26 or c.siguiente_pct <> 10 then raise exception 'FALLO T3: comisión %, siguiente % al %', c.comision, c.siguiente_desde, c.siguiente_pct; end if;

  -- T4: tabla propia para Beto: "desde el boleto 1, 15 %" → 12 × 45 = 540. Ana sigue igual.
  perform pg_temp.as_user(adm);
  perform comision_guardar('t129_obra', s2, '[{"desde":1,"hasta":null,"porcentaje":15}]');
  perform pg_temp.reset();
  select * into c from comision_calculo('t129_obra') where seller_id = s2;
  if c.comision <> 540 or not c.propia then raise exception 'FALLO T4a: comisión % propia %', c.comision, c.propia; end if;
  if (select comision from comision_calculo('t129_obra') where seller_id = s1) <> 700 then raise exception 'FALLO T4b: Ana cambió'; end if;
  -- Lista vacía: vuelve a la regla de la obra.
  perform pg_temp.as_user(adm);
  perform comision_guardar('t129_obra', s2, '[]');
  perform pg_temp.reset();
  if (select comision from comision_calculo('t129_obra') where seller_id = s2) <> 0 then raise exception 'FALLO T4c: no volvió a la regla de la obra'; end if;

  -- T5: "a partir del boleto 26, 15 %" (un solo tramo abierto).
  perform pg_temp.as_user(adm);
  perform comision_guardar('t129_obra', null, '[{"desde":26,"porcentaje":15}]');
  perform pg_temp.reset();
  -- Ana: boletos 26–44 (19) × 37.50 = 712.50
  if (select comision from comision_calculo('t129_obra') where seller_id = s1) <> 712.50 then raise exception 'FALLO T5'; end if;

  -- T6: tramos encimados, fuera de rango o abiertos antes de otro se rechazan.
  perform pg_temp.as_user(adm);
  begin
    perform comision_guardar('t129_obra', null, '[{"desde":1,"hasta":10,"porcentaje":5},{"desde":10,"hasta":20,"porcentaje":10}]');
    raise exception 'FALLO T6a: aceptó tramos encimados';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin
    perform comision_guardar('t129_obra', null, '[{"desde":1,"porcentaje":5},{"desde":20,"hasta":30,"porcentaje":10}]');
    raise exception 'FALLO T6b: aceptó un tramo después de uno abierto';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin
    perform comision_guardar('t129_obra', null, '[{"desde":1,"porcentaje":120}]');
    raise exception 'FALLO T6c: aceptó 120 %%';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  perform pg_temp.reset();

  -- T7: sin permiso no se ve ni se cambia.
  perform pg_temp.as_user(ven);
  begin
    perform comision_guardar('t129_obra', null, '[]');
    raise exception 'FALLO T7a: un vendedor cambió los tramos';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin
    perform * from comisiones_obra('t129_obra');
    raise exception 'FALLO T7b: un vendedor vio todas las comisiones';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  perform pg_temp.reset();

  -- T8: pagos → por pagar; deshacer.
  perform pg_temp.as_user(adm);
  pago := comision_pagar('t129_obra', s1, 500, 'Primer corte');
  select * into c from comisiones_obra('t129_obra') where seller_id = s1;
  if c.pagado <> 500 or c.por_pagar <> 212.50 then raise exception 'FALLO T8a: pagado %, por pagar %', c.pagado, c.por_pagar; end if;
  perform comision_deshacer_pago(pago);
  if (select pagado from comisiones_obra('t129_obra') where seller_id = s1) <> 0 then raise exception 'FALLO T8b: no se deshizo'; end if;
  perform pg_temp.reset();

  -- T9: el vendedor con cuenta ve su comisión en Mi cuenta (Caro: 30 boletos de $100; 26–30 al 15 % = 75).
  perform pg_temp.vender(f2, s3, 30, 100);
  perform pg_temp.as_user(ven);
  select * into c from mi_comision() where production_id = 't129_obra';
  perform pg_temp.reset();
  if c.comision <> 75 or c.boletos <> 30 then raise exception 'FALLO T9: comisión %, boletos %', c.comision, c.boletos; end if;

  raise notice '0129 OK';
end $$;
