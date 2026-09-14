-- 0009: helper functions + triggers
--
-- Database-level safeguards used by RLS policies in 0010 and by the
-- ticketing tables themselves.
--
-- IMPORTANT:
-- - Client-facing RPC permissions are intentionally handled separately.
-- - SECURITY DEFINER functions use an explicit search_path.
-- - Trigger-only functions are not granted to authenticated users.
-- - RLS policies in 0010 will use is_staff(), is_admin() and
--   current_profile_role().


-- ============================================================
-- 1. ROLE HELPER FUNCTIONS
-- ============================================================

-- Returns TRUE for both staff and admin.
-- SECURITY DEFINER is required because this function may be called
-- from profiles RLS policies and therefore must read profiles without
-- recursively invoking profiles RLS.
create or replace function is_staff()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from profiles
    where id = auth.uid()
      and rol in ('staff', 'admin')
  );
$$;


-- Returns TRUE only for admin.
create or replace function is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from profiles
    where id = auth.uid()
      and rol = 'admin'
  );
$$;


-- Returns the stored role of the currently authenticated user.
-- Used by the profiles UPDATE policy to prevent a user from changing
-- their own role.
create or replace function current_profile_role()
returns user_role
language sql
security definer
stable
set search_path = public
as $$
  select rol
  from profiles
  where id = auth.uid();
$$;


-- ============================================================
-- 2. CONTACT MESSAGE TRIAGE
-- ============================================================

-- Allows staff/admin to mark a contact message as read without
-- granting UPDATE permission on contact_messages itself.
--
-- This intentionally updates ONLY the leido column.
create or replace function mark_contact_message_read(target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_staff() then
    raise exception 'not authorized';
  end if;

  update contact_messages
  set leido = true
  where id = target_id;
end;
$$;


-- ============================================================
-- 3. ORDER CODE GENERATION
-- ============================================================

-- Generates server-side order codes.
-- Example: DARF-A1B2C3
create or replace function generate_order_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate text;
begin
  loop
    candidate := 'DARF-' ||
                 upper(substr(md5(gen_random_uuid()::text), 1, 6));

    exit when not exists (
      select 1
      from orders
      where order_code = candidate
    );
  end loop;

  return candidate;
end;
$$;


-- Trigger wrapper for generate_order_code().
create or replace function set_order_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.order_code := generate_order_code();
  return new;
end;
$$;


drop trigger if exists trg_set_order_code on orders;

create trigger trg_set_order_code
before insert on orders
for each row
execute function set_order_code();


-- ============================================================
-- 4. TICKET PERFORMANCE + PRODUCTION VALIDATION
-- ============================================================

-- Keeps tickets.performance_id synchronized with the parent order.
--
-- Also prevents assigning a seat from one production to a performance
-- belonging to another production.
create or replace function sync_and_validate_ticket()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  seat_production text;
  performance_production text;
begin

  -- The ticket's performance always comes from its order.
  select performance_id
  into new.performance_id
  from orders
  where id = new.order_id;

  -- If the ticket has a physical seat, validate that the seat belongs
  -- to the same production as the performance.
  if new.seat_id is not null then

    select production_id
    into performance_production
    from performances
    where id = new.performance_id;

    select production_id
    into seat_production
    from seats
    where id = new.seat_id;

    if performance_production is distinct from seat_production then
      raise exception
        'seat % does not belong to the production of performance %',
        new.seat_id,
        new.performance_id;
    end if;

  end if;

  return new;
end;
$$;


drop trigger if exists trg_sync_and_validate_ticket on tickets;

create trigger trg_sync_and_validate_ticket
before insert or update of order_id, seat_id on tickets
for each row
execute function sync_and_validate_ticket();


-- ============================================================
-- 5. BLOCKED SEAT PRODUCTION VALIDATION
-- ============================================================

-- Prevents blocking a seat belonging to a different production
-- than the selected performance.
create or replace function validate_blocked_seat_production()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  performance_production text;
  seat_production text;
begin

  select production_id
  into performance_production
  from performances
  where id = new.performance_id;

  select production_id
  into seat_production
  from seats
  where id = new.seat_id;

  if performance_production is distinct from seat_production then
    raise exception
      'seat % does not belong to the production of performance %',
      new.seat_id,
      new.performance_id;
  end if;

  return new;
end;
$$;


drop trigger if exists trg_validate_blocked_seat_production
on blocked_seats;

create trigger trg_validate_blocked_seat_production
before insert or update on blocked_seats
for each row
execute function validate_blocked_seat_production();


-- ============================================================
-- 6. ORDER TOTAL RECOMPUTATION
-- ============================================================

-- Recomputes an order total from:
--
--   production price × number of active tickets
--
-- The client-provided total is therefore never trusted.
--
-- IMPORTANT:
-- If a ticket moves from one order to another, BOTH orders are
-- recalculated so the old order cannot retain an incorrect total.
create or replace function recompute_order_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_order uuid;
  unit_price numeric(10,2);
  ticket_count integer;
begin

  -- ----------------------------------------------------------
  -- DELETE
  -- ----------------------------------------------------------
  if tg_op = 'DELETE' then

    affected_order := old.order_id;

    select p.price
    into unit_price
    from orders o
    join performances pf
      on pf.id = o.performance_id
    join productions p
      on p.id = pf.production_id
    where o.id = affected_order;

    select count(*)
    into ticket_count
    from tickets
    where order_id = affected_order
      and is_active;

    update orders
    set total = coalesce(unit_price, 0) * ticket_count
    where id = affected_order;

    return null;

  end if;


  -- ----------------------------------------------------------
  -- UPDATE
  -- ----------------------------------------------------------
  if tg_op = 'UPDATE' then

    -- If the ticket changed orders, first recalculate the old order.
    if old.order_id is distinct from new.order_id then

      affected_order := old.order_id;

      select p.price
      into unit_price
      from orders o
      join performances pf
        on pf.id = o.performance_id
      join productions p
        on p.id = pf.production_id
      where o.id = affected_order;

      select count(*)
      into ticket_count
      from tickets
      where order_id = affected_order
        and is_active;

      update orders
      set total = coalesce(unit_price, 0) * ticket_count
      where id = affected_order;

    end if;

    -- Then recalculate the new/current order.
    affected_order := new.order_id;

    select p.price
    into unit_price
    from orders o
    join performances pf
      on pf.id = o.performance_id
    join productions p
      on p.id = pf.production_id
    where o.id = affected_order;

    select count(*)
    into ticket_count
    from tickets
    where order_id = affected_order
      and is_active;

    update orders
    set total = coalesce(unit_price, 0) * ticket_count
    where id = affected_order;

    return null;

  end if;


  -- ----------------------------------------------------------
  -- INSERT
  -- ----------------------------------------------------------
  affected_order := new.order_id;

  select p.price
  into unit_price
  from orders o
  join performances pf
    on pf.id = o.performance_id
  join productions p
    on p.id = pf.production_id
  where o.id = affected_order;

  select count(*)
  into ticket_count
  from tickets
  where order_id = affected_order
    and is_active;

  update orders
  set total = coalesce(unit_price, 0) * ticket_count
  where id = affected_order;

  return null;

end;
$$;


drop trigger if exists trg_recompute_total_ins on tickets;

create trigger trg_recompute_total_ins
after insert or update or delete on tickets
for each row
execute function recompute_order_total();


-- ============================================================
-- 7. FUNCTION EXECUTION PRIVILEGES
-- ============================================================

-- Remove PostgreSQL's default EXECUTE privilege from PUBLIC.
-- This prevents anonymous/unintended callers from invoking these
-- functions directly.

revoke execute on function is_staff()
from public;

revoke execute on function is_admin()
from public;

revoke execute on function current_profile_role()
from public;

revoke execute on function mark_contact_message_read(uuid)
from public;

revoke execute on function generate_order_code()
from public;

revoke execute on function set_order_code()
from public;

revoke execute on function sync_and_validate_ticket()
from public;

revoke execute on function validate_blocked_seat_production()
from public;

revoke execute on function recompute_order_total()
from public;


-- These three functions are intentionally callable by authenticated
-- users because RLS policies and the controlled contact-message RPC
-- may invoke them.
grant execute on function is_staff()
to authenticated;

grant execute on function is_admin()
to authenticated;

grant execute on function current_profile_role()
to authenticated;

grant execute on function mark_contact_message_read(uuid)
to authenticated;


-- The following functions are trigger-only/internal helpers.
-- They remain executable by their owning database role through the
-- trigger mechanism but are NOT exposed as authenticated RPC functions.
