-- 0023: public checkout driven by performances.on_sale
-- 1) get_taken_seats: public read of which seats are unavailable (sold, pending
--    or blocked) for a function. Returns ONLY seat ids: no buyer data leaks.
-- 2) create_seated_ticket_order v2:
--    - requires a logged-in user
--    - on sale = the FUNCTION is on_sale, has a date and its production is not
--      concluded (productions.on_sale is no longer required)
--    - optional seller code
--    - max 3 pending orders per user (pending orders reserve their seats until
--      an admin approves or rejects them)
--    - returns seat labels for the WhatsApp message

-- ============================================================
-- 1. get_taken_seats
-- ============================================================
create or replace function get_taken_seats(target_performance_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select t.seat_id
  from tickets t
  where t.performance_id = target_performance_id
    and t.is_active
    and t.seat_id is not null
  union
  select b.seat_id
  from blocked_seats b
  where b.performance_id = target_performance_id;
$$;

revoke execute on function get_taken_seats(uuid) from public;
grant execute on function get_taken_seats(uuid) to anon, authenticated;

-- ============================================================
-- 2. create_seated_ticket_order v2 (replaces the 4-argument version)
-- ============================================================
drop function if exists create_seated_ticket_order(uuid, text, text, uuid[]);

create or replace function create_seated_ticket_order(
  target_performance_id uuid,
  target_buyer_nombre text,
  target_buyer_telefono text,
  target_seat_ids uuid[],
  target_seller_codigo text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_production_id text;
  v_seat_id uuid;
  v_price_category_id uuid;
  v_order_id uuid;
  v_order_code text;
  v_total numeric(10,2);
  v_seller_id uuid;
  v_labels json;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para comprar';
  end if;

  if target_performance_id is null then raise exception 'La función es obligatoria'; end if;
  if target_buyer_nombre is null or btrim(target_buyer_nombre) = '' then
    raise exception 'El nombre del comprador es obligatorio'; end if;
  if target_buyer_telefono is null or btrim(target_buyer_telefono) = '' then
    raise exception 'El teléfono del comprador es obligatorio'; end if;
  if target_seat_ids is null or cardinality(target_seat_ids) < 1 then
    raise exception 'Debes seleccionar al menos un asiento'; end if;
  if cardinality(target_seat_ids) > 20 then
    raise exception 'No puedes seleccionar más de 20 asientos'; end if;
  if (select count(*) from unnest(target_seat_ids) s)
     <> (select count(distinct s) from unnest(target_seat_ids) s) then
    raise exception 'No puedes seleccionar el mismo asiento más de una vez'; end if;

  -- The function itself must be on sale (and dated); its production not concluded.
  select pf.production_id into v_production_id
  from performances pf
  join productions pr on pr.id = pf.production_id
  where pf.id = target_performance_id
    and pf.on_sale
    and pf.starts_at is not null
    and not pr.concluded;
  if not found then
    raise exception 'La función no está disponible para venta';
  end if;

  -- Pending orders reserve seats: cap them so nobody can lock the whole house.
  if (select count(*) from orders o
      where o.buyer_user_id = auth.uid() and o.status = 'pendiente') >= 3 then
    raise exception 'Ya tienes 3 solicitudes pendientes de pago; espera a que se aprueben o se cancelen';
  end if;

  if target_seller_codigo is not null and btrim(target_seller_codigo) <> '' then
    select id into v_seller_id from sellers
    where codigo = upper(btrim(target_seller_codigo)) and active;
    if not found then raise exception 'El código de vendedor no existe'; end if;
  end if;

  for v_seat_id in select unnest(target_seat_ids) loop
    perform 1 from seats where id = v_seat_id for update;
    if not found then raise exception 'Uno de los asientos seleccionados no existe'; end if;

    if not exists (select 1 from seats s where s.id = v_seat_id and s.production_id = v_production_id) then
      raise exception 'Uno de los asientos no pertenece a esta producción'; end if;
    if not exists (select 1 from seats s where s.id = v_seat_id and s.is_active) then
      raise exception 'Uno de los asientos seleccionados no está disponible'; end if;
    if exists (select 1 from blocked_seats bs where bs.performance_id = target_performance_id and bs.seat_id = v_seat_id) then
      raise exception 'Uno de los asientos seleccionados está bloqueado'; end if;
    if exists (select 1 from tickets t where t.performance_id = target_performance_id and t.seat_id = v_seat_id and t.is_active) then
      raise exception 'Uno de los asientos seleccionados ya no está disponible'; end if;

    select s.price_category_id into v_price_category_id from seats s where s.id = v_seat_id;
    if v_price_category_id is null then
      raise exception 'Uno de los asientos no tiene categoría de precio configurada'; end if;
    if not exists (
      select 1 from performance_price_categories ppc
      join price_categories pc on pc.id = ppc.price_category_id
      where ppc.performance_id = target_performance_id
        and ppc.price_category_id = v_price_category_id and pc.is_active
    ) then
      raise exception 'No existe un precio configurado para uno de los asientos seleccionados';
    end if;
  end loop;

  select coalesce(sum(ppc.price), 0) into v_total
  from unnest(target_seat_ids) sid
  join seats s on s.id = sid
  join performance_price_categories ppc
    on ppc.performance_id = target_performance_id
   and ppc.price_category_id = s.price_category_id;

  insert into orders (performance_id, status, buyer_nombre, buyer_telefono,
                      buyer_user_id, total, seller_id)
  values (target_performance_id, 'pendiente', btrim(target_buyer_nombre),
          btrim(target_buyer_telefono), auth.uid(), v_total, v_seller_id)
  returning id, order_code into v_order_id, v_order_code;

  insert into tickets (order_id, performance_id, seat_id, unit_price, is_active)
  select v_order_id, target_performance_id, s.id, ppc.price, true
  from unnest(target_seat_ids) sid
  join seats s on s.id = sid
  join performance_price_categories ppc
    on ppc.performance_id = target_performance_id
   and ppc.price_category_id = s.price_category_id;

  select json_agg(s.seat_label order by s.seat_label) into v_labels
  from seats s where s.id = any(target_seat_ids);

  return json_build_object('order_id', v_order_id, 'order_code', v_order_code,
                           'status', 'pendiente', 'quantity', cardinality(target_seat_ids),
                           'total', v_total, 'seats', v_labels);
end;
$$;

revoke execute on function create_seated_ticket_order(uuid, text, text, uuid[], text) from public, anon;
grant execute on function create_seated_ticket_order(uuid, text, text, uuid[], text) to authenticated;
