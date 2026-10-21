-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0118 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000b81', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't118_admin@test.local'),
  ('00000000-0000-0000-0000-000000000b82', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't118_fan@test.local'),
  ('00000000-0000-0000-0000-000000000b83', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't118_nadie@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-000000000b81';

create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create or replace function pg_temp.as_root() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

insert into productions (id, nombre, estado) values ('t118_obra', 'Obra 118', 'borrador');

do $$ declare z uuid; pf1 uuid; pf2 uuid; pf3 uuid; r json; ok boolean; v numeric; o json; begin
  insert into price_categories (production_id, nombre, cupo) values ('t118_obra', 'Pista', 100) returning id into z;
  insert into performances (production_id, starts_at, on_sale) values ('t118_obra', now() + interval '20 days', true) returning id into pf1;
  insert into performances (production_id, starts_at, on_sale) values ('t118_obra', now() + interval '2 days', true) returning id into pf2;
  insert into performance_price_categories (performance_id, price_category_id, price) values (pf1, z, 200), (pf2, z, 200);

  -- T1: preventa de la obra: solo a funciones después del fin; una con fechas propias no cambia.
  update performances set preventa_propia = true where id = pf2;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000b81');
  r := obra_preventa('t118_obra', now() + interval '1 day', now() + interval '5 days');
  perform pg_temp.as_root();
  if (r->>'funciones')::int <> 1 then raise exception 'FALLO T1: %', r; end if;
  if (select preventa_desde from performances where id = pf2) is not null then raise exception 'FALLO T1: propia'; end if;
  -- Función nueva: toma las fechas de la obra.
  insert into performances (production_id, starts_at, on_sale) values ('t118_obra', now() + interval '30 days', true) returning id into pf3;
  if (select preventa_hasta from performances where id = pf3) is null then raise exception 'FALLO T1: nueva'; end if;

  -- T2: antes del inicio nadie compra (ni socios); entre inicio y fin, solo socios.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000b82');
  perform fan_join();
  begin perform create_general_ticket_order(pf1, 'Fan', '5512345678', z, 1); ok := false; exception when others then ok := sqlerrm like 'La venta de esta función abre%'; end;
  if not ok then raise exception 'FALLO T2: antes del inicio'; end if;
  perform pg_temp.as_root();
  update performances set preventa_desde = now() - interval '1 hour' where id = pf1;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000b83');
  begin perform create_general_ticket_order(pf1, 'Nadie', '5512345678', z, 1); ok := false; exception when others then ok := sqlerrm like '%preventa para el Club Fan%'; end;
  if not ok then raise exception 'FALLO T2: no socio'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000b82');
  o := create_general_ticket_order(pf1, 'Fan', '5512345678', z, 1);
  perform pg_temp.as_root();
  if (o->>'total')::numeric <> 200 then raise exception 'FALLO T2: total %', o; end if;

  -- T3: precio propio: "Poner en todas" no lo pisa.
  update performance_price_categories set price = 150, propio = true where performance_id = pf3 and price_category_id = z;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000b81');
  perform zona_precio(z, 300);
  perform pg_temp.as_root();
  if (select price from performance_price_categories where performance_id = pf3 and price_category_id = z) <> 150 then raise exception 'FALLO T3: propio'; end if;
  if (select price from performance_price_categories where performance_id = pf2 and price_category_id = z) <> 300 then raise exception 'FALLO T3: zona'; end if;

  -- T4: promo automática solo en pf2; gana la mayor; la compra cobra con promo.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000b81');
  perform admin_save_promo(null, 't118_obra', 'Jueves', 20, null, null, true, array[pf2], null);
  perform admin_save_promo(null, 't118_obra', 'Chica', 10, null, null, true, array[pf2], array[z]);
  perform admin_save_promo(null, 't118_obra', 'Vieja', 50, now() - interval '3 days', now() - interval '1 day', true, null, null);
  perform pg_temp.as_root();
  if promo_pct(pf2, z) <> 20 then raise exception 'FALLO T4: pct %', promo_pct(pf2, z); end if;
  if promo_pct(pf1, z) <> 0 then raise exception 'FALLO T4: otra función'; end if;
  update productions set estado = 'publicada', logo_path = 't118_obra/kit/l.png', ambiente_path = 't118_obra/kit/a.png', frase = 'x',
    color_fondo = '#000000', color_superficie = '#111111', color_texto = '#ffffff', color_acento = '#ffd400' where id = 't118_obra';
  if (select count(*) from promos_obra('t118_obra') where performance_id = pf2) <> 1 then raise exception 'FALLO T4: promos_obra'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000b83');
  o := create_general_ticket_order(pf2, 'Nadie', '5512345678', z, 2);
  perform pg_temp.as_root();
  if (o->>'total')::numeric <> 480 then raise exception 'FALLO T4: total %', o; end if;

  -- T5: sin permiso no se crean promos ni preventas.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000b83');
  begin perform admin_save_promo(null, 't118_obra', 'X', 10, null, null, true, null, null); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T5: promo'; end if;
  begin perform obra_preventa('t118_obra', null, null); ok := false; exception when others then ok := true; end;
  perform pg_temp.as_root();
  if not ok then raise exception 'FALLO T5: preventa'; end if;
end $$;

select 'TODO OK';
