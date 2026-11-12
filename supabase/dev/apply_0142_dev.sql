-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV" (la base de darfproductions.com).
-- 0142: pasar boletos a otra persona desde Mi cuenta (por correo, con liga para aceptar). Los boletos aceptados pasan a
-- una orden nueva a nombre de quien los recibe, con QR nuevos; la orden original conserva su pago. No cambia ningún
-- dato existente: solo agrega una tabla, una columna y funciones.
-- Se puede correr más de una vez. Si la base no es DEV, aborta.
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
  if to_regclass('public.production_faq') is null then
    raise exception 'ABORTADO: primero corre el script de 0141.';
  end if;
end $$;
-- 0142 · Pasar boletos a otra persona (Diego 2026-11-12, opción 1).
--   El comprador elige qué boletos de una orden pagada le pasa a alguien (por correo). A esa persona le llega aviso si ya
--   tiene cuenta, y en todo caso una liga con un token que acepta desde su cuenta. Al aceptar, los boletos se mueven a
--   una orden nueva a su nombre (misma función, mismo método y fecha de pago, para que los reportes no cambien) con
--   QR nuevos: los PDF y pases viejos dejan de valer. Solo boletos pagados, sin usar y antes de que empiece la función.
--   Queda en la bitácora de ventas. La orden nueva marca de dónde viene (orders.traspaso_de).

create table if not exists ticket_transfers (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  from_user uuid not null references auth.users(id) on delete cascade,
  ticket_ids uuid[] not null check (cardinality(ticket_ids) between 1 and 20),
  to_email text not null check (length(to_email) between 5 and 200),
  to_user uuid references auth.users(id) on delete set null,
  token uuid not null unique default gen_random_uuid(),
  mensaje text check (length(mensaje) <= 300),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aceptada', 'cancelada')),
  new_order_id uuid references orders(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists ticket_transfers_order_idx on ticket_transfers(order_id);
create index if not exists ticket_transfers_to_idx on ticket_transfers(to_user);
alter table ticket_transfers enable row level security;
drop policy if exists ticket_transfers_mine on ticket_transfers;
create policy ticket_transfers_mine on ticket_transfers for select to authenticated
  using (from_user = auth.uid() or to_user = auth.uid()
         or has_perm(performance_production((select o.performance_id from orders o where o.id = order_id)), 'ventas.ver'));

alter table orders add column if not exists traspaso_de uuid references orders(id) on delete set null;

-- Cuenta con ese correo, si existe (para avisar y para que solo ella acepte).
create or replace function _user_by_email(p text) returns uuid
language sql stable security definer set search_path = public as $$
  select id from auth.users where lower(email) = lower(btrim(coalesce(p, ''))) and deleted_at is null order by created_at limit 1
$$;
revoke all on function _user_by_email(text) from public, anon, authenticated;

/** Etiqueta de un boleto: asiento o "General · zona". */
create or replace function _ticket_etiqueta(t tickets) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select s.seat_label from seats s where s.id = t.seat_id),
                  (select 'General · ' || pc.nombre from price_categories pc where pc.id = t.price_category_id), 'Admisión general')
$$;

-- El comprador pasa boletos de su orden.
create or replace function ticket_transfer_create(p_order uuid, p_tickets uuid[], p_email text, p_mensaje text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o orders%rowtype; pf performances%rowtype; v_to uuid; v_email text := lower(btrim(coalesce(p_email, ''))); v_id uuid; v_token uuid; n int; pid text;
begin
  if auth.uid() is null then raise exception 'Necesitas iniciar sesión.'; end if;
  select * into o from orders where id = p_order for update;
  if not found or o.buyer_user_id is distinct from auth.uid() then raise exception 'Esa orden no es tuya.'; end if;
  if o.status <> 'aprobado' then raise exception 'Solo se pueden pasar boletos de una orden pagada.'; end if;
  select * into pf from performances where id = o.performance_id;
  if pf.cancelada_at is not null then raise exception 'Esta función se canceló.'; end if;
  if pf.starts_at <= now() then raise exception 'La función ya empezó: ya no se pueden pasar boletos.'; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Escribe un correo válido.'; end if;
  if v_email = lower((select email from auth.users where id = auth.uid())) then raise exception 'Ese es tu propio correo.'; end if;
  if coalesce(cardinality(p_tickets), 0) = 0 then raise exception 'Elige al menos un boleto.'; end if;
  select count(*) into n from tickets t where t.id = any (p_tickets) and t.order_id = o.id and t.is_active and t.checked_in_at is null;
  if n <> cardinality(p_tickets) or n <> (select count(distinct x) from unnest(p_tickets) x) then raise exception 'Alguno de esos boletos ya no se puede pasar (no es de esta orden, ya se usó o se canceló).'; end if;
  if exists (select 1 from ticket_transfers x where x.estado = 'pendiente' and x.ticket_ids && p_tickets) then
    raise exception 'Alguno de esos boletos ya está en un traspaso pendiente. Cancélalo primero.';
  end if;
  v_to := _user_by_email(v_email);
  insert into ticket_transfers (order_id, from_user, ticket_ids, to_email, to_user, mensaje)
  values (o.id, auth.uid(), p_tickets, v_email, v_to, _texto_corto(p_mensaje)) returning id, token into v_id, v_token;
  pid := pf.production_id;
  if v_to is not null then
    perform notify(array[v_to], 'boletos', display_name(auth.uid()) || ' te pasó ' || n || (case when n = 1 then ' boleto' else ' boletos' end) || ' de ' || production_name(pid),
      concat_ws(' · ', _hora_mx(pf.starts_at), 'Acéptalos en tu cuenta', _texto_corto(p_mensaje, 120)), '/cuenta/traspaso/' || v_token::text, pid);
  end if;
  perform _audit_venta('traspaso_enviado', o.id, jsonb_build_object('boletos', n, 'para', v_email, 'traspaso', v_id));
  return jsonb_build_object('id', v_id, 'token', v_token, 'con_cuenta', v_to is not null, 'boletos', n);
end $$;
revoke execute on function ticket_transfer_create(uuid, uuid[], text, text) from public, anon;
grant execute on function ticket_transfer_create(uuid, uuid[], text, text) to authenticated;

-- El comprador cancela un traspaso que nadie ha aceptado.
create or replace function ticket_transfer_cancel(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare tr ticket_transfers%rowtype;
begin
  select * into tr from ticket_transfers where id = p_id for update;
  if not found or tr.from_user is distinct from auth.uid() then raise exception 'Ese traspaso no es tuyo.'; end if;
  if tr.estado <> 'pendiente' then raise exception 'Ese traspaso ya no está pendiente.'; end if;
  update ticket_transfers set estado = 'cancelada', resolved_at = now() where id = p_id;
  perform _audit_venta('traspaso_cancelado', tr.order_id, jsonb_build_object('traspaso', p_id));
end $$;
revoke execute on function ticket_transfer_cancel(uuid) from public, anon;
grant execute on function ticket_transfer_cancel(uuid) to authenticated;

-- Lo que ve quien abre la liga (con sesión): de quién, qué obra y función, cuántos boletos, y si puede aceptar.
create or replace function ticket_transfer_info(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare tr ticket_transfers%rowtype; o orders%rowtype; pf performances%rowtype;
begin
  if auth.uid() is null then raise exception 'Necesitas iniciar sesión.'; end if;
  select * into tr from ticket_transfers where token = p_token;
  if not found then return null; end if;
  select * into o from orders where id = tr.order_id;
  select * into pf from performances where id = o.performance_id;
  return jsonb_build_object(
    'id', tr.id, 'estado', tr.estado, 'created_at', tr.created_at, 'mensaje', tr.mensaje,
    'de', display_name(tr.from_user), 'soy_quien_manda', tr.from_user = auth.uid(),
    'para_mi', tr.to_user is null or tr.to_user = auth.uid(), 'to_email', case when tr.from_user = auth.uid() then tr.to_email end,
    'obra', production_name(pf.production_id), 'production_id', pf.production_id, 'starts_at', pf.starts_at, 'venue', coalesce(pf.venue, (select venue from productions where id = pf.production_id)),
    'vencida', pf.starts_at <= now() or pf.cancelada_at is not null or o.status <> 'aprobado',
    'boletos', coalesce((select jsonb_agg(_ticket_etiqueta(t) order by _ticket_etiqueta(t)) from tickets t where t.id = any (tr.ticket_ids)), '[]'),
    'new_order_code', (select order_code from orders where id = tr.new_order_id));
end $$;
revoke execute on function ticket_transfer_info(uuid) from public, anon;
grant execute on function ticket_transfer_info(uuid) to authenticated;

-- Quien recibe acepta: los boletos pasan a una orden nueva a su nombre, con QR nuevos.
create or replace function ticket_transfer_accept(p_token uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare tr ticket_transfers%rowtype; o orders%rowtype; pf performances%rowtype; nid uuid; n int; pid text; v_tel text;
begin
  if auth.uid() is null then raise exception 'Necesitas iniciar sesión.'; end if;
  select * into tr from ticket_transfers where token = p_token for update;
  if not found then raise exception 'Esta liga no es válida.'; end if;
  if tr.estado = 'aceptada' then raise exception 'Estos boletos ya se aceptaron.'; end if;
  if tr.estado <> 'pendiente' then raise exception 'Este traspaso se canceló.'; end if;
  if tr.from_user = auth.uid() then raise exception 'Esta liga es para la persona que recibe los boletos.'; end if;
  if tr.to_user is not null and tr.to_user <> auth.uid() then raise exception 'Estos boletos son para otra cuenta (%). Entra con esa cuenta.', tr.to_email; end if;
  select * into o from orders where id = tr.order_id for update;
  if o.status <> 'aprobado' then raise exception 'La orden original ya no está pagada.'; end if;
  select * into pf from performances where id = o.performance_id;
  if pf.cancelada_at is not null then raise exception 'Esta función se canceló.'; end if;
  if pf.starts_at <= now() then raise exception 'La función ya empezó: el traspaso venció.'; end if;
  select count(*) into n from tickets t where t.id = any (tr.ticket_ids) and t.order_id = o.id and t.is_active and t.checked_in_at is null;
  if n <> cardinality(tr.ticket_ids) then raise exception 'Alguno de los boletos ya no está disponible. Pídele a quien te los pasó que lo revise.'; end if;
  pid := pf.production_id;
  select nullif(btrim(telefono), '') into v_tel from profiles where id = auth.uid();
  insert into orders (performance_id, status, buyer_nombre, buyer_telefono, buyer_user_id, total, seller_id, created_by_staff_id, approved_by, approved_at,
                      metodo_pago, referencia, traspaso_de)
  values (o.performance_id, 'aprobado', display_name(auth.uid()), coalesce(v_tel, '—'), auth.uid(), 0,
          case when o.seller_id is not null and seller_active_in(o.seller_id, pid) then o.seller_id end, o.created_by_staff_id, o.approved_by, coalesce(o.approved_at, now()),
          o.metodo_pago, left('Traspaso de ' || o.order_code, 80), o.id)
  returning id into nid;
  -- QR nuevos: los PDF y pases que ya tenía quien los pasó dejan de valer.
  update tickets set qr_token = gen_random_uuid(), order_id = nid where id = any (tr.ticket_ids);
  update ticket_transfers set estado = 'aceptada', to_user = auth.uid(), new_order_id = nid, resolved_at = now() where id = tr.id;
  perform notify(array[tr.from_user], 'boletos', display_name(auth.uid()) || ' ya tiene tus boletos',
    concat_ws(' · ', production_name(pid), _hora_mx(pf.starts_at), n || (case when n = 1 then ' boleto' else ' boletos' end)), '/cuenta#o-' || o.order_code, pid);
  perform _audit_venta('traspaso_aceptado', o.id, jsonb_build_object('a', nid, 'boletos', n, 'traspaso', tr.id));
  return nid;
end $$;
revoke execute on function ticket_transfer_accept(uuid) from public, anon;
grant execute on function ticket_transfer_accept(uuid) to authenticated;

-- Mis traspasos (los que mandé y los que recibí), con nombres y sin correos ajenos.
create or replace function mis_traspasos() returns table (
  id uuid, order_id uuid, new_order_id uuid, estado text, token uuid, created_at timestamptz, resolved_at timestamptz,
  direccion text, to_email text, to_nombre text, from_nombre text, boletos int, etiquetas text[], mensaje text)
language sql stable security definer set search_path = public as $$
  select x.id, x.order_id, x.new_order_id, x.estado, x.token, x.created_at, x.resolved_at,
         case when x.from_user = auth.uid() then 'enviado' else 'recibido' end,
         case when x.from_user = auth.uid() then x.to_email end,
         case when x.to_user is not null then display_name(x.to_user) end,
         display_name(x.from_user), cardinality(x.ticket_ids),
         (select array_agg(_ticket_etiqueta(t) order by _ticket_etiqueta(t)) from tickets t where t.id = any (x.ticket_ids)), x.mensaje
    from ticket_transfers x
   where auth.uid() is not null and (x.from_user = auth.uid() or x.to_user = auth.uid())
   order by x.created_at desc
$$;
revoke execute on function mis_traspasos() from public, anon;
grant execute on function mis_traspasos() to authenticated;


select 'Listo 0142: pasar boletos a otra persona' as resultado;
