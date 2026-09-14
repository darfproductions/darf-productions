-- 0016: security hardening
--
-- Closes technical debt documented in docs/DATABASE.md as Hallazgos
-- #3, #4, #6, #7, #8. Does not alter any executed migration (0001-0015).
--
-- Summary:
--   #6/#7 — approve_order/reject_order (0013) currently authorize with
--           is_staff() and still carry the default PUBLIC EXECUTE grant.
--           Per Johann's decision, approving/rejecting orders is
--           admin-exclusive (matches orders_admin_write in 0010 and the
--           permissions matrix in supabase/docs/DESIGN.md). Switch both
--           to is_admin() and revoke EXECUTE from PUBLIC, keeping the
--           existing grant to authenticated.
--   #8      — validate_seat_price_category()/validate_performance_price_
--           category() (0014) are trigger-only functions but still carry
--           the default PUBLIC EXECUTE grant (flagged by Supabase's own
--           security advisor). Revoke from PUBLIC for consistency with
--           every other trigger function in this schema.
--   #4      — is_staff()/is_admin()/current_profile_role() are granted to
--           anon by 0010 (needed so RLS policies evaluate correctly for
--           anonymous readers). This is intentional and stays as-is;
--           documented here only, no SQL change.
--   #3      — recompute_order_total() was redefined by 0011; the 0009
--           version is harmless dead code after any full schema replay.
--           No SQL change, comment only.


-- ============================================================
-- 1. APPROVE / REJECT ORDER: ADMIN-ONLY (Hallazgo #6)
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

  if not is_admin() then
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

  if not is_admin() then
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
-- 2. REVOKE PUBLIC EXECUTE (Hallazgo #7)
-- ============================================================

revoke execute on function approve_order(uuid)
from public;

revoke execute on function reject_order(uuid)
from public;

-- authenticated already has EXECUTE from 0013; anon already lacks it
-- from 0013. Re-affirm explicitly for clarity/idempotency.
grant execute on function approve_order(uuid)
to authenticated;

grant execute on function reject_order(uuid)
to authenticated;

revoke execute on function approve_order(uuid)
from anon;

revoke execute on function reject_order(uuid)
from anon;


-- ============================================================
-- 3. REVOKE PUBLIC EXECUTE ON TRIGGER VALIDATION FUNCTIONS (Hallazgo #8)
-- ============================================================

revoke execute on function validate_seat_price_category()
from public;

revoke execute on function validate_performance_price_category()
from public;


-- ============================================================
-- 4. DOCUMENTATION-ONLY NOTES (Hallazgos #3, #4 — no SQL change)
-- ============================================================

-- Hallazgo #3: recompute_order_total() was defined in 0009 and
-- redefined in 0011. The 0011 version (sum of tickets.unit_price) is
-- the one bound to trg_recompute_total_ins today and after any full
-- schema replay. The 0009 body is harmless dead code — left untouched
-- because 0009 is an executed migration and this project never edits
-- executed migrations retroactively.

-- Hallazgo #4: is_staff()/is_admin()/current_profile_role() are
-- granted to anon by 0010 (they run inside RLS policy evaluation for
-- anonymous readers). This is intentional: these are read-only, side-
-- effect-free functions, so the anon grant is low-risk. No revoke here.
