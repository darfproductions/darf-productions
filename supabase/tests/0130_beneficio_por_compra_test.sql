-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0130 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000130a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't130_admin@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-000000130a01';

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

insert into productions (id, nombre, estado) values ('t130_obra', 'Obra 130', 'borrador');

do $$
declare t uuid; vip uuid; gen uuid; pf uuid; poster uuid; acc uuid; oa uuid; ob uuid; ta uuid[]; tb uuid[]; s uuid; r record; n int; ok boolean;
        adm text := '00000000-0000-0000-0000-000000130a01';
begin
  insert into price_categories (production_id, nombre) values ('t130_obra', 'VIP') returning id into vip;
  insert into price_categories (production_id, nombre) values ('t130_obra', 'General') returning id into gen;
  -- Función hace 1 hora: el póster (al terminar la función) ya se puede entregar.
  insert into performances (production_id, starts_at, on_sale) values ('t130_obra', now() - interval '1 hour', true) returning id into pf;
  insert into zona_beneficios (production_id, tipo, nombre, orden, por_compra) values ('t130_obra', 'souvenir', 'Póster firmado', 1, true) returning id into poster;
  insert into zona_beneficios (production_id, tipo, nombre, minutos_antes, orden) values ('t130_obra', 'acceso', 'Acceso anticipado', 15, 2) returning id into acc;
  insert into zona_beneficio_zonas values (poster, vip), (acc, vip);

  -- Orden A: un General y tres VIP (el General primero: no cuenta, no es de la zona del póster).
  insert into orders (order_code, performance_id, status, buyer_nombre, buyer_telefono, total, approved_at)
    values ('T130A', pf, 'aprobado', 'Ana', '1', 400, now() - interval '2 days') returning id into oa;
  insert into tickets (order_id, performance_id, price_category_id, unit_price, created_at) values (oa, pf, gen, 100, now() - interval '10 min');
  ta := array[]::uuid[];
  for i in 1..3 loop
    insert into seats (production_id, seat_row, seat_number, seat_label, price_category_id) values ('t130_obra', 'A', i, 'A' || i, vip) returning id into s;
    insert into tickets (order_id, performance_id, seat_id, unit_price, created_at) values (oa, pf, s, 100, now() - make_interval(mins => 5 - i)) returning id into t;
    ta := ta || t;
  end loop;

  -- T1: el póster lo lleva el primer VIP; los otros dos dicen con cuál va. El acceso, los tres.
  select * into r from beneficios_de_ticket(ta[1]) where beneficio_id = poster;
  if r.estado <> 'hoy' or not r.alcanza or not r.por_compra then raise exception 'FALLO T1a: %', row_to_json(r); end if;
  select * into r from beneficios_de_ticket(ta[2]) where beneficio_id = poster;
  if r.estado <> 'otro_boleto' or r.alcanza or r.con_boleto <> 'A1' then raise exception 'FALLO T1b: %', row_to_json(r); end if;
  if (select count(*) from beneficios_de_ticket(ta[3]) where beneficio_id = acc and estado <> 'otro_boleto') <> 1 then raise exception 'FALLO T1c: acceso por boleto'; end if;

  -- T2: la lista de entregas trae un póster y tres accesos; el reporte cuenta 1 con derecho al póster.
  perform pg_temp.as_user(adm);
  select count(*) into n from beneficios_entregas(pf) where beneficio_id = poster;
  if n <> 1 then raise exception 'FALLO T2a: % pósters en la lista', n; end if;
  select count(*) into n from beneficios_entregas(pf) where beneficio_id = acc;
  if n <> 3 then raise exception 'FALLO T2b: % accesos', n; end if;
  if (select con_derecho from beneficios_reporte(pf) where beneficio_id = poster) <> 1 then raise exception 'FALLO T2c: reporte'; end if;

  -- T3: no se marca en un boleto que no lo lleva; en el que sí, sí.
  begin
    perform beneficio_entregar_boleto(ta[2], poster, true, null);
    ok := false;
  exception when others then ok := sqlerrm like '%uno por compra%A1%';
  end;
  if not ok then raise exception 'FALLO T3a: se marcó en el boleto equivocado'; end if;
  perform beneficio_entregar_boleto(ta[1], poster, true, null);
  perform pg_temp.reset();
  if (select estado from beneficios_de_ticket(ta[1]) where beneficio_id = poster) <> 'entregado' then raise exception 'FALLO T3b'; end if;
  delete from beneficio_entregas where ticket_id = ta[1];

  -- T4: si se cancela el boleto que lo llevaba, pasa al siguiente de la orden.
  update tickets set is_active = false, cancelled_at = now() where id = ta[1];
  if (select estado from beneficios_de_ticket(ta[2]) where beneficio_id = poster) <> 'hoy' then raise exception 'FALLO T4: no pasó al siguiente'; end if;
  if (select con_boleto from beneficios_de_ticket(ta[3]) where beneficio_id = poster) <> 'A2' then raise exception 'FALLO T4b'; end if;

  -- T5: con cupo 1, en uno por compra se cuentan órdenes: la orden B (pagada después) ya no alcanza.
  update zona_beneficios set cupo = 1 where id = poster;
  insert into orders (order_code, performance_id, status, buyer_nombre, buyer_telefono, total, approved_at)
    values ('T130B', pf, 'aprobado', 'Beto', '2', 200, now() - interval '1 day') returning id into ob;
  tb := array[]::uuid[];
  for i in 1..2 loop
    insert into seats (production_id, seat_row, seat_number, seat_label, price_category_id) values ('t130_obra', 'B', i, 'B' || i, vip) returning id into s;
    insert into tickets (order_id, performance_id, seat_id, unit_price) values (ob, pf, s, 100) returning id into t;
    tb := tb || t;
  end loop;
  if (select estado from beneficios_de_ticket(ta[2]) where beneficio_id = poster) <> 'hoy' then raise exception 'FALLO T5a: la orden A perdió el póster'; end if;
  -- (los dos boletos de B se crean en el mismo instante: el que lo lleva sale por desempate; se revisan los dos)
  if (select count(*) from unnest(tb) x(id), beneficios_de_ticket(x.id) b where b.beneficio_id = poster and b.estado = 'sin_cupo') <> 1
     or exists (select 1 from unnest(tb) x(id), beneficios_de_ticket(x.id) b where b.beneficio_id = poster and b.estado not in ('sin_cupo', 'otro_boleto')) then
    raise exception 'FALLO T5b: la orden B debería quedar sin cupo';
  end if;

  -- T6: un beneficio normal sigue siendo por boleto.
  if exists (select 1 from beneficios_de_ticket(tb[2]) where beneficio_id = acc and (estado = 'otro_boleto' or por_compra)) then raise exception 'FALLO T6'; end if;

  -- T7: el resumen de la orden (WhatsApp) dice que es uno por compra.
  perform pg_temp.as_user(adm);
  if not exists (select 1 from json_array_elements(orden_beneficios(oa)) z, json_array_elements(z->'beneficios') b
                  where b->>'nombre' = 'Póster firmado' and (b->>'por_compra')::boolean) then raise exception 'FALLO T7'; end if;
  perform pg_temp.reset();

  raise notice '0130 OK';
end $$;
