-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0088 aplicadas.

insert into auth.users (id, instance_id, aud, role, email)
values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't88_comprador@test.local'),
       ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't88_admin@test.local'),
       ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't88_otro@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-0000000000e2';

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

create temp table ctx (k text primary key, v uuid);
grant all on ctx to public;

-- Funciones: una futura en venta, una que ya pasó (en venta por descuido) y una de hace 1 hora.
do $$ declare fut uuid; pas uuid; hoy uuid; zona uuid; begin
  insert into performances (production_id, starts_at, on_sale) values ('showman', now() + interval '10 days', true) returning id into fut;
  insert into performances (production_id, starts_at, on_sale) values ('showman', now() - interval '1 day', true) returning id into pas;
  insert into performances (production_id, starts_at, on_sale) values ('showman', now() - interval '1 hour', true) returning id into hoy;
  insert into performance_price_categories (performance_id, price_category_id, price)
    select p, id, 100 from price_categories, unnest(array[fut, pas, hoy]) p where production_id = 'showman'
    on conflict (performance_id, price_category_id) do update set price = 100;
  insert into price_categories (production_id, nombre, cupo) values ('showman', 'General 88', 3) returning id into zona;
  insert into performance_price_categories (performance_id, price_category_id, price)
    select p, zona, 80 from unnest(array[fut, pas, hoy]) p
    on conflict (performance_id, price_category_id) do update set price = 80;
  insert into ctx values ('fut', fut), ('pas', pas), ('hoy', hoy), ('zona', zona);
end $$;

-- T1: en línea no se vende una función pasada (asientos ni general); taquilla, hasta 3 h después.
do $$ declare fut uuid := (select v from ctx where k = 'fut'); pas uuid := (select v from ctx where k = 'pas');
  hoy uuid := (select v from ctx where k = 'hoy'); zona uuid := (select v from ctx where k = 'zona'); s uuid; j json; begin
  select id into s from seats where production_id = 'showman' and is_active order by seat_label limit 1;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
  begin perform create_seated_ticket_order(pas, 'C', '5512345678', array[s]); raise exception 'FALLO T1: vendió asiento de función pasada';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin perform create_general_ticket_order(pas, 'C', '5512345678', zona, 1); raise exception 'FALLO T1: vendió general de función pasada';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin perform create_general_ticket_order(hoy, 'C', '5512345678', zona, 1); raise exception 'FALLO T1: vendió en línea una función ya empezada';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  j := create_seated_ticket_order(fut, 'C', '5512345678', array[s]);
  insert into ctx values ('o1', (j->>'order_id')::uuid), ('s1', s);
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
  begin perform admin_create_general_order(pas, 'T', '55', zona, 1); raise exception 'FALLO T1: taquilla vendió función de ayer';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if;
    if sqlerrm not like '%no está disponible%' then raise exception 'FALLO T1: mensaje general (%)', sqlerrm; end if; end;
  begin perform admin_create_seated_order(pas, 'T', '55', array[s]); raise exception 'FALLO T1: taquilla vendió asiento de ayer';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if;
    if sqlerrm not like '%ya pasó%' then raise exception 'FALLO T1: mensaje asientos (%)', sqlerrm; end if; end;
  perform admin_create_general_order(hoy, 'Tarde', '55', zona, 1);
  perform pg_temp.as_root();
end $$;

-- T2: aprobar con método y referencia; bitácora sin datos del comprador.
do $$ declare o1 uuid := (select v from ctx where k = 'o1'); o orders; a audit_log; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e3');
  begin perform approve_order(o1, 'transferencia', 'X'); raise exception 'FALLO T2: aprobó sin permiso';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
  begin perform approve_order(o1, 'bitcoin', null); raise exception 'FALLO T2: método inválido';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  perform approve_order(o1, 'transferencia', '  REF-123  ');
  perform pg_temp.as_root();
  select * into o from orders where id = o1;
  if o.status <> 'aprobado' or o.metodo_pago <> 'transferencia' or o.referencia <> 'REF-123' then raise exception 'FALLO T2: orden %', row_to_json(o); end if;
  select * into a from audit_log where tabla = 'orders' and registro_id = o1::text and accion = 'aprobar';
  if a.id is null or a.production_id <> 'showman' or a.actor <> '00000000-0000-0000-0000-0000000000e2' then raise exception 'FALLO T2: bitácora'; end if;
  if a.despues ? 'buyer_telefono' or a.despues ? 'buyer_nombre' then raise exception 'FALLO T2: bitácora con datos del comprador'; end if;
end $$;

-- T3: cancelar un boleto: baja el total, guarda motivo, avisa; sin boletos la orden queda cancelada.
do $$ declare fut uuid := (select v from ctx where k = 'fut'); o2 uuid; t1 uuid; t2 uuid; j json; o orders; s2 uuid; s3 uuid; begin
  select id into s2 from seats where production_id = 'showman' and is_active order by seat_label offset 1 limit 1;
  select id into s3 from seats where production_id = 'showman' and is_active order by seat_label offset 2 limit 1;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
  j := create_seated_ticket_order(fut, 'C', '5512345678', array[s2, s3]);
  o2 := (j->>'order_id')::uuid;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
  perform approve_order(o2);
  perform pg_temp.as_root();
  select id into t1 from tickets where order_id = o2 and seat_id = s2;
  select id into t2 from tickets where order_id = o2 and seat_id = s3;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
  perform admin_cancel_ticket(t1, 'Cambio de asiento');
  perform pg_temp.as_root();
  select * into o from orders where id = o2;
  if o.total <> 100 or o.status <> 'aprobado' then raise exception 'FALLO T3: total o estado tras cancelar uno %', row_to_json(o); end if;
  if (select cancel_motivo from tickets where id = t1) <> 'Cambio de asiento' or (select cancelled_by from tickets where id = t1) <> '00000000-0000-0000-0000-0000000000e2' then raise exception 'FALLO T3: registro'; end if;
  if not exists (select 1 from notifications where user_id = '00000000-0000-0000-0000-0000000000e1' and titulo = 'Se canceló un boleto de tu orden' and detalle like '%Cambio de asiento%') then raise exception 'FALLO T3: aviso'; end if;
  if not exists (select 1 from audit_log where accion = 'cancelar_boleto' and registro_id = o2::text and (despues->>'monto')::numeric = 100) then raise exception 'FALLO T3: bitácora'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
  perform admin_cancel_ticket(t2, null);
  perform pg_temp.as_root();
  select * into o from orders where id = o2;
  if o.total <> 0 or o.status <> 'rechazado' or o.motivo is null then raise exception 'FALLO T3: orden sin boletos %', row_to_json(o); end if;
  if not exists (select 1 from notifications where user_id = '00000000-0000-0000-0000-0000000000e1' and titulo = 'Tu orden fue cancelada') then raise exception 'FALLO T3: aviso de orden cancelada'; end if;
end $$;

-- T4: cancelar la orden completa (registra el monto que tenía).
do $$ declare o1 uuid := (select v from ctx where k = 'o1'); o orders; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
  perform admin_cancel_order(o1, 'Reembolso solicitado');
  begin perform admin_cancel_order(o1, null); raise exception 'FALLO T4: canceló dos veces';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  perform pg_temp.as_root();
  select * into o from orders where id = o1;
  if o.status <> 'rechazado' or o.total <> 0 or o.motivo <> 'Reembolso solicitado' then raise exception 'FALLO T4: %', row_to_json(o); end if;
  if exists (select 1 from tickets where order_id = o1 and is_active) then raise exception 'FALLO T4: boletos activos'; end if;
  if not exists (select 1 from audit_log where accion = 'cancelar' and registro_id = o1::text and (despues->>'monto')::numeric = 100) then raise exception 'FALLO T4: bitácora'; end if;
end $$;

-- T5: rechazar con motivo (el comprador lo ve en el aviso); el comprador cancela su apartado sin aviso a sí mismo.
do $$ declare fut uuid := (select v from ctx where k = 'fut'); s uuid := (select v from ctx where k = 's1'); j json; o3 uuid; o4 uuid; n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
  j := create_seated_ticket_order(fut, 'C', '5512345678', array[s]); o3 := (j->>'order_id')::uuid;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
  perform reject_order(o3, 'No llegó el pago');
  perform pg_temp.as_root();
  if (select motivo from orders where id = o3) <> 'No llegó el pago' then raise exception 'FALLO T5: motivo'; end if;
  if not exists (select 1 from notifications where user_id = '00000000-0000-0000-0000-0000000000e1' and detalle like '%Motivo: No llegó el pago%') then raise exception 'FALLO T5: aviso con motivo'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
  j := create_seated_ticket_order(fut, 'C', '5512345678', array[s]); o4 := (j->>'order_id')::uuid;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e3');
  begin perform cancel_my_order(o4); raise exception 'FALLO T5: canceló una orden ajena';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
  select count(*) into n from notifications where user_id = '00000000-0000-0000-0000-0000000000e1';
  perform cancel_my_order(o4);
  perform pg_temp.as_root();
  if (select status from orders where id = o4) <> 'rechazado' or exists (select 1 from tickets where order_id = o4 and is_active) then raise exception 'FALLO T5: no se canceló'; end if;
  if (select count(*) from notifications where user_id = '00000000-0000-0000-0000-0000000000e1') <> n then raise exception 'FALLO T5: se avisó a sí mismo'; end if;
  insert into ctx values ('o4', o4);
end $$;

-- T6: dar más tiempo: a uno pendiente y a uno vencido (si sus lugares siguen libres).
do $$ declare fut uuid := (select v from ctx where k = 'fut'); zona uuid := (select v from ctx where k = 'zona'); o4 uuid := (select v from ctx where k = 'o4');
  s uuid := (select v from ctx where k = 's1'); j json; o5 uuid; o6 uuid; o orders; begin
  -- Pendiente: se alarga.
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
  j := create_general_ticket_order(fut, 'C', '5512345678', zona, 2); o5 := (j->>'order_id')::uuid;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
  perform extend_order(o5, 48);
  perform pg_temp.as_root();
  if (select expires_at from orders where id = o5) < now() + interval '47 hours' then raise exception 'FALLO T6: no alargó'; end if;
  -- Vencido con cupo libre: vuelve a pendiente con sus boletos.
  update orders set expires_at = now() - interval '1 minute' where id = o5;
  perform expire_due_orders();
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
  perform extend_order(o5, 24);
  perform pg_temp.as_root();
  select * into o from orders where id = o5;
  if o.status <> 'pendiente' or o.vencida_at is not null or o.total <> 160 or (select count(*) from tickets where order_id = o5 and is_active) <> 2 then raise exception 'FALLO T6: reactivar %', row_to_json(o); end if;
  if not exists (select 1 from notifications where user_id = '00000000-0000-0000-0000-0000000000e1' and titulo = 'Tienes más tiempo para pagar') then raise exception 'FALLO T6: aviso'; end if;
  -- Vencido pero su asiento ya se vendió: no se reactiva.
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
  j := create_seated_ticket_order(fut, 'C', '5512345678', array[s]); o6 := (j->>'order_id')::uuid;
  perform pg_temp.as_root();
  update orders set expires_at = now() - interval '1 minute' where id = o6;
  perform expire_due_orders();
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
  perform admin_create_seated_order(fut, 'Otro', '55', array[s]);
  begin perform extend_order(o6, 24); raise exception 'FALLO T6: reactivó con asiento vendido';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if;
    if sqlerrm not like '%ya se vendió%' then raise exception 'FALLO T6: mensaje (%)', sqlerrm; end if; end;
  -- Cancelado por el comprador: no se reactiva.
  begin perform extend_order(o4, 24); raise exception 'FALLO T6: reactivó uno cancelado por el comprador';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  perform pg_temp.as_root();
end $$;

-- T7: método de pago en taquilla; bitácora de precios y códigos.
do $$ declare fut uuid := (select v from ctx where k = 'fut'); zona uuid := (select v from ctx where k = 'zona'); j json; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
  j := admin_create_general_order(fut, 'Taquilla', '55', zona, 1);
  perform order_set_pago((j->>'order_id')::uuid, 'efectivo', null);
  update performance_price_categories set price = 90 where performance_id = fut and price_category_id = zona;
  perform pg_temp.as_root();
  if (select metodo_pago from orders where id = (j->>'order_id')::uuid) <> 'efectivo' then raise exception 'FALLO T7: método'; end if;
  if not exists (select 1 from audit_log where tabla = 'precios' and production_id = 'showman' and (antes->>'precio')::numeric = 80 and (despues->>'precio')::numeric = 90) then raise exception 'FALLO T7: bitácora de precio'; end if;
end $$;

-- T8: eventos: no se borra uno con pagos; se cancela, avisa y sale de las listas; se edita.
do $$ declare e uuid; e2 uuid; j json; r record; begin
  insert into fan_encuentros (tipo, titulo, inicia, lugar, acceso, requiere_registro, requiere_boleto, precio, cupo)
  values ('presencial', 'Meet 88', now() + interval '3 days', 'Foro', 'cuenta', true, false, 200, 5) returning id into e;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
  perform fan_encuentro_apartar(e, true);
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
  begin delete from fan_encuentros where id = e; raise exception 'FALLO T8: borró evento con apartado';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if;
    if sqlerrm not like '%cancélalo%' then raise exception 'FALLO T8: mensaje (%)', sqlerrm; end if; end;
  perform evento_editar(e, '{"lugar": "Teatro", "cupo": "10", "precio": "250"}');
  perform pg_temp.as_root();
  if (select lugar from fan_encuentros where id = e) <> 'Teatro' or (select precio from fan_encuentros where id = e) <> 250 then raise exception 'FALLO T8: editar'; end if;
  if (select monto from evento_ordenes where encuentro_id = e) <> 200 then raise exception 'FALLO T8: cambió el monto ya apartado'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e3');
  begin perform evento_cancelar(e, 'x'); raise exception 'FALLO T8: canceló sin permiso';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
  j := evento_cancelar(e, 'Lluvia');
  perform pg_temp.as_root();
  if (select status from evento_ordenes where encuentro_id = e) <> 'rechazado' then raise exception 'FALLO T8: apartado sigue vivo'; end if;
  if not exists (select 1 from notifications where user_id = '00000000-0000-0000-0000-0000000000e1' and titulo = 'Se canceló un evento' and detalle like '%Lluvia%') then raise exception 'FALLO T8: aviso'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
  if exists (select 1 from fan_encuentros_lista(null) where id = e) or exists (select 1 from eventos_cartelera(50) where id = e) then raise exception 'FALLO T8: sigue en listas'; end if;
  select * into r from mis_eventos() where id = e;
  if not r.cancelado or r.cancelado_motivo <> 'Lluvia' then raise exception 'FALLO T8: mis eventos'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
  begin perform evento_abrir(e, true); raise exception 'FALLO T8: reabrió un cancelado';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  -- Sin pagos sí se borra.
  insert into fan_encuentros (tipo, titulo, inicia, lugar, acceso, requiere_registro, requiere_boleto) values ('presencial', 'Libre', now() + interval '3 days', 'Foro', 'cuenta', false, false) returning id into e2;
  delete from fan_encuentros where id = e2;
  perform pg_temp.as_root();
end $$;

-- T9: el retrato de un perfil no público no sale; el público sí. "Desde $".
do $$ declare pe uuid; r record; d numeric; begin
  insert into people (nombre) values ('Persona 88') returning id into pe;
  insert into production_credits (production_id, person_id, tipo, papel) values ('showman', pe, 'reparto', 'Papel 88');
  insert into pro_profiles (person_id, retrato_path, publico) values (pe, pe::text || '/88.webp', false);
  update productions set estado = 'publicada' where id = 'showman';
  perform pg_temp.as_root();
  set local role anon;
  select * into r from production_pro_info('showman') where person_id = pe;
  if r.retrato_path is not null or r.slug is not null then raise exception 'FALLO T9: retrato privado visible'; end if;
  select desde into d from productions_desde() where production_id = 'showman';
  -- Solo cuentan funciones futuras: la zona general quedó en 90 (T7); las pasadas en 80 no cuentan.
  if d is null or d <> 90 then raise exception 'FALLO T9: desde = %', d; end if;
  reset role;
end $$;

-- T10: nombres de quien operó la venta: solo para quien ve las ventas de la obra.
do $$ declare n int; begin
  update profiles set nombre = 'Admin 88' where id = '00000000-0000-0000-0000-0000000000e2';
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e3');
  select count(*) into n from ventas_actores('showman');
  if n <> 0 then raise exception 'FALLO T10: sin permiso ve nombres'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
  if not exists (select 1 from ventas_actores('showman') where nombre = 'Admin 88') then raise exception 'FALLO T10: no sale el nombre'; end if;
  perform pg_temp.as_root();
end $$;

select 'OK 0088' as resultado;
