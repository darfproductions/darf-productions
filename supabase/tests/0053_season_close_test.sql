-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- (0066: Producción con obra.publicar puede reactivar.)
-- Precede: 0031–0053 aplicadas.

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

do $$ declare n int; fid uuid; oid uuid; s jsonb; perid uuid; cid uuid; begin
  update productions set estado = 'publicada' where id = 'showman';
  update performances set on_sale = true where production_id = 'showman' and starts_at is not null;
  select id into fid from performances where production_id = 'showman' order by starts_at limit 1;
  -- una venta aprobada de 300 con 2 boletos (1 ya entró) y una pendiente
  insert into orders (order_code, performance_id, buyer_nombre, buyer_telefono, total, status)
  values ('T-SEASON-1', fid, 'X', '1', 300, 'aprobado') returning id into oid;
  insert into tickets (order_id, performance_id, unit_price, checked_in_at) values (oid, fid, 150, now()), (oid, fid, 150, null);
  insert into orders (order_code, performance_id, buyer_nombre, buyer_telefono, total, status)
  values ('T-SEASON-2', fid, 'Y', '1', 99, 'pendiente') returning id into oid;
  -- Ana es integrante con crédito ligado a su cuenta
  insert into people (nombre, profile_id) values ('Ana', '00000000-0000-0000-0000-0000000000e1') returning id into perid;
  insert into production_credits (production_id, person_id, tipo, papel, activo) values ('showman', perid, 'reparto', 'Barnum', true);

  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform panel_add_member('showman', 't_ana@test.local', 'integrante');
  perform panel_add_member('showman', 't_cont@test.local', 'productor');
  perform panel_add_member('showman', 't_taq@test.local', 'taquilla');

  -- T1: el resumen no duplica montos (300, 2 boletos, 1 asistió)
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
  s := season_summary('showman');
  if (s->'ventas'->>'ingresos')::numeric <> 300 or (s->'ventas'->>'boletos')::int <> 2 or (s->'ventas'->>'asistieron')::int <> 1 then
    raise exception 'FALLO T1a: resumen %', s->'ventas';
  end if;
  if (select sum((x->>'ingresos')::numeric) from jsonb_array_elements(s->'funciones') x) <> 300 then raise exception 'FALLO T1b: por función'; end if;

  -- T2: taquilla no cierra; con órdenes pendientes nadie cierra
  begin
    perform season_close('showman', null, true);
    raise exception 'FALLO T2a: taquilla cerró la temporada';
  exception when raise_exception then if sqlerrm like 'FALLO%' then raise; end if;
  end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  begin
    perform season_close('showman', null, true);
    raise exception 'FALLO T2b: cerró con órdenes pendientes';
  exception when raise_exception then if sqlerrm not like '%por aprobar%' then raise; end if;
  end;
  reset role;
  update orders set status = 'rechazado' where id = oid;

  -- T3: Producción cierra: archiva, quita venta, da de baja y deja los créditos
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  cid := season_close('showman', 'Gracias a todos', true);
  reset role;
  if (select estado from productions where id = 'showman') <> 'archivada' or not (select concluded from productions where id = 'showman') then raise exception 'FALLO T3a: no se archivó'; end if;
  if exists (select 1 from performances where production_id = 'showman' and on_sale) then raise exception 'FALLO T3b: sigue en venta'; end if;
  if is_active_member('showman', '00000000-0000-0000-0000-0000000000e1') then raise exception 'FALLO T3c: Ana sigue activa'; end if;
  if not (select activo from production_credits where person_id = perid) then raise exception 'FALLO T3d: se quitó el crédito'; end if;
  if (select (resumen->'ventas'->>'ingresos')::numeric from season_closures where id = cid) <> 300 or (select bajas from season_closures where id = cid) <> 1 then
    raise exception 'FALLO T3e: cierre guardado mal';
  end if;

  -- T4: no se cierra dos veces; solo el Director reabre
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  begin
    perform season_close('showman', null, false);
    raise exception 'FALLO T4a: cerró dos veces';
  exception when raise_exception then if sqlerrm like 'FALLO%' then raise; end if;
  end;
  -- Desde 0066 Producción (obra.publicar) también reactiva (decisión de Diego).
  perform season_reopen('showman');
  if (select estado from productions where id = 'showman') <> 'publicada' then raise exception 'FALLO T4c: no se reabrió'; end if;

  -- T5: reporte general solo del Director
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  select count(*) into n from director_overview() d where d.production_id = 'showman' and d.ingresos = 300 and d.boletos = 2;
  if n <> 1 then raise exception 'FALLO T5a: reporte general'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  begin
    perform director_overview();
    raise exception 'FALLO T5b: Producción ve el reporte general';
  exception when raise_exception then if sqlerrm like 'FALLO%' then raise; end if;
  end;
  reset role;
end $$;

do $$ begin raise exception 'OK: 0053 pruebas T1–T5 (se aborta a propósito para no persistir)'; end $$;
