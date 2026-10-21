-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0120 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't120_admin@test.local'),
  ('00000000-0000-0000-0000-000000000c02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't120_publico@test.local'),
  ('00000000-0000-0000-0000-000000000c03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't120_comprador@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-000000000c01';

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

insert into productions (id, nombre, estado, frase, logo_path, ambiente_path, color_fondo, color_superficie, color_texto, color_acento)
values ('t120_obra', 'Obra 120', 'publicada', 'x', 't120_obra/kit/l.png', 't120_obra/kit/a.png', '#000000', '#111111', '#ffffff', '#ffd400');

do $$ declare z uuid; pf uuid; ok boolean; n int; o json; begin
  insert into price_categories (production_id, nombre, cupo) values ('t120_obra', 'Pista', 100) returning id into z;
  insert into performances (production_id, starts_at, on_sale) values ('t120_obra', now() + interval '10 days', true) returning id into pf;
  insert into performance_price_categories (performance_id, price_category_id, price) values (pf, z, 200);

  -- T1: con funciones publicadas (por omisión) el público las ve y compra en línea.
  perform pg_temp.as_anon();
  if (select count(*) from performances where production_id = 't120_obra') <> 1 then raise exception 'FALLO T1: anon no ve'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000c03');
  o := create_general_ticket_order(pf, 'Comprador', '5512345678', z, 1);
  perform pg_temp.as_root();

  -- T2: el equipo oculta las funciones: el público ya no las ve ni compra; quien ya compró sí ve la suya.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000c01');
  perform obra_venta_ajustes('t120_obra', false, 'web', true, true);
  if (select count(*) from performances where production_id = 't120_obra') <> 1 then raise exception 'FALLO T2: equipo no ve'; end if;
  perform pg_temp.as_anon();
  if (select count(*) from performances where production_id = 't120_obra') <> 0 then raise exception 'FALLO T2: anon ve'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000c02');
  if (select count(*) from performances where production_id = 't120_obra') <> 0 then raise exception 'FALLO T2: público ve'; end if;
  begin perform create_general_ticket_order(pf, 'X', '5512345678', z, 1); ok := false; exception when others then ok := sqlerrm like '%no está a la venta en línea%'; end;
  if not ok then raise exception 'FALLO T2: compró oculta'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000c03');
  if (select count(*) from performances where production_id = 't120_obra') <> 1 then raise exception 'FALLO T2: comprador no ve la suya'; end if;
  perform pg_temp.as_root();
  if exists (select 1 from productions_desde() where production_id = 't120_obra') then raise exception 'FALLO T2: desde'; end if;

  -- T3: publicadas, modo WhatsApp: en línea no; taquilla sí.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000c01');
  perform obra_venta_ajustes('t120_obra', true, 'whatsapp', false, false);
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000c02');
  begin perform create_general_ticket_order(pf, 'X', '5512345678', z, 1); ok := false; exception when others then ok := sqlerrm like '%por WhatsApp%'; end;
  if not ok then raise exception 'FALLO T3: compró en línea'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000c01');
  o := admin_create_general_order(pf, 'Taquilla', '5512345678', z, 2);
  perform pg_temp.as_root();
  if (select mostrar_precios from productions where id = 't120_obra') then raise exception 'FALLO T3: precios'; end if;
  if exists (select 1 from productions_desde() where production_id = 't120_obra') then raise exception 'FALLO T3: desde sin precios'; end if;

  -- T3b: híbrido: se aparta en línea.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000c01');
  perform obra_venta_ajustes('t120_obra', true, 'hibrido', true, false);
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000c02');
  o := create_general_ticket_order(pf, 'Hibrido', '5512345678', z, 1);
  perform pg_temp.as_root();
  if (select mostrar_total from productions where id = 't120_obra') then raise exception 'FALLO T3b: total'; end if;

  -- T4: sin permiso no se cambia.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000c02');
  begin perform obra_venta_ajustes('t120_obra', true, 'web', true, true); ok := false; exception when others then ok := true; end;
  perform pg_temp.as_root();
  if not ok then raise exception 'FALLO T4'; end if;
end $$;

select 'TODO OK';
