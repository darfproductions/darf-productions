-- 0011: ticket pricing + ticketing RPCs
--
-- This migration:
-- 1. Stores the historical unit price on every ticket.
-- 2. Rebuilds order totals from ticket.unit_price.
-- 3. Restricts buyer ticket visibility to APPROVED orders only.
-- 4. Creates a SECURITY DEFINER RPC for creating ticket orders.
--
-- Guest users are allowed.
-- Authenticated users are automatically associated with auth.uid().
-- The client never supplies the price or total.


-- ============================================================
-- 1. HISTORICAL TICKET PRICE
-- ============================================================

alter table tickets
add column if not exists unit_price numeric(10,2);

alter table tickets
alter column unit_price set not null;

alter table tickets
add constraint tickets_unit_price_nonnegative
check (unit_price >= 0);

-- Existing tickets should not exist in production yet.
-- We intentionally do NOT invent historical prices here.
-- Before any existing ticket could be used, unit_price must be set.


-- ============================================================
-- 2. REBUILD ORDER TOTAL FUNCTION
-- ============================================================

create or replace function recompute_order_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_order uuid;
  recalculated_total numeric(10,2);
begin

  -- ----------------------------------------------------------
  -- DELETE
  -- ----------------------------------------------------------

  if tg_op = 'DELETE' then

    affected_order := old.order_id;

    select coalesce(sum(unit_price), 0)
    into recalculated_total
    from tickets
    where order_id = affected_order
      and is_active;

    update orders
    set total = recalculated_total
    where id = affected_order;

    return null;

  end if;


  -- ----------------------------------------------------------
  -- UPDATE
  -- ----------------------------------------------------------

  if tg_op = 'UPDATE' then

    -- If a ticket moves between orders, recalculate the old order.
    if old.order_id is distinct from new.order_id then

      affected_order := old.order_id;

      select coalesce(sum(unit_price), 0)
      into recalculated_total
      from tickets
      where order_id = affected_order
        and is_active;

      update orders
      set total = recalculated_total
      where id = affected_order;

    end if;


    -- Recalculate the current/new order.
    affected_order := new.order_id;

    select coalesce(sum(unit_price), 0)
    into recalculated_total
    from tickets
    where order_id = affected_order
      and is_active;

    update orders
    set total = recalculated_total
    where id = affected_order;

    return null;

  end if;


  -- ----------------------------------------------------------
  -- INSERT
  -- ----------------------------------------------------------

  affected_order := new.order_id;

  select coalesce(sum(unit_price), 0)
  into recalculated_total
  from tickets
  where order_id = affected_order
    and is_active;

  update orders
  set total = recalculated_total
  where id = affected_order;

  return null;

end;
$$;


-- Recreate the trigger so the database uses the updated function.
drop trigger if exists trg_recompute_total_ins on tickets;

create trigger trg_recompute_total_ins
after insert or update or delete on tickets
for each row
execute function recompute_order_total();


-- ============================================================
-- 3. BUYER TICKET VISIBILITY
-- ============================================================

drop policy if exists "tickets_owner_read" on tickets;

create policy "tickets_owner_read"
on tickets
for select
using (
  exists (
    select 1
    from orders o
    where o.id = tickets.order_id
      and o.buyer_user_id = auth.uid()
      and o.status = 'aprobado'
  )
);


-- ============================================================
-- 4. CREATE TICKET ORDER
-- ============================================================

create or replace function create_ticket_order(
  target_performance_id uuid,
  target_buyer_nombre text,
  target_buyer_telefono text,
  target_quantity integer
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_price numeric(10,2);
  v_order_id uuid;
  v_order_code text;
  v_total numeric(10,2);
  v_buyer_user_id uuid;
  i integer;
begin

  -- ----------------------------------------------------------
  -- Basic input validation
  -- ----------------------------------------------------------

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

  if target_quantity is null
     or target_quantity < 1
     or target_quantity > 20 then
    raise exception 'La cantidad de boletos debe estar entre 1 y 20';
  end if;


  -- ----------------------------------------------------------
  -- Get performance price
  --
  -- The client never supplies the price.
  -- ----------------------------------------------------------

  select pr.price
  into v_price
  from performances pf
  join productions pr
    on pr.id = pf.production_id
  where pf.id = target_performance_id
    and pf.on_sale = true
    and pr.on_sale = true;

  if not found then
    raise exception 'La función no está disponible para venta';
  end if;


  -- ----------------------------------------------------------
  -- Calculate total SERVER-SIDE
  -- ----------------------------------------------------------

  v_total := v_price * target_quantity;


  -- ----------------------------------------------------------
  -- Identify authenticated buyer, if any
  --
  -- Anonymous caller:
  --   auth.uid() = NULL
  --
  -- Authenticated caller:
  --   auth.uid() = their user ID
  -- ----------------------------------------------------------

  v_buyer_user_id := auth.uid();


  -- ----------------------------------------------------------
  -- Create order
  --
  -- order_code is generated automatically by the existing
  -- set_order_code() trigger from migration 0009.
  -- ----------------------------------------------------------

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


  -- ----------------------------------------------------------
  -- Create individual tickets
  --
  -- No physical seat is assigned yet.
  -- unit_price freezes the price at purchase/request time.
  -- ----------------------------------------------------------

  for i in 1..target_quantity loop

    insert into tickets (
      order_id,
      performance_id,
      seat_id,
      unit_price,
      is_active
    )
    values (
      v_order_id,
      target_performance_id,
      null,
      v_price,
      true
    );

  end loop;


  -- ----------------------------------------------------------
  -- Return order information only.
  --
  -- Tickets are NOT returned here.
  -- Buyers can access them only after approval.
  -- ----------------------------------------------------------

  return json_build_object(
    'order_id', v_order_id,
    'order_code', v_order_code,
    'status', 'pendiente',
    'quantity', target_quantity,
    'total', v_total
  );

end;
$$;


-- ============================================================
-- 5. FUNCTION EXECUTION PRIVILEGES
-- ============================================================

-- Guests and authenticated users may create ticket orders.
grant execute on function create_ticket_order(
  uuid,
  text,
  text,
  integer
)
to anon, authenticated;

-- Explicitly remove execution from PUBLIC first.
-- The grants above then expose it only to the intended roles.
revoke execute on function create_ticket_order(
  uuid,
  text,
  text,
  integer
)
from public;

grant execute on function create_ticket_order(
  uuid,
  text,
  text,
  integer
)
to anon, authenticated;
