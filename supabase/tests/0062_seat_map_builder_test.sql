-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0031–0062 aplicadas.

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_admin@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_prod@test.local'),
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
create or replace function pg_temp.fila(f text, desde int, hasta int, lado text, zona uuid) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('fila', f, 'numero', n, 'lado', lado, 'etiqueta', f || '-' || n, 'zona', zona))
    from generate_series(desde, hasta) n
$$;

do $$ declare vip uuid; gen uuid; otra uuid; r jsonb; perf uuid; s1 uuid; s2 uuid; n int; showman_n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform panel_add_member('mm', 't_prod@test.local', 'productor');
  perform panel_add_member('mm', 't_taq@test.local', 'puerta');

  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
  insert into price_categories (production_id, nombre, color) values ('mm', 'VIP', '#8B5CF6') returning id into vip;
  insert into price_categories (production_id, nombre, cupo) values ('mm', 'Pista', 50) returning id into gen;
  select id into otra from price_categories where production_id = 'showman' limit 1;

  -- T1: generar 2 filas (A: 1-4 central, B: 1-3 izquierda + 4-6 derecha)
  r := seat_map_generate('mm', pg_temp.fila('A', 1, 4, 'central', vip) || pg_temp.fila('B', 1, 3, 'izquierda', vip) || pg_temp.fila('B', 4, 6, 'derecha', vip));
  if (r->>'asientos')::int <> 10 or (select count(*) from seats where production_id = 'mm') <> 10 then raise exception 'FALLO T1: %', r; end if;

  -- T2: validaciones
  begin perform seat_map_generate('mm', pg_temp.fila('A', 1, 2, 'central', vip) || pg_temp.fila('A', 2, 3, 'central', vip)); raise exception 'FALLO T2a';
  exception when raise_exception then if sqlerrm not like '%repetidos%' then raise; end if; end;
  begin perform seat_map_generate('mm', pg_temp.fila('A', 1, 2, 'central', otra)); raise exception 'FALLO T2b';
  exception when raise_exception then if sqlerrm not like '%zona con asiento%' then raise; end if; end;
  begin perform seat_map_generate('mm', pg_temp.fila('A', 1, 2, 'central', gen)); raise exception 'FALLO T2c';
  exception when raise_exception then if sqlerrm not like '%zona con asiento%' then raise; end if; end;
  begin perform seat_map_generate('mm', jsonb_build_array(jsonb_build_object('fila', 'A', 'lado', 'central', 'etiqueta', 'A-x', 'zona', vip))); raise exception 'FALLO T2d';
  exception when raise_exception then if sqlerrm not like '%Número%' then raise; end if; end;
  begin perform seat_map_generate('mm', pg_temp.fila('A', 1, 2, 'arriba', vip)); raise exception 'FALLO T2e';
  exception when raise_exception then if sqlerrm not like '%Bloque%' then raise; end if; end;
  begin perform seat_map_generate('mm', pg_temp.fila('A', 1, 2001, 'central', vip)); raise exception 'FALLO T2f';
  exception when raise_exception then if sqlerrm not like '%2000%' then raise; end if; end;
  if (select count(*) from seats where production_id = 'mm') <> 10 then raise exception 'FALLO T2g: un error borró el mapa'; end if;

  -- T3: la puerta no arma mapas
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
  begin perform seat_map_generate('mm', pg_temp.fila('A', 1, 2, 'central', vip)); raise exception 'FALLO T3a';
  exception when raise_exception then if sqlerrm not like '%No autorizado%' then raise; end if; end;
  begin perform seat_map_update('mm', array(select id from seats where production_id = 'mm'), 'quitar'); raise exception 'FALLO T3b';
  exception when raise_exception then if sqlerrm not like '%No autorizado%' then raise; end if; end;

  -- T4: regenerar reemplaza (sin ventas)
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
  perform seat_map_generate('mm', pg_temp.fila('A', 1, 8, 'central', vip));
  if (select count(*) from seats where production_id = 'mm') <> 8 then raise exception 'FALLO T4'; end if;

  -- T5: se vende un asiento: ya no se regenera ni se copia; se ajusta asiento por asiento
  perform set_config('role', 'postgres', true);
  update productions set concluded = false where id = 'mm';  -- 0088: no se vende en obras concluidas
  insert into performances (production_id, starts_at, on_sale) values ('mm', now() + interval '3 days', true) returning id into perf;
  insert into performance_price_categories (performance_id, price_category_id, price) values (perf, vip, 300);
  select id into s1 from seats where production_id = 'mm' and seat_label = 'A-1';
  select id into s2 from seats where production_id = 'mm' and seat_label = 'A-2';
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform admin_create_seated_order(perf, 'Ana', '5512345678', array[s1]);
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
  begin perform seat_map_generate('mm', pg_temp.fila('A', 1, 8, 'central', vip)); raise exception 'FALLO T5a';
  exception when raise_exception then if sqlerrm not like '%ya tiene boletos%' then raise; end if; end;
  begin perform seat_map_copy('showman', 'mm'); raise exception 'FALLO T5b';
  exception when raise_exception then if sqlerrm not like '%ya tiene boletos%' then raise; end if; end;
  begin perform seat_map_update('mm', array[s1, s2], 'quitar'); raise exception 'FALLO T5c';
  exception when raise_exception then if sqlerrm not like '%boleto vendido%' then raise; end if; end;
  if not (select is_active from seats where id = s2) then raise exception 'FALLO T5d: quitó a medias'; end if;
  r := seat_map_update('mm', array[s2], 'quitar');
  if (select is_active from seats where id = s2) then raise exception 'FALLO T5e'; end if;
  -- el asiento quitado ya no se vende
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  begin perform admin_create_seated_order(perf, 'Beto', '5512345678', array[s2]); raise exception 'FALLO T5f: vendió un asiento quitado';
  exception when raise_exception then if sqlerrm not like '%no está disponible%' then raise; end if; end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
  perform seat_map_update('mm', array[s2], 'poner');
  if not (select is_active from seats where id = s2) then raise exception 'FALLO T5g'; end if;
  begin perform seat_map_update('mm', array[s2], 'zona', gen); raise exception 'FALLO T5h';
  exception when raise_exception then if sqlerrm not like '%zona con asiento%' then raise; end if; end;
  begin perform seat_map_update('mm', array[(select id from seats where production_id = 'showman' limit 1)], 'poner'); raise exception 'FALLO T5i';
  exception when raise_exception then if sqlerrm not like '%no es de esta obra%' then raise; end if; end;
  -- y la venta normal sigue con el asiento devuelto
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform admin_create_seated_order(perf, 'Beto', '5512345678', array[s2]);

  -- T6: copiar Showman a HSM: mismos asientos, zonas creadas por nombre
  select count(*) into showman_n from seats where production_id = 'showman' and lado is not null and seat_number is not null;
  r := seat_map_copy('showman', 'hsm');
  if (r->>'asientos')::int <> showman_n or (select count(*) from seats where production_id = 'hsm') <> showman_n then raise exception 'FALLO T6a: %', r; end if;
  if exists (select 1 from seats s join price_categories pc on pc.id = s.price_category_id where s.production_id = 'hsm' and pc.production_id <> 'hsm') then
    raise exception 'FALLO T6b: zonas de otra obra'; end if;
  if (select count(*) from seats where production_id = 'showman') <> 725 then raise exception 'FALLO T6c: tocó el origen'; end if;

  -- T7: bitácora: una línea por cambio
  if (select count(*) from audit_log where tabla = 'seats' and production_id = 'mm') < 4 then raise exception 'FALLO T7'; end if;

  -- T8: anónimo no entra
  perform pg_temp.as_anon();
  begin perform seat_map_generate('mm', '[]'); raise exception 'FALLO T8';
  exception when insufficient_privilege then null; end;

  raise exception 'OK: 0062 creador de mapas';
end $$;
