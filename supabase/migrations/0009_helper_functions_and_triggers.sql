-- 0009: helper functions + triggers
-- These are schema-level safeguards (used by RLS policies in 0010 and by
-- the tables themselves) — not an API surface for the frontend. Deciding
-- how the client calls into Supabase (RPC vs. direct table access) is an
-- integration decision for a later, separate step.

-- 'staff' is limited to read-only visibility (panel, orders, tickets,
-- profiles, sellers, blocked_seats) plus check-in and contact-message
-- triage; 'admin' has everything 'staff' has plus all write access to
-- orders/tickets/blocked_seats/productions/performances/seats/sellers and
-- role management. is_staff() therefore returns true for BOTH roles — use
-- is_admin() where a check must exclude staff and be admin-only. See the
-- permissions matrix in supabase/docs/DESIGN.md.
-- SECURITY DEFINER so it reads `profiles` directly, bypassing that table's
-- own RLS — calling it from within a profiles policy therefore cannot
-- recurse into RLS again.
create or replace function is_staff()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and rol in ('staff', 'admin')
  );
$$;

-- Admin-only check — full administrative permissions, a strict superset of
-- staff. Use this (not is_staff()) for actions the design reserves to
-- admin: managing staff/admin accounts, deleting historical records, etc.
create or replace function is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and rol = 'admin'
  );
$$;

-- Same SECURITY DEFINER reasoning as is_staff(): lets the profiles UPDATE
-- policy compare against the stored role without re-entering RLS on
-- profiles (a plain subquery on profiles from within its own policy would
-- either recurse or silently see no rows).
create or replace function current_profile_role()
returns user_role
language sql
security definer
stable
set search_path = public
as $$
  select rol from profiles where id = auth.uid();
$$;

-- Server-generated order codes. The client never supplies order_code —
-- this trigger overwrites whatever (if anything) was passed on insert.
create or replace function generate_order_code()
returns text
language plpgsql
as $$
declare
  candidate text;
begin
  loop
    candidate := 'DARF-' || upper(substr(md5(gen_random_uuid()::text), 1, 6));
    exit when not exists (select 1 from orders where order_code = candidate);
  end loop;
  return candidate;
end;
$$;

create or replace function set_order_code()
returns trigger
language plpgsql
as $$
begin
  new.order_code := generate_order_code();
  return new;
end;
$$;

drop trigger if exists trg_set_order_code on orders;
create trigger trg_set_order_code
  before insert on orders
  for each row execute function set_order_code();

-- Keeps tickets.performance_id in lockstep with its parent order's
-- performance — the client never sets it directly — and guards against a
-- ticket's seat belonging to a different production than its performance
-- (e.g. assigning a Mamma Mia! seat to a Showman performance). Both jobs
-- live in one BEFORE trigger (rather than two separate ones) so there is
-- no dependency on trigger firing order within the same INSERT/UPDATE:
-- the sync happens first in this function, and the validation reads the
-- now-synced new.performance_id in the same pass. This is what lets the
-- per-performance anti-double-booking index in 0007 live as a plain
-- partial unique index on `tickets` instead of a cross-table check, and
-- guarantees a ticket can never silently disagree with its own order about
-- which performance it belongs to, nor hold a seat from another production.
create or replace function sync_and_validate_ticket()
returns trigger
language plpgsql
as $$
declare
  seat_production text;
  performance_production text;
begin
  select performance_id into new.performance_id
  from orders where id = new.order_id;

  if new.seat_id is not null then
    select production_id into performance_production from performances where id = new.performance_id;
    select production_id into seat_production from seats where id = new.seat_id;

    if performance_production is distinct from seat_production then
      raise exception 'seat % does not belong to the production of performance %', new.seat_id, new.performance_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_and_validate_ticket on tickets;
create trigger trg_sync_and_validate_ticket
  before insert or update of order_id, seat_id on tickets
  for each row execute function sync_and_validate_ticket();

-- Same cross-production guard, for blocked_seats.
create or replace function validate_blocked_seat_production()
returns trigger
language plpgsql
as $$
declare
  performance_production text;
  seat_production text;
begin
  select production_id into performance_production from performances where id = new.performance_id;
  select production_id into seat_production from seats where id = new.seat_id;

  if performance_production is distinct from seat_production then
    raise exception 'seat % does not belong to the production of performance %', new.seat_id, new.performance_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_blocked_seat_production on blocked_seats;
create trigger trg_validate_blocked_seat_production
  before insert or update on blocked_seats
  for each row execute function validate_blocked_seat_production();

-- Recomputes orders.total from the production price × active ticket count
-- whenever tickets change. This is what makes "never trust the client's
-- total" hold at the database level, independent of whichever integration
-- path the frontend ends up using. Price still comes from `productions`
-- (price doesn't vary per performance today) via performances.production_id.
create or replace function recompute_order_total()
returns trigger
language plpgsql
as $$
declare
  affected_order uuid;
  unit_price numeric(10,2);
  ticket_count int;
begin
  affected_order := coalesce(new.order_id, old.order_id);

  select p.price into unit_price
  from orders o
  join performances pf on pf.id = o.performance_id
  join productions p on p.id = pf.production_id
  where o.id = affected_order;

  select count(*) into ticket_count
  from tickets
  where order_id = affected_order and is_active;

  update orders set total = coalesce(unit_price, 0) * ticket_count
  where id = affected_order;

  return null;
end;
$$;

drop trigger if exists trg_recompute_total_ins on tickets;
create trigger trg_recompute_total_ins
  after insert or update or delete on tickets
  for each row execute function recompute_order_total();
