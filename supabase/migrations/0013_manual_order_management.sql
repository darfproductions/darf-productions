-- 0013: manual order management
--
-- Orders are NOT expired automatically.
-- Administrators manually approve or reject pending orders.
-- Rejecting an order releases its active tickets.


-- ============================================================
-- 1. REJECTION TIMESTAMP
-- ============================================================

alter table orders
add column if not exists rejected_at timestamptz;


-- ============================================================
-- 2. APPROVE ORDER
-- ============================================================

create or replace function approve_order(
  target_order_id uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order orders%rowtype;
begin

  if not is_staff() then
    raise exception 'No autorizado';
  end if;

  select *
  into v_order
  from orders
  where id = target_order_id
  for update;

  if not found then
    raise exception 'La orden no existe';
  end if;

  if v_order.status <> 'pendiente' then
    raise exception 'Solo se pueden aprobar órdenes pendientes';
  end if;

  update orders
  set
    status = 'aprobado',
    approved_by = auth.uid(),
    approved_at = now()
  where id = target_order_id;

  return json_build_object(
    'order_id', target_order_id,
    'status', 'aprobado'
  );

end;
$$;


-- ============================================================
-- 3. REJECT ORDER
-- ============================================================

create or replace function reject_order(
  target_order_id uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order orders%rowtype;
begin

  if not is_staff() then
    raise exception 'No autorizado';
  end if;

  select *
  into v_order
  from orders
  where id = target_order_id
  for update;

  if not found then
    raise exception 'La orden no existe';
  end if;

  if v_order.status <> 'pendiente' then
    raise exception 'Solo se pueden cancelar órdenes pendientes';
  end if;

  update orders
  set
    status = 'rechazado',
    rejected_by = auth.uid(),
    rejected_at = now()
  where id = target_order_id;

  update tickets
  set is_active = false
  where order_id = target_order_id
    and is_active = true;

  return json_build_object(
    'order_id', target_order_id,
    'status', 'rechazado'
  );

end;
$$;


-- ============================================================
-- 4. FUNCTION PERMISSIONS
-- ============================================================

grant execute on function approve_order(uuid)
to authenticated;

grant execute on function reject_order(uuid)
to authenticated;

revoke execute on function approve_order(uuid)
from anon;

revoke execute on function reject_order(uuid)
from anon;
