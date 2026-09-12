-- 0008: helper functions + triggers
-- These are schema-level safeguards (used by RLS policies in 0009 and by
-- the tables themselves) — not an API surface for the frontend. Deciding
-- how the client calls into Supabase (RPC vs. direct table access) is an
-- integration decision for a later, separate step.

-- Used throughout RLS policies to gate staff-only rows/actions without a
-- client ever being able to set this themselves (profiles.rol is not
-- client-writable — see 0004 + 0009). SECURITY DEFINER so it reads
-- `profiles` directly, bypassing that table's own RLS — calling it from
-- within a profiles policy therefore cannot recurse into RLS again.
create or replace function is_staff()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and rol = 'staff'
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

-- Recomputes orders.total from the production price × active ticket count
-- whenever tickets change. This is what makes "never trust the client's
-- total" hold at the database level, independent of whichever integration
-- path the frontend ends up using.
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
  from orders o join productions p on p.id = o.production_id
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
