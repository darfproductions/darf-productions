-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0031–0050 aplicadas.

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

do $$ declare n int; c text; c2 text; ext text; sid uuid; fid uuid; r record; begin
  update profiles set nombre = 'Ána Pérez López' where id = '00000000-0000-0000-0000-0000000000e1';
  select id into fid from performances where production_id = 'showman' limit 1;
  -- T1: cada cuenta tiene su código, con formato
  select count(*) into n from profiles p where not exists (select 1 from sellers s where s.user_id = p.id);
  if n <> 0 then raise exception 'FALLO T1a: % cuentas sin código', n; end if;
  select codigo into c from sellers where user_id = '00000000-0000-0000-0000-0000000000e1';
  if c !~ '^[A-Z0-9]{7}$' then raise exception 'FALLO T1b: código raro %', c; end if;
  select codigo into c2 from sellers where user_id = '00000000-0000-0000-0000-0000000000e2';
  select id into sid from sellers where codigo = c;

  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform panel_add_member('showman', 't_ana@test.local', 'integrante');
  perform panel_add_member('showman', 't_taq@test.local', 'taquilla');
  perform panel_add_member('showman', 't_cont@test.local', 'contenido');

  -- T2: el código del elenco vale en su obra; el de alguien de fuera no
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
  if preview_seller_code(fid, lower(c)) <> 'Ána P.' then raise exception 'FALLO T2a: nombre corto %', preview_seller_code(fid, c); end if;
  begin
    perform preview_seller_code(fid, c2);
    raise exception 'FALLO T2b: código de alguien fuera del elenco aceptado';
  exception when raise_exception then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  begin
    perform preview_seller_code(fid, 'NOEXISTE1');
    raise exception 'FALLO T2c: código inexistente aceptado';
  exception when raise_exception then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;

  -- T3: taquilla desactiva al del elenco, activa a alguien de fuera y crea un externo
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
  perform seller_set_active('showman', sid, false);
  if seller_active_in(sid, 'showman') then raise exception 'FALLO T3a: sigue activo tras desactivarlo'; end if;
  perform seller_reset('showman', sid);
  if not seller_active_in(sid, 'showman') then raise exception 'FALLO T3b: no volvió a la regla del elenco'; end if;
  if seller_add_account('showman', 'T_FAN@test.local') <> c2 then raise exception 'FALLO T3c: activó otro código'; end if;
  ext := seller_add_external('showman', 'Compañía Luz');
  reset role;
  if not seller_active_in((select id from sellers where codigo = ext), 'showman') then raise exception 'FALLO T3d: externo inactivo'; end if;
  if seller_active_in((select id from sellers where codigo = ext), 'mm') then raise exception 'FALLO T3e: externo activo en otra obra'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
  select count(*) into n from seller_list('showman');
  if n < 3 then raise exception 'FALLO T3f: la lista tiene % vendedores', n; end if;

  -- T4: contenido no administra vendedores; el público no ve la tabla de vendedores
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  begin
    perform seller_add_external('showman', 'Intruso');
    raise exception 'FALLO T4a: contenido creó un vendedor';
  exception when raise_exception then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
  select count(*) into n from sellers;
  if n <> 1 then raise exception 'FALLO T4b: una cuenta ve % vendedores (debe ver solo el suyo)', n; end if;
  reset role;

  -- T5: la base rechaza una orden con un vendedor no activo en la obra
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
  perform seller_set_active('showman', sid, false);
  reset role;
  begin
    insert into orders (order_code, performance_id, buyer_nombre, buyer_telefono, total, seller_id)
    values ('T-SELL-1', fid, 'X', '1', 100, sid);
    raise exception 'FALLO T5a: orden con vendedor inactivo';
  exception when raise_exception then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  insert into orders (order_code, performance_id, buyer_nombre, buyer_telefono, total, seller_id, status)
  values ('T-SELL-2', fid, 'X', '1', 250, (select id from sellers where codigo = c2), 'aprobado');
  if (select count(*) from seller_list('showman') where codigo = c2 and ordenes = 1 and monto = 250) <> 1 then raise exception 'FALLO T5b: la lista no cuenta la venta'; end if;

  -- T6: mis ventas
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
  select * into r from my_seller() where production_id = 'showman';
  if r.codigo <> c2 or r.ordenes <> 1 or r.monto <> 250 or not r.activo then raise exception 'FALLO T6a: mis ventas %', row_to_json(r); end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  select count(*) into n from my_seller();
  if n < 1 then raise exception 'FALLO T6b: sin obras no devolvió el código'; end if;
  reset role;
end $$;

do $$ begin raise exception 'OK: 0050 pruebas T1–T6 (se aborta a propósito para no persistir)'; end $$;
