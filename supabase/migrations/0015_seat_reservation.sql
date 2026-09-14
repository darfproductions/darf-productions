-- 0015: seat reservation
--
-- Creates the atomic ticket-order flow for numbered seats.
--
-- The client sends:
--   performance_id
--   buyer name
--   buyer phone
--   selected seat IDs
--
-- The database calculates:
--   availability
--   price category
--   price
--   quantity
--   total
--
-- The client never supplies prices or totals.


-- ============================================================
-- 1. CREATE ORDER WITH SELECTED SEATS
-- ============================================================

create or replace function create_seated_ticket_order(
  target_performance_id uuid,
  target_buyer_nombre text,
  target_buyer_telefono text,
  target_seat_ids uuid[]
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_performance_production_id text;
  v_order_id uuid;
  v_order_code text;
  v_buyer_user_id uuid;
  v_quantity integer;
  v_total numeric(10,2);
  v_seat_id uuid;
  v_price numeric(10,2);
  v_price_category_id uuid;
  v_price_category_name text;
begin

  -- ==========================================================
  -- BASIC VALIDATION
  -- ==========================================================

  if target_performance_id is null then
    raise exception 'La función es obligatoria';
  end if;

  if target_buyer_nombre is null
     or btrim(target_buyer_nombre) = '' then
    raise exception 'El nombre del comprador es obligatorio';
  end if;

  if target_buyer_telefono is null
     or btrim(target_buyer_telefono) = '' then
    raise exception 'El teléfono del comprador es obligatorio';
  end if;

  if target_seat_ids is null
     or cardinality(target_seat_ids) < 1 then
    raise exception 'Debes seleccionar al menos un asiento';
  end if;

  if cardinality(target_seat_ids) > 20 then
    raise exception 'No puedes seleccionar más de 20 asientos';
  end if;


  -- ==========================================================
  -- PERFORMANCE VALIDATION
  -- ==========================================================

  select pf.production_id
  into v_performance_production_id
  from performances pf
  join productions pr
    on pr.id = pf.production_id
  where pf.id = target_performance_id
    and pf.on_sale = true
    and pr.on_sale = true;

  if not found then
    raise exception 'La función no está disponible para venta';
  end if;


  -- ==========================================================
  -- DUPLICATE SEAT VALIDATION
  -- ==========================================================

  if (
    select count(*)
    from unnest(target_seat_ids) as s
  ) <> (
    select count(distinct s)
    from unnest(target_seat_ids) as s
  ) then
    raise exception 'No puedes seleccionar el mismo asiento más de una vez';
  end if;


  -- ==========================================================
  -- SEAT VALIDATION
  -- ==========================================================

  for v_seat_id in
    select unnest(target_seat_ids)
  loop

    -- Lock the seat row so concurrent reservations are serialized.
    perform 1
    from seats
    where id = v_seat_id
    for update;

    if not found then
      raise exception 'Uno de los asientos seleccionados no existe';
    end if;


    -- Seat must belong to the same production.
    if not exists (
      select 1
      from seats s
      where s.id = v_seat_id
        and s.production_id = v_performance_production_id
    ) then
      raise exception 'Uno de los asientos no pertenece a esta producción';
    end if;


    -- Seat must be active.
    if not exists (
      select 1
      from seats s
      where s.id = v_seat_id
        and s.is_active = true
    ) then
      raise exception 'Uno de los asientos seleccionados no está disponible';
    end if;


    -- Seat cannot be blocked for this performance.
    if exists (
      select 1
      from blocked_seats bs
      where bs.performance_id = target_performance_id
        and bs.seat_id = v_seat_id
    ) then
      raise exception 'Uno de los asientos seleccionados está bloqueado';
    end if;


    -- Seat cannot already have an active ticket.
    if exists (
      select 1
      from tickets t
      where t.performance_id = target_performance_id
        and t.seat_id = v_seat_id
        and t.is_active = true
    ) then
      raise exception 'Uno de los asientos seleccionados ya no está disponible';
    end if;


    -- Seat must have a price category.
    select s.price_category_id
    into v_price_category_id
    from seats s
    where s.id = v_seat_id;

    if v_price_category_id is null then
      raise exception 'Uno de los asientos no tiene categoría de precio configurada';
    end if;


    -- Obtain the price for THIS performance.
    select ppc.price, pc.nombre
    into v_price, v_price_category_name
    from performance_price_categories ppc
    join price_categories pc
      on pc.id = ppc.price_category_id
    where ppc.performance_id = target_performance_id
      and ppc.price_category_id = v_price_category_id
      and pc.is_active = true;

    if not found then
      raise exception
        'No existe un precio configurado para uno de los asientos seleccionados';
    end if;

  end loop;


  -- ==========================================================
  -- CREATE ORDER
  -- ==========================================================

  v_quantity := cardinality(target_seat_ids);
  v_buyer_user_id := auth.uid();

  select coalesce(sum(ppc.price), 0)
  into v_total
  from unnest(target_seat_ids) as selected_seat_id
  join seats s
    on s.id = selected_seat_id
  join performance_price_categories ppc
    on ppc.performance_id = target_performance_id
    and ppc.price_category_id = s.price_category_id;


  insert into orders (
    performance_id,
    status,
    buyer_nombre,
    buyer_telefono,
    buyer_user_id,
    total
  )
  values (
    target_performance_id,
    'pendiente',
    btrim(target_buyer_nombre),
    btrim(target_buyer_telefono),
    v_buyer_user_id,
    v_total
  )
  returning id, order_code
  into v_order_id, v_order_code;


  -- ==========================================================
  -- CREATE TICKETS
  -- ==========================================================

  insert into tickets (
    order_id,
    performance_id,
    seat_id,
    unit_price,
    is_active
  )
  select
    v_order_id,
    target_performance_id,
    s.id,
    ppc.price,
    true
  from unnest(target_seat_ids) as selected_seat_id
  join seats s
    on s.id = selected_seat_id
  join performance_price_categories ppc
    on ppc.performance_id = target_performance_id
    and ppc.price_category_id = s.price_category_id;


  -- ==========================================================
  -- RETURN ORDER DATA
  -- ==========================================================

  return json_build_object(
    'order_id', v_order_id,
    'order_code', v_order_code,
    'status', 'pendiente',
    'quantity', v_quantity,
    'total', v_total
  );

end;
$$;


-- ============================================================
-- 2. FUNCTION PRIVILEGES
-- ============================================================

grant execute on function create_seated_ticket_order(
  uuid,
  text,
  text,
  uuid[]
)
to anon, authenticated;

revoke execute on function create_seated_ticket_order(
  uuid,
  text,
  text,
  uuid[]
)
from public;
-- ============================================================
-- 3. DISABLE LEGACY ORDER CREATION
-- ============================================================

revoke execute on function create_ticket_order(
  uuid,
  text,
  text,
  integer
)
from anon, authenticated;
