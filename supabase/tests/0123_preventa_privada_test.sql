-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0123 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000f01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't123_admin@test.local'),
  ('00000000-0000-0000-0000-000000000f02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't123_invitada@test.local'),
  ('00000000-0000-0000-0000-000000000f03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't123_publico@test.local'),
  ('00000000-0000-0000-0000-000000000f04', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't123_otra@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-000000000f01';

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
-- ¿Puede comprar esta persona ahora? (preventa_revisar sin crear órdenes)
create or replace function pg_temp.puede(uid uuid, pf uuid) returns boolean language plpgsql as $$
begin
  perform pg_temp.as_user(uid);
  begin perform preventa_revisar(pf); perform pg_temp.as_root(); return true;
  exception when others then perform pg_temp.as_root(); return false; end;
end $$;

insert into productions (id, nombre, estado) values ('t123_obra', 'Obra 123', 'borrador');

do $$
declare pf uuid; pf2 uuid; oa uuid; ot uuid; r json; cod text; cod2 text; cid uuid; ok boolean; n int;
  adm uuid := '00000000-0000-0000-0000-000000000f01'; inv uuid := '00000000-0000-0000-0000-000000000f02';
  pub uuid := '00000000-0000-0000-0000-000000000f03'; otra uuid := '00000000-0000-0000-0000-000000000f04';
begin
  insert into performances (production_id, starts_at, on_sale) values ('t123_obra', now() + interval '30 days', true) returning id into pf;
  -- Club Fan del día +5 al +10; privada desde hace 1 día.
  perform pg_temp.as_user(adm);
  perform obra_preventa('t123_obra', now() + interval '5 days', now() + interval '10 days');
  begin perform obra_preventa_privada('t123_obra', now() + interval '6 days', 2); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T0: privada después del inicio'; end if;
  r := obra_preventa_privada('t123_obra', now() - interval '1 day', 2);
  if (r->>'funciones')::int <> 1 then raise exception 'FALLO T0: no se puso en la función %', r; end if;
  r := preventa_codigo_crear('t123_obra', 'Familias del elenco', 1);
  cod := r->>'codigo'; cid := (r->>'id')::uuid;
  r := preventa_codigo_crear('t123_obra', 'Patrocinadores', null);
  cod2 := r->>'codigo';
  -- Función nueva toma la privada de la obra.
  insert into performances (production_id, starts_at, on_sale) values ('t123_obra', now() + interval '40 days', true) returning id into pf2;
  perform pg_temp.as_root();
  if preventa_privada_de(pf2) is null then raise exception 'FALLO T0: función nueva sin privada'; end if;

  -- T1: etapa privada: sin código nadie; el público no ve fechas privadas ni códigos.
  if pg_temp.puede(pub, pf) then raise exception 'FALLO T1: público compra en privada'; end if;
  perform pg_temp.as_user(pub);
  if (select count(*) from preventa_privada_funciones) <> 0 or (select count(*) from preventa_codigos) <> 0 then raise exception 'FALLO T1: público ve privados'; end if;
  if (mi_preventa_privada('t123_obra')->>'acceso')::boolean then raise exception 'FALLO T1: acceso sin código'; end if;

  -- T2: canjear y comprar; el código con máximo 1 persona se llena.
  perform pg_temp.as_user(inv);
  r := preventa_canjear(lower(cod));
  if r->>'production_id' <> 't123_obra' then raise exception 'FALLO T2: canje %', r; end if;
  r := preventa_canjear(cod);  -- otra vez: no truena
  if not (r->>'ya')::boolean then raise exception 'FALLO T2: segundo canje'; end if;
  if not (mi_preventa_privada('t123_obra')->>'acceso')::boolean then raise exception 'FALLO T2: sin acceso'; end if;
  perform pg_temp.as_root();
  if not pg_temp.puede(inv, pf) then raise exception 'FALLO T2: invitada no compra'; end if;
  perform pg_temp.as_user(otra);
  begin perform preventa_canjear(cod); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T2: máximo de personas'; end if;
  perform preventa_canjear(cod2);
  perform pg_temp.as_root();
  if not pg_temp.puede(otra, pf) then raise exception 'FALLO T2: patrocinadores'; end if;

  -- T3: límite de 2 boletos por persona en la etapa privada (al cerrar la compra).
  insert into orders (order_code, performance_id, status, buyer_nombre, buyer_telefono, buyer_user_id, total)
    values ('T123A', pf, 'pendiente', 'Inv', '5512345678', inv, 200) returning id into oa;
  insert into tickets (order_id, performance_id, unit_price) values (oa, pf, 100), (oa, pf, 100);
  set constraints preventa_privada_tope immediate;
  begin
    insert into tickets (order_id, performance_id, unit_price) values (oa, pf, 100);
    set constraints preventa_privada_tope immediate; ok := false;
  exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T3: tercer boleto en privada'; end if;
  set constraints preventa_privada_tope deferred;
  -- Taquilla (orden sin cuenta) no tiene límite.
  insert into orders (order_code, performance_id, status, buyer_nombre, buyer_telefono, total, created_by_staff_id)
    values ('T123T', pf, 'aprobado', 'Taq', '5512345670', 300, adm) returning id into ot;
  insert into tickets (order_id, performance_id, unit_price) select ot, pf, 100 from generate_series(1, 3);
  set constraints preventa_privada_tope immediate;
  set constraints preventa_privada_tope deferred;

  -- T4: código desactivado: quita el acceso; tope de intentos fallidos.
  perform pg_temp.as_user(adm);
  perform preventa_codigo_estado(cid, false);
  perform pg_temp.as_root();
  if pg_temp.puede(inv, pf) then raise exception 'FALLO T4: código desactivado sigue dando acceso'; end if;
  perform pg_temp.as_user(pub);
  r := preventa_canjear('NOEXISTE1');
  if r->>'error' is null then raise exception 'FALLO T4: código inválido sin error'; end if;
  for n in 1..9 loop perform preventa_canjear('NOEXISTE1'); end loop;
  begin perform preventa_canjear(cod2); ok := false; exception when others then ok := sqlerrm like 'Demasiados%'; end;
  if not ok then raise exception 'FALLO T4: tope de intentos'; end if;
  perform pg_temp.as_root();

  -- T5: etapa Club Fan: el código entra, el público no; venta general: todos.
  update performances set preventa_desde = now() - interval '1 hour', preventa_hasta = now() + interval '1 day' where id = pf;
  if not pg_temp.puede(otra, pf) then raise exception 'FALLO T5: código en etapa Club Fan'; end if;
  if pg_temp.puede(pub, pf) then raise exception 'FALLO T5: público en etapa Club Fan'; end if;
  update performances set preventa_hasta = now() - interval '1 minute' where id = pf;
  if not pg_temp.puede(pub, pf) then raise exception 'FALLO T5: venta general'; end if;

  -- T6: resumen del panel y fechas propias de una función.
  perform pg_temp.as_user(adm);
  select count(*) into n from preventa_codigos_resumen('t123_obra') where personas >= 1;
  if n <> 2 then raise exception 'FALLO T6: resumen %', n; end if;
  perform funcion_preventa_privada(pf2, null);
  perform pg_temp.as_root();
  if preventa_privada_de(pf2) is not null then raise exception 'FALLO T6: quitar privada de una función'; end if;
end $$;

select 'TODO OK' as resultado;
