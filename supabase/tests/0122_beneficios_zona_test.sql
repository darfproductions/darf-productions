-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0122 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000e01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't122_admin@test.local'),
  ('00000000-0000-0000-0000-000000000e02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't122_comprador@test.local'),
  ('00000000-0000-0000-0000-000000000e03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't122_nadie@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-000000000e01';

create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create or replace function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end $$;
create or replace function pg_temp.as_root() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

insert into productions (id, nombre, estado) values ('t122_obra', 'Obra 122', 'borrador'), ('t122_otra', 'Otra 122', 'borrador');

do $$
declare vip uuid; gen uuid; ajena uuid; pf uuid; pf2 uuid; s1 uuid; s2 uuid; s3 uuid;
        o1 uuid; o2 uuid; o3 uuid; og uuid; t1 uuid; t2 uuid; t3 uuid; tg uuid; q1 text; q3 text;
        acc uuid; pos uuid; foto uuid; estreno uuid; r json; ok boolean; n int;
begin
  insert into price_categories (production_id, nombre) values ('t122_obra', 'VIP') returning id into vip;
  insert into price_categories (production_id, nombre, cupo) values ('t122_obra', 'Pista', 100) returning id into gen;
  insert into price_categories (production_id, nombre) values ('t122_otra', 'VIP otra') returning id into ajena;
  insert into seats (production_id, seat_row, seat_number, seat_label, price_category_id) values ('t122_obra', 'A', 1, 'VIP-A-1', vip) returning id into s1;
  insert into seats (production_id, seat_row, seat_number, seat_label, price_category_id) values ('t122_obra', 'A', 2, 'VIP-A-2', vip) returning id into s2;
  insert into seats (production_id, seat_row, seat_number, seat_label, price_category_id) values ('t122_obra', 'A', 3, 'VIP-A-3', vip) returning id into s3;
  insert into performances (production_id, starts_at, on_sale) values ('t122_obra', now() + interval '5 days', true) returning id into pf;
  insert into performances (production_id, starts_at, on_sale) values ('t122_obra', now() + interval '6 days', true) returning id into pf2;

  insert into zona_beneficios (production_id, tipo, nombre, minutos_antes, orden) values ('t122_obra', 'acceso', 'Acceso anticipado', 15, 1) returning id into acc;
  insert into zona_beneficios (production_id, tipo, nombre, cupo, orden) values ('t122_obra', 'souvenir', 'Póster firmado', 1, 2) returning id into pos;
  insert into zona_beneficios (production_id, tipo, nombre, orden, activo) values ('t122_obra', 'experiencia', 'Foto oculta', 3, false) returning id into foto;
  insert into zona_beneficios (production_id, tipo, nombre, funciones, orden) values ('t122_obra', 'experiencia', 'Foto con el elenco', array[pf2], 4) returning id into estreno;
  insert into zona_beneficio_zonas values (acc, vip), (acc, gen), (pos, vip), (foto, vip), (estreno, vip);

  -- T0: zona de otra obra rechazada; minutos solo en acceso.
  begin insert into zona_beneficio_zonas values (pos, ajena); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T0: zona ajena'; end if;
  begin insert into zona_beneficios (production_id, tipo, nombre, minutos_antes) values ('t122_obra', 'souvenir', 'Mal', 10); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T0: minutos en souvenir'; end if;

  -- Órdenes: o1 (A-1) aprobada primero, o2 (A-2) aprobada después, o3 (A-3) pendiente, og general aprobada.
  insert into orders (order_code, performance_id, status, buyer_nombre, buyer_telefono, buyer_user_id, total, approved_at)
    values ('T122A', pf, 'aprobado', 'Ana', '5512345678', '00000000-0000-0000-0000-000000000e02', 100, now() - interval '2 hours') returning id into o1;
  insert into orders (order_code, performance_id, status, buyer_nombre, buyer_telefono, total, approved_at)
    values ('T122B', pf, 'aprobado', 'Beto', '5512345679', 100, now() - interval '1 hour') returning id into o2;
  insert into orders (order_code, performance_id, status, buyer_nombre, buyer_telefono, total)
    values ('T122C', pf, 'pendiente', 'Caro', '5512345670', 100) returning id into o3;
  insert into orders (order_code, performance_id, status, buyer_nombre, buyer_telefono, total, approved_at)
    values ('T122G', pf, 'aprobado', 'Gil', '5512345671', 100, now()) returning id into og;
  insert into tickets (order_id, performance_id, seat_id, unit_price) values (o1, pf, s1, 100) returning id, qr_token::text into t1, q1;
  insert into tickets (order_id, performance_id, seat_id, unit_price) values (o2, pf, s2, 100) returning id into t2;
  insert into tickets (order_id, performance_id, seat_id, unit_price) values (o3, pf, s3, 100) returning id, qr_token::text into t3, q3;
  insert into tickets (order_id, performance_id, price_category_id, unit_price) values (og, pf, gen, 100) returning id into tg;

  -- T1: el público ve los beneficios activos y sus zonas, no los inactivos.
  perform pg_temp.as_anon();
  select count(*) into n from zona_beneficios where production_id = 't122_obra';
  if n <> 3 then raise exception 'FALLO T1: anon ve % beneficios', n; end if;
  if exists (select 1 from zona_beneficios where id = foto) then raise exception 'FALLO T1: inactivo visible'; end if;
  if (select count(*) from zona_beneficio_zonas where beneficio_id = acc) <> 2 then raise exception 'FALLO T1: zonas'; end if;
  begin perform beneficios_boleto(t1); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T1: anon lee boleto'; end if;

  -- T2: el dueño ve sus beneficios (zona del asiento); la foto del estreno no aplica en esta función; cupo 1 lo alcanza.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000e02');
  r := beneficios_boleto(t1);
  if json_array_length(r) <> 2 then raise exception 'FALLO T2: % beneficios', json_array_length(r); end if;
  if (r->0->>'nombre') <> 'Acceso anticipado' or (r->0->>'minutos_antes')::int <> 15 or (r->0->>'zona') <> 'VIP' then raise exception 'FALLO T2: acceso %', r->0; end if;
  if (r->1->>'alcanza')::boolean is not true then raise exception 'FALLO T2: póster debía alcanzar'; end if;
  begin perform beneficios_boleto(t2); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T2: ve boleto ajeno'; end if;
  select count(*) into n from beneficios_boletos(array[t1, t2]);
  if n <> 1 then raise exception 'FALLO T2: beneficios_boletos ve % boletos', n; end if;
  r := orden_beneficios(o1);
  if json_array_length(r) <> 1 or json_array_length(r->0->'beneficios') <> 2 then raise exception 'FALLO T2: orden_beneficios %', r; end if;

  -- T3: cupo: el segundo VIP aprobado no alcanza; el pendiente queda en null; la zona general solo tiene acceso.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000e01');
  r := beneficios_boleto(t2);
  if (r->1->>'alcanza')::boolean is not false then raise exception 'FALLO T3: segundo debía no alcanzar %', r; end if;
  r := beneficios_boleto(t3);
  if (r->1->>'alcanza') is not null then raise exception 'FALLO T3: pendiente %', r; end if;
  r := beneficios_boleto(tg);
  if json_array_length(r) <> 1 or (r->0->>'zona') <> 'Pista' then raise exception 'FALLO T3: general %', r; end if;

  -- T4: puerta: marcar entregado, se ve, se desmarca; quien no es del equipo no puede.
  r := beneficio_entregar(q1, pos, true);
  if (r->'beneficios'->1->>'entregado_at') is null then raise exception 'FALLO T4: no quedó entregado'; end if;
  r := beneficio_entregar(q1, pos, true);  -- dos veces no truena
  begin perform beneficio_entregar(q1, estreno, true); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T4: beneficio que no tiene'; end if;
  select count(*) into n from beneficios_reporte(pf) where beneficio_id = pos and con_derecho = 1 and entregados = 1;
  if n <> 1 then raise exception 'FALLO T4: reporte'; end if;
  r := beneficio_entregar(q1, pos, false);
  if (r->'beneficios'->1->>'entregado_at') is not null then raise exception 'FALLO T4: no se desmarcó'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000e03');
  begin perform beneficio_entregar(q1, pos, true); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T4: nadie entrega'; end if;
  begin perform beneficios_qr(q1); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T4: nadie lee qr'; end if;
  begin insert into zona_beneficios (production_id, nombre) values ('t122_obra', 'Hack'); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T4: nadie escribe'; end if;

  perform pg_temp.as_root();
end $$;

select 'TODO OK' as resultado;
