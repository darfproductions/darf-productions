-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0154 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000154a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't154_admin@test.local'),
  ('00000000-0000-0000-0000-000000154a02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't154_nadie@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-000000154a01';

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

insert into productions (id, nombre, estado) values ('t154_obra', 'Obra 154', 'borrador');

do $$
declare vip uuid; gen uuid; pf uuid; pf2 uuid; acc uuid; mg uuid; foto uuid; poster uuid; prog uuid; oa uuid; ob uuid;
        s uuid; t uuid; ta uuid[] := array[]::uuid[]; qa text[] := array[]::text[]; qg text; qb text; qo text; j json; ok boolean;
        adm text := '00000000-0000-0000-0000-000000154a01';
begin
  insert into price_categories (production_id, nombre) values ('t154_obra', 'VIP') returning id into vip;
  insert into price_categories (production_id, nombre) values ('t154_obra', 'General') returning id into gen;
  insert into performances (production_id, starts_at, on_sale) values ('t154_obra', now() + interval '1 hour', true) returning id into pf;
  insert into performances (production_id, starts_at, on_sale) values ('t154_obra', now() + interval '8 days', true) returning id into pf2;
  insert into zona_beneficios (production_id, tipo, nombre, minutos_antes, orden) values ('t154_obra', 'acceso', 'Acceso anticipado', 15, 1) returning id into acc;
  insert into zona_beneficios (production_id, tipo, nombre, orden, por_compra) values ('t154_obra', 'experiencia', 'Meet & greet', 2, true) returning id into mg;
  insert into zona_beneficios (production_id, tipo, nombre, orden) values ('t154_obra', 'experiencia', 'Foto con el elenco', 3) returning id into foto;
  insert into zona_beneficios (production_id, tipo, nombre, orden) values ('t154_obra', 'souvenir', 'Póster firmado', 4) returning id into poster;
  insert into zona_beneficios (production_id, tipo, nombre, orden, por_compra) values ('t154_obra', 'souvenir', 'Programa', 5, true) returning id into prog;
  insert into zona_beneficio_zonas values (acc, vip), (mg, vip), (foto, vip), (poster, vip), (prog, vip);

  -- Orden A: tres VIP y un General.
  insert into orders (order_code, performance_id, status, buyer_nombre, buyer_telefono, total, approved_at)
    values ('T154A', pf, 'aprobado', 'Ana', '1', 400, now() - interval '2 days') returning id into oa;
  for i in 1..3 loop
    insert into seats (production_id, seat_row, seat_number, seat_label, price_category_id) values ('t154_obra', 'A', i, 'A' || i, vip) returning id into s;
    insert into tickets (order_id, performance_id, seat_id, unit_price, created_at) values (oa, pf, s, 100, now() - make_interval(mins => 5 - i)) returning id into t;
    ta := ta || t;
    qa := qa || (select qr_token::text from tickets where id = t);
  end loop;
  insert into tickets (order_id, performance_id, price_category_id, unit_price) values (oa, pf, gen, 100) returning qr_token::text into qg;
  -- Orden B: un VIP sin pagar. Orden C: VIP de otra función.
  insert into orders (order_code, performance_id, status, buyer_nombre, buyer_telefono, total) values ('T154B', pf, 'pendiente', 'Beto', '2', 100) returning id into ob;
  insert into seats (production_id, seat_row, seat_number, seat_label, price_category_id) values ('t154_obra', 'B', 1, 'B1', vip) returning id into s;
  insert into tickets (order_id, performance_id, seat_id, unit_price) values (ob, pf, s, 100) returning qr_token::text into qb;
  insert into orders (order_code, performance_id, status, buyer_nombre, buyer_telefono, total, approved_at) values ('T154C', pf2, 'aprobado', 'Caro', '3', 100, now()) returning id into ob;
  insert into seats (production_id, seat_row, seat_number, seat_label, price_category_id) values ('t154_obra', 'C', 1, 'C1', vip) returning id into s;
  insert into tickets (order_id, performance_id, seat_id, unit_price) values (ob, pf2, s, 100) returning qr_token::text into qo;

  -- T0: sin permiso no se puede.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000154a02');
  begin perform beneficio_escaneo(pf, acc, qa[1]); ok := false; exception when others then ok := sqlerrm = 'No autorizado'; end;
  if not ok then raise exception 'FALLO T0: escaneó sin permiso'; end if;

  perform pg_temp.as_user(adm);
  -- T1: acceso anticipado: sí con VIP (y cuenta como entrada), "ya" la segunda vez, no con General, rechazos.
  j := beneficio_escaneo(pf, acc, qa[1]);
  if j->>'resultado' <> 'ok' or j->>'entrada' <> 'ok' or j->>'lugar' <> 'A1' then raise exception 'FALLO T1a: %', j; end if;
  j := beneficio_escaneo(pf, acc, qa[1]);
  if j->>'resultado' <> 'ya' or j->>'entrada' <> 'ya_usado' then raise exception 'FALLO T1b: %', j; end if;
  j := beneficio_escaneo(pf, acc, qg);
  if j->>'resultado' <> 'no_incluye' or j->>'zona' <> 'General' then raise exception 'FALLO T1c: %', j; end if;
  if beneficio_escaneo(pf, acc, qb)->>'resultado' <> 'por_pagar' then raise exception 'FALLO T1d: sin pagar'; end if;
  if beneficio_escaneo(pf, acc, qo)->>'resultado' <> 'otra_funcion' then raise exception 'FALLO T1e: otra función'; end if;
  if beneficio_escaneo(pf, acc, 'basura')->>'resultado' <> 'no_encontrado' then raise exception 'FALLO T1f'; end if;
  if (select checked_in_at from tickets where qr_token::text = qg) is not null then raise exception 'FALLO T1g: General entró'; end if;

  -- T2: meet & greet uno por compra: vale cualquier boleto de la orden, una sola vez.
  j := beneficio_escaneo(pf, mg, qa[3]);
  if j->>'resultado' <> 'ok' then raise exception 'FALLO T2a: %', j; end if;
  j := beneficio_escaneo(pf, mg, qa[1]);
  if j->>'resultado' <> 'ya' or j->>'con_boleto' is not null then raise exception 'FALLO T2b: %', j; end if;
  j := beneficio_escaneo(pf, mg, qa[2]);
  if j->>'resultado' <> 'ya' or j->>'con_boleto' <> 'A1' then raise exception 'FALLO T2c: %', j; end if;
  if (select nota from beneficio_entregas where ticket_id = ta[1] and beneficio_id = mg) <> 'Con el boleto A3' then raise exception 'FALLO T2d: nota'; end if;

  -- T3: foto uno por boleto: cada boleto una vez.
  if beneficio_escaneo(pf, foto, qa[1])->>'resultado' <> 'ok' then raise exception 'FALLO T3a'; end if;
  if beneficio_escaneo(pf, foto, qa[2])->>'resultado' <> 'ok' then raise exception 'FALLO T3b'; end if;
  if beneficio_escaneo(pf, foto, qa[2])->>'resultado' <> 'ya' then raise exception 'FALLO T3c'; end if;

  -- T4: póster uno por boleto: escanear dice que se le deben 3; se entrega 1 y luego los que faltan.
  j := beneficio_escaneo(pf, poster, qa[2]);
  if j->>'resultado' <> 'debe' or (j->>'total')::int <> 3 or (j->>'entregados')::int <> 0 then raise exception 'FALLO T4a: %', j; end if;
  j := beneficio_escaneo(pf, poster, qa[2], 1);
  if (j->>'entregados')::int <> 1 or (j->>'entregados_ahora')::int <> 1 then raise exception 'FALLO T4b: %', j; end if;
  if not exists (select 1 from beneficio_entregas where ticket_id = ta[2] and beneficio_id = poster) then raise exception 'FALLO T4c: primero el escaneado'; end if;
  j := beneficio_escaneo(pf, poster, qa[1], 5);
  if j->>'resultado' <> 'completo' or (j->>'entregados')::int <> 3 or (j->>'entregados_ahora')::int <> 2 then raise exception 'FALLO T4d: %', j; end if;
  if beneficio_escaneo(pf, poster, qg)->>'resultado' <> 'no_incluye' then raise exception 'FALLO T4e'; end if;

  -- T5: programa uno por compra: le toca 1 a la orden, escaneen el boleto que escaneen.
  j := beneficio_escaneo(pf, prog, qa[3]);
  if j->>'resultado' <> 'debe' or (j->>'total')::int <> 1 then raise exception 'FALLO T5a: %', j; end if;
  j := beneficio_escaneo(pf, prog, qa[3], 1);
  if j->>'resultado' <> 'completo' then raise exception 'FALLO T5b: %', j; end if;
  if not exists (select 1 from beneficio_entregas where ticket_id = ta[1] and beneficio_id = prog) then raise exception 'FALLO T5c: en el boleto que lo lleva'; end if;
  perform pg_temp.reset();
end $$;

do $$ begin raise notice '0154 OK'; end $$;
