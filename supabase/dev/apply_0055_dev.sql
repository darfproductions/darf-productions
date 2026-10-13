-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV".
-- Aplica la migración 0055 (entrada general por zona con cupo). Si la base no es DEV, aborta.
begin;
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
end $$;

alter table price_categories add column cupo int check (cupo is null or cupo between 1 and 100000);
alter table performance_price_categories add column cupo int check (cupo is null or cupo between 0 and 100000);
alter table tickets add column price_category_id uuid references price_categories(id);
create index idx_tickets_general on tickets(performance_id, price_category_id) where seat_id is null and is_active;

-- Una zona general no tiene asientos.
create or replace function seats_not_in_general_zone() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.price_category_id is not null and exists (select 1 from price_categories where id = new.price_category_id and cupo is not null) then
    raise exception 'Esa zona es de entrada general (sin asientos).';
  end if;
  return new;
end $$;
create trigger seats_not_in_general_zone before insert or update of price_category_id on seats
  for each row execute function seats_not_in_general_zone();

create or replace function general_zone_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.cupo is not null and exists (select 1 from seats where price_category_id = new.id) then
    raise exception 'Esta zona tiene asientos numerados; no puede ser de entrada general.';
  end if;
  return new;
end $$;
create trigger general_zone_guard before insert or update of cupo on price_categories
  for each row execute function general_zone_guard();

-- Lugares de entrada general por función: cupo, ocupados (pendientes + aprobados) y libres.
create or replace function general_availability(target_performance_id uuid)
returns table (price_category_id uuid, nombre text, descripcion text, precio numeric, cupo int, ocupados int, libres int)
language sql stable security definer set search_path = public as $$
  select pc.id, pc.nombre, pc.descripcion, ppc.price, coalesce(ppc.cupo, pc.cupo),
         (select count(*)::int from tickets t where t.performance_id = target_performance_id and t.price_category_id = pc.id and t.seat_id is null and t.is_active),
         greatest(0, coalesce(ppc.cupo, pc.cupo) - (select count(*)::int from tickets t
           where t.performance_id = target_performance_id and t.price_category_id = pc.id and t.seat_id is null and t.is_active))
    from performance_price_categories ppc
    join price_categories pc on pc.id = ppc.price_category_id
   where ppc.performance_id = target_performance_id and pc.cupo is not null and pc.is_active
   order by ppc.price desc, pc.nombre
$$;

-- Núcleo compartido: valida, bloquea la zona, cuenta cupo y crea orden + boletos.
create or replace function _create_general_order(
  p_performance_id uuid, p_nombre text, p_telefono text, p_zone uuid, p_cantidad int,
  p_seller text, p_discount text, p_staff boolean, p_max int
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_pid text; v_price numeric(10,2); v_cupo int; v_ocupados int;
  v_seller uuid; v_dc discount_codes; v_dc_id uuid; v_percent numeric := 0;
  v_unit numeric(10,2); v_desc numeric(10,2) := 0; v_total numeric(10,2);
  v_order uuid; v_code text; v_zone_nombre text;
begin
  if p_nombre is null or btrim(p_nombre) = '' then raise exception 'El nombre del comprador es obligatorio'; end if;
  if p_telefono is null or btrim(p_telefono) = '' then raise exception 'El teléfono del comprador es obligatorio'; end if;
  if p_cantidad is null or p_cantidad < 1 then raise exception 'Elige cuántos boletos'; end if;
  if p_cantidad > p_max then raise exception 'Máximo % boletos de entrada general por compra', p_max; end if;

  select pf.production_id into v_pid from performances pf join productions pr on pr.id = pf.production_id
   where pf.id = p_performance_id and (p_staff or (pf.on_sale and pf.starts_at is not null and not pr.concluded));
  if not found then raise exception 'La función no está disponible para venta'; end if;

  -- Bloqueo de la zona: dos compras al mismo tiempo se forman en fila (sin sobreventa).
  select pc.nombre into v_zone_nombre from price_categories pc
   where pc.id = p_zone and pc.production_id = v_pid and pc.cupo is not null and pc.is_active for update;
  if not found then raise exception 'Esa zona de entrada general no existe en esta obra'; end if;
  select ppc.price, coalesce(ppc.cupo, (select cupo from price_categories where id = p_zone)) into v_price, v_cupo
    from performance_price_categories ppc where ppc.performance_id = p_performance_id and ppc.price_category_id = p_zone;
  if not found then raise exception 'Esa zona no tiene precio en esta función'; end if;
  select count(*) into v_ocupados from tickets t
   where t.performance_id = p_performance_id and t.price_category_id = p_zone and t.seat_id is null and t.is_active;
  if v_ocupados + p_cantidad > v_cupo then
    if v_cupo - v_ocupados <= 0 then raise exception 'La zona % ya está llena', v_zone_nombre; end if;
    if v_cupo - v_ocupados = 1 then raise exception 'Solo queda 1 lugar en %', v_zone_nombre; end if;
    raise exception 'Solo quedan % lugares en %', v_cupo - v_ocupados, v_zone_nombre;
  end if;

  if not p_staff and (select count(*) from orders o where o.buyer_user_id = auth.uid() and o.status = 'pendiente') >= 3 then
    raise exception 'Ya tienes 3 solicitudes pendientes de pago; espera a que se aprueben o se cancelen';
  end if;

  if p_seller is not null and btrim(p_seller) <> '' then
    select id into v_seller from sellers where codigo = upper(btrim(p_seller)) and active;
    if not found then raise exception 'El código de vendedor no existe'; end if;
  end if;

  if not p_staff and p_discount is not null and btrim(p_discount) <> '' then
    v_dc := _resolve_discount_code(p_performance_id, v_pid, p_discount, true);
    if v_dc.max_tickets_per_order is not null and p_cantidad > v_dc.max_tickets_per_order then
      raise exception 'Este código permite máximo % boletos por compra', v_dc.max_tickets_per_order;
    end if;
    if exists (select 1 from discount_code_categories where discount_code_id = v_dc.id)
       and not exists (select 1 from discount_code_categories where discount_code_id = v_dc.id and price_category_id = p_zone) then
      raise exception 'El código de descuento no aplica a esta zona';
    end if;
    v_dc_id := v_dc.id;
    v_percent := v_dc.percent;
  end if;

  v_unit := v_price - round(v_price * v_percent / 100, 2);
  v_desc := (v_price - v_unit) * p_cantidad;
  v_total := v_unit * p_cantidad;

  insert into orders (performance_id, status, buyer_nombre, buyer_telefono, buyer_user_id, total, seller_id,
                      created_by_staff_id, approved_by, approved_at, discount_code_id, discount_codigo, discount_amount)
  values (p_performance_id, case when p_staff then 'aprobado'::order_status else 'pendiente'::order_status end,
          btrim(p_nombre), btrim(p_telefono), case when p_staff then null else auth.uid() end, v_total, v_seller,
          case when p_staff then auth.uid() end, case when p_staff then auth.uid() end, case when p_staff then now() end,
          v_dc_id, case when v_dc_id is not null then v_dc.codigo end, v_desc)
  returning id, order_code into v_order, v_code;

  insert into tickets (order_id, performance_id, seat_id, price_category_id, unit_price, is_active)
  select v_order, p_performance_id, null, p_zone, v_unit, true from generate_series(1, p_cantidad);

  return json_build_object('order_id', v_order, 'order_code', v_code, 'status', case when p_staff then 'aprobado' else 'pendiente' end,
                           'quantity', p_cantidad, 'total', v_total, 'discount_amount', v_desc,
                           'discount_codigo', case when v_dc_id is not null then v_dc.codigo end,
                           'seats', (select json_agg('General · ' || v_zone_nombre) from generate_series(1, p_cantidad)),
                           'tickets', (select json_agg(json_build_object('seat_label', 'General · ' || v_zone_nombre, 'qr_token', t.qr_token))
                                         from tickets t where t.order_id = v_order));
end $$;

create or replace function create_general_ticket_order(
  target_performance_id uuid, target_buyer_nombre text, target_buyer_telefono text, target_zone_id uuid,
  target_cantidad int, target_seller_codigo text default null, target_discount_code text default null
) returns json
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión para comprar'; end if;
  perform expire_due_orders((select production_id from performances where id = target_performance_id));
  return _create_general_order(target_performance_id, target_buyer_nombre, target_buyer_telefono, target_zone_id,
                               target_cantidad, target_seller_codigo, target_discount_code, false, 10);
end $$;

create or replace function admin_create_general_order(
  target_performance_id uuid, target_buyer_nombre text, target_buyer_telefono text, target_zone_id uuid,
  target_cantidad int, target_seller_codigo text default null
) returns json
language plpgsql security definer set search_path = public as $$
begin
  if not has_perm((select production_id from performances where id = target_performance_id), 'ventas.operar') then
    raise exception 'No autorizado';
  end if;
  perform expire_due_orders((select production_id from performances where id = target_performance_id));
  return _create_general_order(target_performance_id, target_buyer_nombre, target_buyer_telefono, target_zone_id,
                               target_cantidad, target_seller_codigo, null, true, 20);
end $$;

create or replace function check_in_ticket(target_qr_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid;
  v_ticket record;
  v_updated integer;
begin
  -- Si el QR existe, hace falta puerta.validar en SU obra; si no existe, basta con
  -- ser puerta en alguna obra para recibir el mensaje normal de "QR inválido".
  if not (
    is_staff()
    or exists (
      select 1 from tickets t join performances pf on pf.id = t.performance_id
       where t.qr_token::text = lower(btrim(coalesce(target_qr_token, ''))) and has_perm(pf.production_id, 'puerta.validar'))
    or (not exists (select 1 from tickets t where t.qr_token::text = lower(btrim(coalesce(target_qr_token, ''))))
        and exists (select 1 from production_members m join role_permissions rp on rp.role_id = m.role_id
                     where m.user_id = auth.uid() and rp.permission_id = 'puerta.validar'))
  ) then raise exception 'No autorizado'; end if;

  begin
    v_token := btrim(target_qr_token)::uuid;
  exception when others then
    return json_build_object('result', 'no_encontrado');
  end;

  select t.id, t.is_active, t.checked_in_at, coalesce(s.seat_label, 'General · ' || pc.nombre) as seat_label, pc.nombre as category,
         pf.starts_at, o.buyer_nombre, o.status as order_status
  into v_ticket
  from tickets t
  join orders o on o.id = t.order_id
  join performances pf on pf.id = t.performance_id
  left join seats s on s.id = t.seat_id
  left join price_categories pc on pc.id = coalesce(s.price_category_id, t.price_category_id)
  where t.qr_token = v_token;

  if not found then return json_build_object('result', 'no_encontrado'); end if;

  if not v_ticket.is_active then
    return json_build_object('result', 'cancelado', 'seat_label', v_ticket.seat_label,
                             'buyer_nombre', v_ticket.buyer_nombre);
  end if;

  -- 0035: solo entran boletos de órdenes APROBADAS (una pendiente aún no está pagada).
  if v_ticket.order_status <> 'aprobado' then
    return json_build_object('result', 'no_aprobado', 'seat_label', v_ticket.seat_label,
                             'buyer_nombre', v_ticket.buyer_nombre);
  end if;

  update tickets set checked_in_at = now(), checked_in_by = auth.uid()
  where id = v_ticket.id and is_active and checked_in_at is null;
  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    return json_build_object('result', 'ya_usado', 'seat_label', v_ticket.seat_label,
                             'buyer_nombre', v_ticket.buyer_nombre,
                             'checked_in_at', v_ticket.checked_in_at);
  end if;

  return json_build_object('result', 'ok', 'seat_label', v_ticket.seat_label,
                           'category', v_ticket.category,
                           'performance_starts_at', v_ticket.starts_at,
                           'buyer_nombre', v_ticket.buyer_nombre);
end;
$$;


revoke execute on function seats_not_in_general_zone() from public, anon, authenticated;
revoke execute on function general_zone_guard() from public, anon, authenticated;
revoke execute on function _create_general_order(uuid, text, text, uuid, int, text, text, boolean, int) from public, anon, authenticated;
revoke execute on function general_availability(uuid) from public;
grant execute on function general_availability(uuid) to anon, authenticated;
revoke execute on function create_general_ticket_order(uuid, text, text, uuid, int, text, text) from public, anon;
revoke execute on function admin_create_general_order(uuid, text, text, uuid, int, text) from public, anon;
grant execute on function create_general_ticket_order(uuid, text, text, uuid, int, text, text), admin_create_general_order(uuid, text, text, uuid, int, text) to authenticated;


insert into supabase_migrations.schema_migrations (version, name)
values ('20261012020200', '0055_general_admission') on conflict do nothing;
commit;
select 'OK: 0055 aplicada en DARF 2.0 DEV' as resultado;
