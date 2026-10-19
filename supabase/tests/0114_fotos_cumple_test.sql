-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0114 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000e01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't114_admin@test.local'),
  ('00000000-0000-0000-0000-000000000e02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't114_fan@test.local'),
  ('00000000-0000-0000-0000-000000000e03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't114_otro@test.local'),
  ('00000000-0000-0000-0000-000000000e04', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't114_nocumple@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-000000000e01';

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

insert into productions (id, nombre, estado) values ('t114_obra', 'Obra 114', 'borrador'), ('t114_otra', 'Otra 114', 'borrador');
create temp table t114 (k text primary key, v uuid);
grant all on t114 to authenticated;

-- T1: fotos de una función y aviso a quienes fueron (una sola vez).
do $$ declare pf uuid; pf2 uuid; n int; ok boolean; begin
  insert into performances (production_id, starts_at, on_sale) values ('t114_obra', now() - interval '2 days', false) returning id into pf;
  insert into performances (production_id, starts_at, on_sale) values ('t114_otra', now() - interval '2 days', false) returning id into pf2;
  insert into orders (order_code, performance_id, status, buyer_nombre, buyer_telefono, buyer_user_id, total) values
    ('T114A', pf, 'aprobado', 'Fan', '5512345678', '00000000-0000-0000-0000-000000000e02', 100),
    ('T114B', pf, 'aprobado', 'Fan', '5512345678', '00000000-0000-0000-0000-000000000e02', 100),
    ('T114C', pf, 'pendiente', 'Otro', '5512345678', '00000000-0000-0000-0000-000000000e03', 100);
  -- Una función de otra obra no se puede poner.
  begin
    insert into gallery_photos (production_id, kind, path, performance_id) values ('t114_obra', 'galeria', 't114_obra/galeria/x.jpg', pf2);
    ok := false;
  exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T1: función de otra obra'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000e01');
  begin perform fotos_funcion_avisar('t114_obra', pf); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T1: avisó sin fotos'; end if;
  perform pg_temp.as_root();
  insert into gallery_photos (production_id, kind, path, performance_id) values ('t114_obra', 'galeria', 't114_obra/galeria/a.jpg', pf);
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000e01');
  if (select con_boleto from fotos_funcion_estado('t114_obra') where performance_id = pf) <> 1 then raise exception 'FALLO T1: con boleto'; end if;
  n := fotos_funcion_avisar('t114_obra', pf);
  if n <> 1 then raise exception 'FALLO T1: avisados %', n; end if;
  begin perform fotos_funcion_avisar('t114_obra', pf); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T1: avisó dos veces'; end if;
  perform pg_temp.as_root();
  if (select count(*) from notifications where user_id = '00000000-0000-0000-0000-000000000e02' and href like '/producciones/t114_obra/fotos?funcion=%') <> 1 then
    raise exception 'FALLO T1: aviso';
  end if;
  if exists (select 1 from notifications where user_id = '00000000-0000-0000-0000-000000000e03' and href like '/producciones/t114_obra/fotos%') then
    raise exception 'FALLO T1: avisó a un pendiente';
  end if;
  -- Sin permiso, no.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000e03');
  begin perform fotos_funcion_estado('t114_obra'); ok := false; exception when others then ok := true; end;
  perform pg_temp.as_root();
  if not ok then raise exception 'FALLO T1: sin permiso'; end if;
end $$;

-- T2: regalo de cumpleaños: solo socios del mes, solo su dueño, una compra.
do $$ declare pf uuid; pf2 uuid; cod text; dc discount_codes; r json; n int; ok boolean; begin
  insert into fan_members (user_id) values ('00000000-0000-0000-0000-000000000e02'), ('00000000-0000-0000-0000-000000000e04');
  update profiles set fecha_nacimiento = make_date(2005, extract(month from hoy_mx())::int, 1) where id = '00000000-0000-0000-0000-000000000e02';
  update profiles set fecha_nacimiento = make_date(2005, (extract(month from hoy_mx())::int % 12) + 1, 1) where id = '00000000-0000-0000-0000-000000000e04';
  n := regalos_cumple_generar();
  if n <> 1 then raise exception 'FALLO T2: generados %', n; end if;
  if regalos_cumple_generar() <> 0 then raise exception 'FALLO T2: repetido'; end if;
  select codigo into cod from regalos_cumple where user_id = '00000000-0000-0000-0000-000000000e02';
  if not exists (select 1 from notifications where user_id = '00000000-0000-0000-0000-000000000e02' and detalle like '%' || cod || '%') then
    raise exception 'FALLO T2: aviso';
  end if;
  insert into performances (production_id, starts_at, on_sale) values ('t114_obra', now() + interval '5 days', true) returning id into pf;
  insert into performances (production_id, starts_at, on_sale) values ('t114_otra', now() + interval '5 days', true) returning id into pf2;
  insert into t114 values ('pf', pf), ('pf2', pf2);

  -- Otra persona no lo puede usar.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000e03');
  begin perform preview_discount_code(pf, cod); ok := false; exception when others then ok := true; end;
  perform pg_temp.as_root();
  if not ok then raise exception 'FALLO T2: lo usó otra persona'; end if;

  -- Su dueño: vista previa (no crea nada) y al comprar se crea el código de esa obra.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000e02');
  r := preview_discount_code(pf, lower(cod));
  if (r->>'percent')::numeric <> 10 or (r->>'max_tickets_per_order')::int <> 2 then raise exception 'FALLO T2: vista previa %', r; end if;
  perform pg_temp.as_root();
  -- Como lo hace la compra (función interna, con la sesión del socio).
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-000000000e02', 'role', 'authenticated')::text, true);
  dc := _resolve_discount_code(pf, 't114_obra', cod, true);
  perform pg_temp.as_root();
  if dc.id is null or dc.regalo_id is null then raise exception 'FALLO T2: código de obra'; end if;
  insert into orders (order_code, performance_id, status, buyer_nombre, buyer_telefono, buyer_user_id, total, discount_code_id, discount_codigo)
    values ('T114D', pf, 'pendiente', 'Fan', '5512345678', '00000000-0000-0000-0000-000000000e02', 90, dc.id, dc.codigo);
  insert into t114 select 'orden', id from orders where discount_code_id = dc.id;

  -- Ya usado: ni en la misma obra ni en otra.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000e02');
  begin perform preview_discount_code(pf2, cod); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T2: segunda obra'; end if;
  begin perform preview_discount_code(pf, cod); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T2: misma obra'; end if;
  perform pg_temp.as_root();

  -- Si la orden se cancela, el regalo vuelve a servir.
  update orders set status = 'rechazado' where id = (select v from t114 where k = 'orden');
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000e02');
  r := preview_discount_code(pf2, cod);
  perform pg_temp.as_root();

  -- Si la cuenta se borra, sus códigos dejan de servir.
  delete from regalos_cumple where codigo = cod;
  if exists (select 1 from discount_codes where codigo = cod and is_active) then raise exception 'FALLO T2: borrar'; end if;
end $$;

select 'TODO OK';
