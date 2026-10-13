-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0091 aplicadas.

insert into auth.users (id, instance_id, aud, role, email)
values ('00000000-0000-0000-0000-0000000009b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't91_comprador@test.local'),
       ('00000000-0000-0000-0000-0000000009b2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't91_admin@test.local'),
       ('00000000-0000-0000-0000-0000000009b3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't91_puerta@test.local'),
       ('00000000-0000-0000-0000-0000000009b4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't91_otro@test.local');
update profiles set rol = 'admin', nombre = 'Caja Uno' where id = '00000000-0000-0000-0000-0000000009b2';
insert into production_members (production_id, user_id, role_id) values ('showman', '00000000-0000-0000-0000-0000000009b3', 'puerta');

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

do $$ declare f uuid; s uuid[]; begin
  insert into performances (production_id, starts_at, on_sale) values ('showman', now() + interval '12 days', true) returning id into f;
  insert into performance_price_categories (performance_id, price_category_id, price)
    select f, id, 200 from price_categories where production_id = 'showman'
    on conflict (performance_id, price_category_id) do update set price = 200;
  select array_agg(id order by seat_label) into s from (select id, seat_label from seats where production_id = 'showman' and is_active
     and exists (select 1 from performance_price_categories p where p.performance_id = f and p.price_category_id = seats.price_category_id)
   order by seat_label limit 6) x;
  insert into ctx values ('f', f), ('s1', s[1]), ('s2', s[2]), ('s3', s[3]), ('s4', s[4]), ('s5', s[5]);
  insert into discount_codes (production_id, codigo, percent, is_active) values ('showman', 'MITAD91', 50, true);
end $$;

-- T1: código de descuento en taquilla (solo ventas de taquilla, una vez).
do $$ declare f uuid := (select v from ctx where k = 'f'); j json; r json; oid uuid; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000009b2');
  j := admin_create_seated_order(f, 'Taquilla Uno', '5511111111', array[(select v from ctx where k = 's1'), (select v from ctx where k = 's2')]);
  oid := (j->>'order_id')::uuid; insert into ctx values ('o1', oid);
  r := order_aplicar_codigo(oid, 'mitad91');
  if (select total from orders where id = oid) <> 200 or (r->>'descuento')::numeric <> 200 then raise exception 'FALLO T1: total %', (select total from orders where id = oid); end if;
  begin perform order_aplicar_codigo(oid, 'MITAD91'); raise exception 'FALLO T1: dos códigos';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000009b4');
  begin perform order_aplicar_codigo(oid, 'MITAD91'); raise exception 'FALLO T1: ajeno aplicó código';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  perform pg_temp.as_root();
end $$;

-- T2: cortesía con motivo: queda en $0.
do $$ declare f uuid := (select v from ctx where k = 'f'); j json; oid uuid; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000009b2');
  j := admin_create_seated_order(f, 'Invitada Prensa', '5522222222', array[(select v from ctx where k = 's3')]);
  oid := (j->>'order_id')::uuid; insert into ctx values ('o2', oid);
  begin perform order_cortesia(oid, '  '); raise exception 'FALLO T2: sin motivo';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  perform order_cortesia(oid, 'Prensa: Diario de Querétaro');
  perform pg_temp.as_root();
  if (select total || '|' || metodo_pago || '|' || motivo from orders where id = oid) <> '0.00|cortesia|Prensa: Diario de Querétaro' then
    raise exception 'FALLO T2: %', (select total || '|' || metodo_pago from orders where id = oid); end if;
  if not exists (select 1 from audit_log where tabla = 'orders' and accion = 'cortesia' and registro_id = oid::text) then raise exception 'FALLO T2: bitácora'; end if;
end $$;

-- T3: corte de caja por cajero y método; lo cancelado aparte.
do $$ declare c json; o1 uuid := (select v from ctx where k = 'o1'); begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000009b2');
  perform order_set_pago(o1, 'efectivo', null);
  perform admin_cancel_ticket((select id from tickets where order_id = o1 order by created_at, id limit 1), 'Cambio');
  c := corte_caja('showman', hoy_mx(), hoy_mx());
  perform pg_temp.as_root();
  if not exists (select 1 from json_array_elements(c->'ventas') v where v->>'cajero' = 'Caja Uno' and v->>'metodo' = 'efectivo' and (v->>'total')::numeric = 100) then
    raise exception 'FALLO T3: ventas %', c->'ventas'; end if;
  if not exists (select 1 from json_array_elements(c->'ventas') v where v->>'metodo' = 'cortesia' and (v->>'total')::numeric = 0) then raise exception 'FALLO T3: cortesía'; end if;
  if not exists (select 1 from json_array_elements(c->'cancelados') v where v->>'cajero' = 'Caja Uno' and (v->>'monto')::numeric = 100) then
    raise exception 'FALLO T3: cancelados %', c->'cancelados'; end if;
end $$;

-- T4: puerta: contador, búsqueda por nombre, deshacer; otra persona no.
do $$ declare f uuid := (select v from ctx where k = 'f'); c json; tk uuid; qr uuid; n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000009b3');
  c := puerta_conteo(f);
  if (c->>'vendidos')::int <> 2 or (c->>'entraron')::int <> 0 then raise exception 'FALLO T4: conteo %', c; end if;
  select ticket_id, qr_token into tk, qr from puerta_lista(f, 'invitada');
  if tk is null then raise exception 'FALLO T4: no encontró por nombre'; end if;
  select count(*) into n from puerta_lista(f, null);
  if n <> 2 then raise exception 'FALLO T4: lista %', n; end if;
  perform check_in_ticket(qr::text, f);
  if (puerta_conteo(f)->>'entraron')::int <> 1 then raise exception 'FALLO T4: no contó la entrada'; end if;
  perform puerta_deshacer(tk);
  if (puerta_conteo(f)->>'entraron')::int <> 0 then raise exception 'FALLO T4: no deshizo'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000009b4');
  begin perform puerta_conteo(f); raise exception 'FALLO T4: ajeno vio la puerta';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  perform pg_temp.as_root();
end $$;

-- T5: cambio de fecha: avisa a quien compró en línea y vuelve a programar el recordatorio.
do $$ declare f uuid := (select v from ctx where k = 'f'); j json; oid uuid; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000009b1');
  j := create_seated_ticket_order(f, 'Compradora', '5533333333', array[(select v from ctx where k = 's4')]);
  oid := (j->>'order_id')::uuid; insert into ctx values ('o3', oid);
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000009b2');
  perform approve_order(oid, 'transferencia', null);
  perform pg_temp.as_root();
  update orders set aviso_funcion_at = now() where id = oid;
  update performances set starts_at = starts_at + interval '1 day' where id = f;
  if not exists (select 1 from notifications where user_id = '00000000-0000-0000-0000-0000000009b1' and titulo = 'Cambió la fecha de tu función') then
    raise exception 'FALLO T5: sin aviso'; end if;
  if (select aviso_funcion_at from orders where id = oid) is not null then raise exception 'FALLO T5: recordatorio'; end if;
end $$;

-- T6: cancelar la función: apartados cancelados, aviso de reembolso, no se vende más.
do $$ declare f uuid := (select v from ctx where k = 'f'); j json; pend uuid; r json; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000009b1');
  j := create_seated_ticket_order(f, 'Compradora', '5533333333', array[(select v from ctx where k = 's5')]);
  pend := (j->>'order_id')::uuid;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000009b3');
  begin perform funcion_cancelar(f, 'Lluvia'); raise exception 'FALLO T6: puerta canceló';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000009b2');
  r := funcion_cancelar(f, 'Lluvia fuerte');
  if (r->>'apartados_cancelados')::int <> 1 then raise exception 'FALLO T6: %', r; end if;
  begin perform admin_create_seated_order(f, 'Tarde', '5544444444', array[(select v from ctx where k = 's1')]); raise exception 'FALLO T6: vendió cancelada';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  perform pg_temp.as_root();
  if (select status from orders where id = pend) <> 'rechazado' then raise exception 'FALLO T6: apartado sigue'; end if;
  if not exists (select 1 from notifications where user_id = '00000000-0000-0000-0000-0000000009b1' and titulo = 'Se canceló tu función' and detalle like '%reembolso%') then
    raise exception 'FALLO T6: sin aviso de reembolso'; end if;
  begin update performances set on_sale = true where id = f; raise exception 'FALLO T6: reabrió';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
end $$;

select 'OK 0091';
