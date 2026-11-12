-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0142 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000142a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't142_ana@test.local'),
  ('00000000-0000-0000-0000-000000142a02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'T142_Beto@test.local'),
  ('00000000-0000-0000-0000-000000142a03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't142_caro@test.local');
update profiles set nombre = 'Ana López', telefono = '4421112233' where id = '00000000-0000-0000-0000-000000142a01';
update profiles set nombre = 'Beto Ruiz' where id = '00000000-0000-0000-0000-000000142a02';
update profiles set nombre = 'Caro Díaz' where id = '00000000-0000-0000-0000-000000142a03';

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create or replace function pg_temp.reset() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;
create or replace function pg_temp.falla(sql text, txt text) returns boolean language plpgsql as $$
begin
  execute sql;
  return false;
exception when others then
  if position(lower(txt) in lower(sqlerrm)) = 0 then raise exception 'mensaje inesperado: % (esperaba "%")', sqlerrm, txt; end if;
  return true;
end $$;

insert into productions (id, nombre, estado, venue) values ('t142_obra', 'Obra 142', 'borrador', 'Teatro 142');

do $$
declare ana text := '00000000-0000-0000-0000-000000142a01'; beto text := '00000000-0000-0000-0000-000000142a02'; caro text := '00000000-0000-0000-0000-000000142a03';
        pf uuid; o1 uuid; o2 uuid; t1 uuid; t2 uuid; t3 uuid; q1 uuid; q2 uuid; r jsonb; tr uuid; tok uuid; nid uuid; j jsonb; n int;
begin
  insert into performances (production_id, starts_at, venue) values ('t142_obra', now() + interval '10 days', 'Teatro 142') returning id into pf;
  insert into orders (performance_id, status, buyer_nombre, buyer_telefono, buyer_user_id, total, approved_at, metodo_pago) values (pf, 'aprobado', 'Ana López', '4421112233', ana::uuid, 0, now() - interval '2 days', 'transferencia') returning id into o1;
  insert into tickets (order_id, unit_price) values (o1, 300) returning id into t1;
  insert into tickets (order_id, unit_price) values (o1, 300) returning id into t2;
  insert into tickets (order_id, unit_price) values (o1, 300) returning id into t3;
  select qr_token into q1 from tickets where id = t1;
  if (select total from orders where id = o1) <> 900 then raise exception 'FALLO T0: total %', (select total from orders where id = o1); end if;

  -- T1: solo el comprador pasa boletos; correo válido y ajeno; boletos de su orden.
  perform pg_temp.as_user(caro);
  if not pg_temp.falla(format('select ticket_transfer_create(%L, %L, %L)', o1, array[t1], 'x@y.com'), 'no es tuya') then raise exception 'FALLO T1a'; end if;
  perform pg_temp.reset();
  perform pg_temp.as_user(ana);
  if not pg_temp.falla(format('select ticket_transfer_create(%L, %L, %L)', o1, array[t1], 'sin-arroba'), 'correo válido') then raise exception 'FALLO T1b'; end if;
  if not pg_temp.falla(format('select ticket_transfer_create(%L, %L, %L)', o1, array[t1], 'T142_ANA@test.local'), 'tu propio correo') then raise exception 'FALLO T1c'; end if;
  if not pg_temp.falla(format('select ticket_transfer_create(%L, %L, %L)', o1, '{}'::uuid[], 'b@b.com'), 'al menos un boleto') then raise exception 'FALLO T1d'; end if;
  delete from notifications where production_id = 't142_obra';
  r := ticket_transfer_create(o1, array[t1, t2], '  t142_beto@TEST.local ', 'Para ti y tu mamá');
  tr := (r->>'id')::uuid; tok := (r->>'token')::uuid;
  if not (r->>'con_cuenta')::boolean or (r->>'boletos')::int <> 2 then raise exception 'FALLO T1e: %', r; end if;
  if (select to_user from ticket_transfers where id = tr) <> beto::uuid then raise exception 'FALLO T1f: no ligó la cuenta por correo'; end if;
  -- El mismo boleto no se puede volver a pasar mientras está pendiente.
  if not pg_temp.falla(format('select ticket_transfer_create(%L, %L, %L)', o1, array[t2, t3], 'otro@test.local'), 'traspaso pendiente') then raise exception 'FALLO T1g'; end if;
  perform pg_temp.reset();
  -- Aviso solo a Beto, con la liga.
  if (select count(*) from notifications where production_id = 't142_obra') <> 1 then raise exception 'FALLO T1h'; end if;
  if (select user_id from notifications where production_id = 't142_obra') <> beto::uuid then raise exception 'FALLO T1i'; end if;
  if (select href from notifications where production_id = 't142_obra') <> '/cuenta/traspaso/' || tok::text then raise exception 'FALLO T1j'; end if;
  if (select titulo from notifications where production_id = 't142_obra') not like 'Ana López te pasó 2 boletos de Obra 142' then raise exception 'FALLO T1k: %', (select titulo from notifications where production_id = 't142_obra'); end if;

  -- T2: la liga la ve quien entra; Caro no puede aceptar (es para la cuenta de Beto); Ana tampoco.
  perform pg_temp.as_user(caro);
  j := ticket_transfer_info(tok);
  if (j->>'de') <> 'Ana López' or (j->>'para_mi')::boolean or jsonb_array_length(j->'boletos') <> 2 or (j->>'to_email') is not null then raise exception 'FALLO T2a: %', j; end if;
  if not pg_temp.falla(format('select ticket_transfer_accept(%L)', tok), 'otra cuenta') then raise exception 'FALLO T2b'; end if;
  perform pg_temp.reset();
  perform pg_temp.as_user(ana);
  if not pg_temp.falla(format('select ticket_transfer_accept(%L)', tok), 'persona que recibe') then raise exception 'FALLO T2c'; end if;
  perform pg_temp.reset();

  -- T3: Beto acepta: orden nueva a su nombre con los 2 boletos y QR nuevos; la de Ana se queda con 1 (300); aviso a Ana.
  delete from notifications where production_id = 't142_obra';
  perform pg_temp.as_user(beto);
  j := ticket_transfer_info(tok);
  if not (j->>'para_mi')::boolean then raise exception 'FALLO T3a'; end if;
  nid := ticket_transfer_accept(tok);
  if not pg_temp.falla(format('select ticket_transfer_accept(%L)', tok), 'ya se aceptaron') then raise exception 'FALLO T3b'; end if;
  -- Beto ve sus boletos (RLS) y Ana ya no.
  if (select count(*) from tickets where order_id = nid) <> 2 then raise exception 'FALLO T3c'; end if;
  if (select count(*) from orders where id = nid) <> 1 then raise exception 'FALLO T3d'; end if;
  perform pg_temp.reset();
  perform pg_temp.as_user(ana);
  if (select count(*) from tickets where id in (t1, t2)) <> 0 then raise exception 'FALLO T3e: Ana sigue viendo los boletos'; end if;
  if (select count(*) from tickets where id = t3) <> 1 then raise exception 'FALLO T3f'; end if;
  perform pg_temp.reset();
  select qr_token into q2 from tickets where id = t1;
  if q1 = q2 then raise exception 'FALLO T3g: el QR viejo sigue valiendo'; end if;
  if (select total from orders where id = o1) <> 300 or (select total from orders where id = nid) <> 600 then raise exception 'FALLO T3h: % / %', (select total from orders where id = o1), (select total from orders where id = nid); end if;
  if (select buyer_user_id from orders where id = nid) <> beto::uuid or (select traspaso_de from orders where id = nid) <> o1 then raise exception 'FALLO T3i'; end if;
  if (select metodo_pago from orders where id = nid) <> 'transferencia' or (select approved_at from orders where id = nid) <> (select approved_at from orders where id = o1) then raise exception 'FALLO T3j'; end if;
  if (select buyer_telefono from orders where id = nid) <> '—' or (select buyer_nombre from orders where id = nid) <> 'Beto Ruiz' then raise exception 'FALLO T3k'; end if;
  if (select estado from ticket_transfers where id = tr) <> 'aceptada' or (select new_order_id from ticket_transfers where id = tr) <> nid then raise exception 'FALLO T3l'; end if;
  if (select count(*) from notifications where production_id = 't142_obra' and user_id = ana::uuid and titulo = 'Beto Ruiz ya tiene tus boletos') <> 1 then raise exception 'FALLO T3m'; end if;
  if (select count(*) from audit_log where tabla = 'orders' and accion in ('traspaso_enviado', 'traspaso_aceptado') and registro_id = o1::text) <> 2 then raise exception 'FALLO T3n'; end if;
  -- Mis traspasos: Ana lo ve como enviado (con correo); Beto como recibido (sin correo).
  perform pg_temp.as_user(ana);
  select count(*) into n from mis_traspasos() m where m.direccion = 'enviado' and m.to_nombre = 'Beto Ruiz' and m.to_email = 't142_beto@test.local' and m.boletos = 2;
  if n <> 1 then raise exception 'FALLO T3o'; end if;
  perform pg_temp.reset();
  perform pg_temp.as_user(beto);
  select count(*) into n from mis_traspasos() m where m.direccion = 'recibido' and m.from_nombre = 'Ana López' and m.to_email is null;
  if n <> 1 then raise exception 'FALLO T3p'; end if;
  perform pg_temp.reset();

  -- T4: un boleto usado o de una función que ya empezó no se pasa; cancelar un traspaso pendiente.
  perform pg_temp.as_user(ana);
  r := ticket_transfer_create(o1, array[t3], 'nadie@test.local');
  tr := (r->>'id')::uuid; tok := (r->>'token')::uuid;
  if (r->>'con_cuenta')::boolean then raise exception 'FALLO T4a'; end if;
  perform ticket_transfer_cancel(tr);
  if (select estado from ticket_transfers where id = tr) <> 'cancelada' then raise exception 'FALLO T4b'; end if;
  perform pg_temp.reset();
  perform pg_temp.as_user(caro);
  if not pg_temp.falla(format('select ticket_transfer_accept(%L)', tok), 'se canceló') then raise exception 'FALLO T4c'; end if;
  perform pg_temp.reset();
  update tickets set checked_in_at = now() where id = t3;
  perform pg_temp.as_user(ana);
  if not pg_temp.falla(format('select ticket_transfer_create(%L, %L, %L)', o1, array[t3], 'nadie@test.local'), 'ya no se puede pasar') then raise exception 'FALLO T4d'; end if;
  perform pg_temp.reset();
  update tickets set checked_in_at = null where id = t3;
  -- Sin cuenta: cualquiera que entre con la liga puede aceptar (Caro).
  perform pg_temp.as_user(ana);
  r := ticket_transfer_create(o1, array[t3], 'nadie@test.local');
  tok := (r->>'token')::uuid;
  perform pg_temp.reset();
  update performances set starts_at = now() - interval '1 hour' where id = pf;
  perform pg_temp.as_user(caro);
  if not pg_temp.falla(format('select ticket_transfer_accept(%L)', tok), 'ya empezó') then raise exception 'FALLO T4e'; end if;
  perform pg_temp.reset();
  update performances set starts_at = now() + interval '10 days' where id = pf;
  perform pg_temp.as_user(caro);
  o2 := ticket_transfer_accept(tok);
  if (select buyer_user_id from orders where id = o2) <> caro::uuid then raise exception 'FALLO T4f'; end if;
  perform pg_temp.reset();
  if (select total from orders where id = o1) <> 0 then raise exception 'FALLO T4g'; end if;
  -- Nadie ajeno ve los traspasos.
  perform pg_temp.as_user(beto);
  if (select count(*) from ticket_transfers) <> 1 then raise exception 'FALLO T4h: %', (select count(*) from ticket_transfers); end if;
  perform pg_temp.reset();

  raise notice '0142 OK';
end $$;
