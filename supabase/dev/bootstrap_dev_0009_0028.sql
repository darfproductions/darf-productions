-- ════════════════════════════════════════════════════════════════════════
-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV"
-- NUNCA ejecutar en producción. La primera instrucción lo comprueba y aborta
-- todo el script si no encuentra la marca de DEV (darf_env.marker).
--
-- Qué hace: aplica las migraciones 0009–0028 del repositorio, tal cual,
-- en una sola transacción (si algo falla, no queda nada a medias), e inserta
-- las 3 producciones de PRUEBA justo antes de 0018 (hallazgo H6: en
-- producción esas filas se crearon a mano y no están en ninguna migración).
-- Las migraciones 0001–0008 ya se aplicaron en DEV con el conector.
--
-- Generado mecánicamente a partir de supabase/migrations/ (solo se quitan
-- las líneas `begin;`/`commit;` internas para envolver todo en una única
-- transacción). Regenerar con: supabase/dev/build_bootstrap.sh
-- ════════════════════════════════════════════════════════════════════════

do $$
declare ok boolean := false;
begin
  if to_regclass('darf_env.marker') is not null then
    execute 'select exists (select 1 from darf_env.marker where env = ''DARF-2.0-DEV'')' into ok;
  end if;
  if not ok then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
end $$;

begin;


-- ──────── 0009_helper_functions_and_triggers.sql ────────
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

-- ──────── 0010_rls_policies.sql ────────
-- 0010: Row Level Security
-- Enforces the public/authenticated/staff/admin split from the design doc
-- at the database level, so a compromised or hand-edited frontend cannot
-- bypass it.
--
-- Role model: 'staff' has read-only internal visibility (panel data, orders,
-- tickets, profiles, sellers, blocked_seats) plus two narrow exceptions —
-- check-in and marking a contact message read — both of which staff
-- performs via a SECURITY DEFINER RPC that touches only the one column it
-- needs, NEVER a table-level UPDATE policy. 'admin' is a strict superset:
-- everything staff can do, PLUS all write access — approving/rejecting
-- orders, blocking/releasing seats, managing productions/performances/seats/
-- sellers, deleting contact messages, and granting/revoking roles.
-- is_staff() is true for BOTH 'staff' and 'admin' — it gates read-only
-- internal access. is_admin() is true ONLY for 'admin' — it gates every
-- write/management action in this schema. See the permissions matrix in
-- supabase/docs/DESIGN.md.

alter table productions enable row level security;
alter table performances enable row level security;
alter table seats enable row level security;
alter table orders enable row level security;
alter table tickets enable row level security;
alter table blocked_seats enable row level security;
alter table sellers enable row level security;
alter table contact_messages enable row level security;
alter table profiles enable row level security;

-- productions: public read, admin-only write. Managing the catalog is
-- "Gestionar producciones" in the permissions matrix — admin-exclusive;
-- staff has no write policy here at all.
create policy "productions_public_read" on productions
  for select using (true);
create policy "productions_admin_write" on productions
  for all using (is_admin()) with check (is_admin());

-- performances: public read (checkout needs to list which funciones are on
-- sale), admin-only write (creating a performance, toggling on_sale) —
-- "Gestionar performances" is admin-exclusive.
create policy "performances_public_read" on performances
  for select using (true);
create policy "performances_admin_write" on performances
  for all using (is_admin()) with check (is_admin());

-- seats: public read (availability rendering needs section/row/number),
-- admin-only write. Safe when the table is empty — a public SELECT on an
-- empty table just returns zero rows, nothing errors.
create policy "seats_public_read" on seats
  for select using (true);
create policy "seats_admin_write" on seats
  for all using (is_admin()) with check (is_admin());

-- orders: no public/anon SELECT on the raw table (contains buyer PII).
-- Anonymous order-code lookup and anonymous order creation are handled by
-- SECURITY DEFINER RPCs (a later, separate step) that bypass RLS
-- deliberately and narrowly — not by opening this table up.
-- Staff has READ ONLY visibility (internal panel); approving/rejecting an
-- order ("Gestionar boletería" / "Aprobar/rechazar órdenes") is
-- admin-exclusive.
create policy "orders_owner_read" on orders
  for select using (buyer_user_id = auth.uid());
create policy "orders_staff_read" on orders
  for select using (is_staff());
create policy "orders_admin_write" on orders
  for all using (is_admin()) with check (is_admin());
-- No insert/update policy for plain authenticated users or staff: order
-- creation, approval, and rejection all go through RPCs or admin, not
-- direct table writes by a buyer or staff member.

-- tickets: owner can read their own tickets (via their order), staff has
-- read-only visibility, admin has full write ("Gestionar tickets"). There
-- is deliberately NO staff UPDATE policy on this table — check-in is an
-- operational action, not ticket management, but it still must NOT be a
-- blanket UPDATE: two scanners racing the same QR must not both succeed,
-- and staff must not be able to rewrite order_id/seat_id/qr_token. Check-in
-- goes through a future SECURITY DEFINER RPC (e.g. checkin_by_qr(), not
-- built yet — see DESIGN.md) that atomically checks + sets
-- checked_in_at/checked_in_by and nothing else, the same
-- narrow-RPC-over-blanket-UPDATE pattern used for contact_messages below.
create policy "tickets_owner_read" on tickets
  for select using (
    exists (select 1 from orders o where o.id = tickets.order_id and o.buyer_user_id = auth.uid())
  );
create policy "tickets_staff_read" on tickets
  for select using (is_staff());
create policy "tickets_admin_write" on tickets
  for all using (is_admin()) with check (is_admin());

-- blocked_seats: staff has read-only visibility, admin-only write
-- ("Bloquear/desbloquear asientos" is admin-exclusive). Key is
-- (performance_id, seat_id) — a block in one performance never matches a
-- row for another performance of the same seat, so RLS needs no change
-- beyond the underlying key shape already enforcing that scoping.
create policy "blocked_seats_staff_read" on blocked_seats
  for select using (is_staff());
create policy "blocked_seats_admin_write" on blocked_seats
  for all using (is_admin()) with check (is_admin());

-- sellers: no public SELECT on the full table (would leak all seller codes
-- + names). Code validation for checkout is a SECURITY DEFINER RPC (later
-- step). Staff has read-only visibility (to validate a code at the box
-- office); creating/editing/deactivating a seller is "Gestionar boletería"
-- and is admin-exclusive.
create policy "sellers_staff_read" on sellers
  for select using (is_staff());
create policy "sellers_admin_write" on sellers
  for all using (is_admin()) with check (is_admin());

-- contact_messages: public can INSERT (the contact form). Staff can read
-- (day-to-day triage) but has NO update/delete policy at all — marking a
-- message read goes through mark_contact_message_read() (0009), a
-- SECURITY DEFINER function that only ever sets `leido`. A blanket UPDATE
-- policy here would let staff rewrite nombre/correo/telefono/mensaje too,
-- not just the read flag. Deleting is admin-only.
create policy "contact_messages_public_insert" on contact_messages
  for insert with check (true);
create policy "contact_messages_staff_read" on contact_messages
  for select using (is_staff());
create policy "contact_messages_admin_delete" on contact_messages
  for delete using (is_admin());

-- profiles: a user can read/update their OWN row, but never their own
-- `rol` — enforced by re-asserting the existing role on every check, so
-- even a hand-crafted UPDATE that includes rol='staff' is rejected because
-- the WITH CHECK re-reads the stored value, not the client's payload.
create policy "profiles_owner_read" on profiles
  for select using (id = auth.uid());
create policy "profiles_owner_update" on profiles
  for update using (id = auth.uid())
  with check (id = auth.uid() and rol = current_profile_role());

-- Staff/admin can VIEW all profiles (needed to attribute orders, sellers,
-- check-ins to a name). Only ADMIN can WRITE another user's profile row —
-- in particular, only admin can change someone's `rol`. This is the
-- highest-stakes instance of the staff/admin write split (see file header):
-- granting `rol` is the one action that could otherwise let staff promote
-- itself or another account.
create policy "profiles_staff_read" on profiles
  for select using (is_staff());
create policy "profiles_admin_write" on profiles
  for all using (is_admin()) with check (is_admin());
-- ============================================================
-- FUNCTION EXECUTION PRIVILEGES
-- ============================================================

-- These helper functions are referenced by RLS policies.
-- They must therefore be executable by the roles whose queries
-- can cause those policies to be evaluated.
grant execute on function is_staff()
to anon, authenticated;

grant execute on function is_admin()
to anon, authenticated;

grant execute on function current_profile_role()
to anon, authenticated;


-- This is the only operational SECURITY DEFINER function that
-- authenticated users may invoke directly.
-- It performs its own is_staff() authorization check and only
-- updates the `leido` column.
grant execute on function mark_contact_message_read(uuid)
to authenticated;


-- Internal trigger/helper functions must NOT be directly callable
-- by anon or authenticated users.
revoke execute on function mark_contact_message_read(uuid)
from anon;

revoke execute on function generate_order_code()
from anon, authenticated;

revoke execute on function set_order_code()
from anon, authenticated;

revoke execute on function sync_and_validate_ticket()
from anon, authenticated;

revoke execute on function validate_blocked_seat_production()
from anon, authenticated;

revoke execute on function recompute_order_total()
from anon, authenticated;

-- ──────── 0011_ticketing_rpcs.sql ────────
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

-- ──────── 0012_order_expiration.sql ────────
-- 0012: order expiration
--
-- Adds an expiration timestamp to pending orders.
-- This will later be used to release tickets from unpaid orders.

alter table orders
add column if not exists expires_at timestamptz;

create index if not exists idx_orders_expires_at
on orders(expires_at)
where status = 'pendiente';

-- ──────── 0013_manual_order_management.sql ────────
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

-- ──────── 0014_ticket_pricing.sql ────────
-- 0014: ticket pricing
--
-- Adds reusable price categories and per-performance pricing.
-- Seats reference a price category.
-- Each performance can define its own price for each category.
--
-- IMPORTANT:
-- The ticket.unit_price remains the historical price snapshot.
-- Changing a future price never changes an existing ticket.


-- ============================================================
-- 1. PRICE CATEGORIES
-- ============================================================

create table if not exists price_categories (
  id uuid primary key default gen_random_uuid(),
  production_id text not null references productions(id) on delete cascade,
  nombre text not null,
  descripcion text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint price_categories_production_nombre_unique
    unique (production_id, nombre)
);

create index if not exists idx_price_categories_production
on price_categories(production_id);


-- ============================================================
-- 2. PERFORMANCE PRICES
-- ============================================================

create table if not exists performance_price_categories (
  performance_id uuid not null references performances(id) on delete cascade,
  price_category_id uuid not null references price_categories(id) on delete cascade,
  price numeric(10,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (performance_id, price_category_id),

  constraint performance_price_nonnegative
    check (price >= 0)
);

create index if not exists idx_performance_prices_performance
on performance_price_categories(performance_id);

create index if not exists idx_performance_prices_category
on performance_price_categories(price_category_id);


-- ============================================================
-- 3. ASSIGN PRICE CATEGORY TO SEATS
-- ============================================================

alter table seats
add column if not exists price_category_id uuid
references price_categories(id)
on delete set null;

create index if not exists idx_seats_price_category
on seats(price_category_id);


-- ============================================================
-- 4. DATA INTEGRITY
-- ============================================================

create or replace function validate_seat_price_category()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin

  if new.price_category_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from price_categories pc
    where pc.id = new.price_category_id
      and pc.production_id = new.production_id
  ) then
    raise exception
      'La categoría de precio no pertenece a la producción del asiento';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_seat_price_category
on seats;

create trigger trg_validate_seat_price_category
before insert or update of production_id, price_category_id
on seats
for each row
execute function validate_seat_price_category();


-- ============================================================
-- 5. PERFORMANCE PRICE VALIDATION
-- ============================================================

create or replace function validate_performance_price_category()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_performance_production_id text;
  v_category_production_id text;
begin

  select production_id
  into v_performance_production_id
  from performances
  where id = new.performance_id;

  if not found then
    raise exception 'La función no existe';
  end if;

  select production_id
  into v_category_production_id
  from price_categories
  where id = new.price_category_id;

  if not found then
    raise exception 'La categoría de precio no existe';
  end if;

  if v_performance_production_id <> v_category_production_id then
    raise exception
      'La categoría de precio no pertenece a la producción de la función';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_performance_price_category
on performance_price_categories;

create trigger trg_validate_performance_price_category
before insert or update of performance_id, price_category_id
on performance_price_categories
for each row
execute function validate_performance_price_category();


-- ============================================================
-- 6. RLS
-- ============================================================

alter table price_categories enable row level security;
alter table performance_price_categories enable row level security;


-- Public can read active price categories.
create policy "price_categories_public_read"
on price_categories
for select
using (is_active = true);


-- Admin can manage price categories.
create policy "price_categories_admin_all"
on price_categories
for all
using (is_admin())
with check (is_admin());


-- Public can read prices for performances that are on sale.
create policy "performance_prices_public_read"
on performance_price_categories
for select
using (
  exists (
    select 1
    from performances pf
    join productions pr
      on pr.id = pf.production_id
    where pf.id = performance_price_categories.performance_id
      and pf.on_sale = true
      and pr.on_sale = true
  )
);


-- Admin can manage performance prices.
create policy "performance_prices_admin_all"
on performance_price_categories
for all
using (is_admin())
with check (is_admin());


-- ============================================================
-- 7. FUNCTION PRIVILEGES
-- ============================================================

revoke execute on function validate_seat_price_category()
from anon, authenticated;

revoke execute on function validate_performance_price_category()
from anon, authenticated;

-- ──────── 0015_seat_reservation.sql ────────
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

-- ──────── 0016_security_hardening.sql ────────
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

-- ──────── 0017_production_concluded.sql ────────
-- 0017: productions.concluded
-- Lets an admin mark a production as finished ("concluida"). A concluded
-- production stops appearing in Cartelera and in the staff sales panel, and
-- cannot be on sale. Existing rows default to false, so nothing changes until
-- an admin flips it. Writes are already covered by `productions_admin_write`
-- (admin-only) and reads by `productions_public_read` — no policy change.

alter table productions
  add column if not exists concluded boolean not null default false;

-- A concluded production can never be on sale.
alter table productions
  drop constraint if exists productions_concluded_not_on_sale;
alter table productions
  add constraint productions_concluded_not_on_sale
  check (not (concluded and on_sale));

-- ──────── SEED DEV: producciones de PRUEBA (mismos id que usa el código) ────────
insert into productions (id, nombre, venue, price, on_sale, concluded) values
  ('showman', 'Showman (PRUEBA)', 'Teatro de prueba', 250, false, false),
  ('mm',      'Mamma Mia! (PRUEBA)', 'Teatro de prueba', 150, false, true),
  ('hsm',     'High School Musical (PRUEBA)', 'Teatro de prueba', 50, false, true);

-- ──────── 0018_showman_categories_and_seats.sql ────────
-- 0018: Showman — categorías de precio y mapa de asientos (Teatro de la Ciudad)
-- Fuente: croquis oficial + conteos por fila confirmados por Johann.
-- Generado por supabase/seeds/gen_showman_seats.py -> showman_seats.csv.
-- Decisiones: sin zona Especial (naranja, Y-DD) ni General (verde); en la fila J
-- solo se habilitan 6 de los 10 espacios de discapacitados. 'Exclusivo' es la
-- zona roja y SÍ se vende ($400, ver 0020). Los precios por función
-- (performance_price_categories) no se asignan aquí.


insert into price_categories (production_id, nombre, descripcion) values
  ('showman','Exclusivo','Zona roja'),
  ('showman','VIP','Zona azul'),
  ('showman','Preferente','Zona rosa'),
  ('showman','Discapacitados','Zona marrón (6 espacios habilitados en fila J)');

insert into seats (production_id, section, seat_row, seat_number, seat_label, price_category_id)
select 'showman', v.section, v.seat_row, v.seat_number, v.seat_label, pc.id
from (values
  ('Zona Rosa','X',1,'Preferente-X-1','Preferente'),
  ('Zona Rosa','X',2,'Preferente-X-2','Preferente'),
  ('Zona Rosa','X',3,'Preferente-X-3','Preferente'),
  ('Zona Rosa','X',4,'Preferente-X-4','Preferente'),
  ('Zona Rosa','X',5,'Preferente-X-5','Preferente'),
  ('Zona Rosa','X',6,'Preferente-X-6','Preferente'),
  ('Zona Rosa','X',7,'Preferente-X-7','Preferente'),
  ('Zona Rosa','X',8,'Preferente-X-8','Preferente'),
  ('Zona Rosa','X',9,'Preferente-X-9','Preferente'),
  ('Zona Rosa','X',10,'Preferente-X-10','Preferente'),
  ('Zona Rosa','X',11,'Preferente-X-11','Preferente'),
  ('Zona Rosa','X',12,'Preferente-X-12','Preferente'),
  ('Zona Rosa','X',13,'Preferente-X-13','Preferente'),
  ('Zona Rosa','X',14,'Preferente-X-14','Preferente'),
  ('Zona Rosa','X',15,'Preferente-X-15','Preferente'),
  ('Zona Rosa','X',16,'Preferente-X-16','Preferente'),
  ('Zona Rosa','X',17,'Preferente-X-17','Preferente'),
  ('Zona Rosa','X',18,'Preferente-X-18','Preferente'),
  ('Zona Rosa','X',19,'Preferente-X-19','Preferente'),
  ('Zona Rosa','X',20,'Preferente-X-20','Preferente'),
  ('Zona Rosa','X',21,'Preferente-X-21','Preferente'),
  ('Zona Rosa','X',22,'Preferente-X-22','Preferente'),
  ('Zona Rosa','X',23,'Preferente-X-23','Preferente'),
  ('Zona Rosa','X',24,'Preferente-X-24','Preferente'),
  ('Zona Rosa','W',1,'Preferente-W-1','Preferente'),
  ('Zona Rosa','W',2,'Preferente-W-2','Preferente'),
  ('Zona Rosa','W',3,'Preferente-W-3','Preferente'),
  ('Zona Rosa','W',4,'Preferente-W-4','Preferente'),
  ('Zona Rosa','W',5,'Preferente-W-5','Preferente'),
  ('Zona Rosa','W',6,'Preferente-W-6','Preferente'),
  ('Zona Rosa','W',7,'Preferente-W-7','Preferente'),
  ('Zona Rosa','W',8,'Preferente-W-8','Preferente'),
  ('Zona Rosa','W',9,'Preferente-W-9','Preferente'),
  ('Zona Rosa','W',10,'Preferente-W-10','Preferente'),
  ('Zona Rosa','W',11,'Preferente-W-11','Preferente'),
  ('Zona Rosa','W',12,'Preferente-W-12','Preferente'),
  ('Zona Rosa','W',13,'Preferente-W-13','Preferente'),
  ('Zona Rosa','W',14,'Preferente-W-14','Preferente'),
  ('Zona Rosa','W',15,'Preferente-W-15','Preferente'),
  ('Zona Rosa','W',16,'Preferente-W-16','Preferente'),
  ('Zona Rosa','W',17,'Preferente-W-17','Preferente'),
  ('Zona Rosa','W',18,'Preferente-W-18','Preferente'),
  ('Zona Rosa','W',19,'Preferente-W-19','Preferente'),
  ('Zona Rosa','W',20,'Preferente-W-20','Preferente'),
  ('Zona Rosa','W',21,'Preferente-W-21','Preferente'),
  ('Zona Rosa','W',22,'Preferente-W-22','Preferente'),
  ('Zona Rosa','W',23,'Preferente-W-23','Preferente'),
  ('Zona Rosa','W',24,'Preferente-W-24','Preferente'),
  ('Zona Rosa','W',25,'Preferente-W-25','Preferente'),
  ('Zona Rosa','W',26,'Preferente-W-26','Preferente'),
  ('Zona Rosa','W',27,'Preferente-W-27','Preferente'),
  ('Zona Rosa','W',28,'Preferente-W-28','Preferente'),
  ('Zona Rosa','W',29,'Preferente-W-29','Preferente'),
  ('Zona Rosa','W',30,'Preferente-W-30','Preferente'),
  ('Zona Rosa','W',31,'Preferente-W-31','Preferente'),
  ('Zona Rosa','W',32,'Preferente-W-32','Preferente'),
  ('Zona Rosa','W',33,'Preferente-W-33','Preferente'),
  ('Zona Rosa','W',34,'Preferente-W-34','Preferente'),
  ('Zona Rosa','W',35,'Preferente-W-35','Preferente'),
  ('Zona Rosa','W',36,'Preferente-W-36','Preferente'),
  ('Zona Rosa','V',1,'Preferente-V-1','Preferente'),
  ('Zona Rosa','V',2,'Preferente-V-2','Preferente'),
  ('Zona Rosa','V',3,'Preferente-V-3','Preferente'),
  ('Zona Rosa','V',4,'Preferente-V-4','Preferente'),
  ('Zona Rosa','V',5,'Preferente-V-5','Preferente'),
  ('Zona Rosa','V',6,'Preferente-V-6','Preferente'),
  ('Zona Rosa','V',7,'Preferente-V-7','Preferente'),
  ('Zona Rosa','V',8,'Preferente-V-8','Preferente'),
  ('Zona Rosa','V',9,'Preferente-V-9','Preferente'),
  ('Zona Rosa','V',10,'Preferente-V-10','Preferente'),
  ('Zona Rosa','V',11,'Preferente-V-11','Preferente'),
  ('Zona Rosa','V',12,'Preferente-V-12','Preferente'),
  ('Zona Rosa','V',13,'Preferente-V-13','Preferente'),
  ('Zona Rosa','V',14,'Preferente-V-14','Preferente'),
  ('Zona Rosa','V',15,'Preferente-V-15','Preferente'),
  ('Zona Rosa','V',16,'Preferente-V-16','Preferente'),
  ('Zona Rosa','V',17,'Preferente-V-17','Preferente'),
  ('Zona Rosa','V',18,'Preferente-V-18','Preferente'),
  ('Zona Rosa','V',19,'Preferente-V-19','Preferente'),
  ('Zona Rosa','V',20,'Preferente-V-20','Preferente'),
  ('Zona Rosa','V',21,'Preferente-V-21','Preferente'),
  ('Zona Rosa','V',22,'Preferente-V-22','Preferente'),
  ('Zona Rosa','V',23,'Preferente-V-23','Preferente'),
  ('Zona Rosa','V',24,'Preferente-V-24','Preferente'),
  ('Zona Rosa','V',25,'Preferente-V-25','Preferente'),
  ('Zona Rosa','V',26,'Preferente-V-26','Preferente'),
  ('Zona Rosa','V',27,'Preferente-V-27','Preferente'),
  ('Zona Rosa','V',28,'Preferente-V-28','Preferente'),
  ('Zona Rosa','V',29,'Preferente-V-29','Preferente'),
  ('Zona Rosa','V',30,'Preferente-V-30','Preferente'),
  ('Zona Rosa','V',31,'Preferente-V-31','Preferente'),
  ('Zona Rosa','V',32,'Preferente-V-32','Preferente'),
  ('Zona Rosa','V',33,'Preferente-V-33','Preferente'),
  ('Zona Rosa','U',1,'Preferente-U-1','Preferente'),
  ('Zona Rosa','U',2,'Preferente-U-2','Preferente'),
  ('Zona Rosa','U',3,'Preferente-U-3','Preferente'),
  ('Zona Rosa','U',4,'Preferente-U-4','Preferente'),
  ('Zona Rosa','U',5,'Preferente-U-5','Preferente'),
  ('Zona Rosa','U',6,'Preferente-U-6','Preferente'),
  ('Zona Rosa','U',7,'Preferente-U-7','Preferente'),
  ('Zona Rosa','U',8,'Preferente-U-8','Preferente'),
  ('Zona Rosa','U',9,'Preferente-U-9','Preferente'),
  ('Zona Rosa','U',10,'Preferente-U-10','Preferente'),
  ('Zona Rosa','U',11,'Preferente-U-11','Preferente'),
  ('Zona Rosa','U',12,'Preferente-U-12','Preferente'),
  ('Zona Rosa','U',13,'Preferente-U-13','Preferente'),
  ('Zona Rosa','U',14,'Preferente-U-14','Preferente'),
  ('Zona Rosa','U',15,'Preferente-U-15','Preferente'),
  ('Zona Rosa','U',16,'Preferente-U-16','Preferente'),
  ('Zona Rosa','U',17,'Preferente-U-17','Preferente'),
  ('Zona Rosa','U',18,'Preferente-U-18','Preferente'),
  ('Zona Rosa','U',19,'Preferente-U-19','Preferente'),
  ('Zona Rosa','U',20,'Preferente-U-20','Preferente'),
  ('Zona Rosa','U',21,'Preferente-U-21','Preferente'),
  ('Zona Rosa','U',22,'Preferente-U-22','Preferente'),
  ('Zona Rosa','U',23,'Preferente-U-23','Preferente'),
  ('Zona Rosa','U',24,'Preferente-U-24','Preferente'),
  ('Zona Rosa','U',25,'Preferente-U-25','Preferente'),
  ('Zona Rosa','U',26,'Preferente-U-26','Preferente'),
  ('Zona Rosa','U',27,'Preferente-U-27','Preferente'),
  ('Zona Rosa','U',28,'Preferente-U-28','Preferente'),
  ('Zona Rosa','U',29,'Preferente-U-29','Preferente'),
  ('Zona Rosa','U',30,'Preferente-U-30','Preferente'),
  ('Zona Rosa','U',31,'Preferente-U-31','Preferente'),
  ('Zona Rosa','U',32,'Preferente-U-32','Preferente'),
  ('Zona Rosa','U',33,'Preferente-U-33','Preferente'),
  ('Zona Rosa','T',1,'Preferente-T-1','Preferente'),
  ('Zona Rosa','T',2,'Preferente-T-2','Preferente'),
  ('Zona Rosa','T',3,'Preferente-T-3','Preferente'),
  ('Zona Rosa','T',4,'Preferente-T-4','Preferente'),
  ('Zona Rosa','T',5,'Preferente-T-5','Preferente'),
  ('Zona Rosa','T',6,'Preferente-T-6','Preferente'),
  ('Zona Rosa','T',7,'Preferente-T-7','Preferente'),
  ('Zona Rosa','T',8,'Preferente-T-8','Preferente'),
  ('Zona Rosa','T',9,'Preferente-T-9','Preferente'),
  ('Zona Rosa','T',10,'Preferente-T-10','Preferente'),
  ('Zona Rosa','T',11,'Preferente-T-11','Preferente'),
  ('Zona Rosa','T',12,'Preferente-T-12','Preferente'),
  ('Zona Rosa','T',13,'Preferente-T-13','Preferente'),
  ('Zona Rosa','T',14,'Preferente-T-14','Preferente'),
  ('Zona Rosa','T',15,'Preferente-T-15','Preferente'),
  ('Zona Rosa','T',16,'Preferente-T-16','Preferente'),
  ('Zona Rosa','T',17,'Preferente-T-17','Preferente'),
  ('Zona Rosa','T',18,'Preferente-T-18','Preferente'),
  ('Zona Rosa','T',19,'Preferente-T-19','Preferente'),
  ('Zona Rosa','T',20,'Preferente-T-20','Preferente'),
  ('Zona Rosa','T',21,'Preferente-T-21','Preferente'),
  ('Zona Rosa','T',22,'Preferente-T-22','Preferente'),
  ('Zona Rosa','T',23,'Preferente-T-23','Preferente'),
  ('Zona Rosa','T',24,'Preferente-T-24','Preferente'),
  ('Zona Rosa','T',25,'Preferente-T-25','Preferente'),
  ('Zona Rosa','T',26,'Preferente-T-26','Preferente'),
  ('Zona Rosa','T',27,'Preferente-T-27','Preferente'),
  ('Zona Rosa','T',28,'Preferente-T-28','Preferente'),
  ('Zona Rosa','T',29,'Preferente-T-29','Preferente'),
  ('Zona Rosa','T',30,'Preferente-T-30','Preferente'),
  ('Zona Rosa','T',31,'Preferente-T-31','Preferente'),
  ('Zona Rosa','T',32,'Preferente-T-32','Preferente'),
  ('Zona Rosa','S',1,'Preferente-S-1','Preferente'),
  ('Zona Rosa','S',2,'Preferente-S-2','Preferente'),
  ('Zona Rosa','S',3,'Preferente-S-3','Preferente'),
  ('Zona Rosa','S',4,'Preferente-S-4','Preferente'),
  ('Zona Rosa','S',5,'Preferente-S-5','Preferente'),
  ('Zona Rosa','S',6,'Preferente-S-6','Preferente'),
  ('Zona Rosa','S',7,'Preferente-S-7','Preferente'),
  ('Zona Rosa','S',8,'Preferente-S-8','Preferente'),
  ('Zona Rosa','S',9,'Preferente-S-9','Preferente'),
  ('Zona Rosa','S',10,'Preferente-S-10','Preferente'),
  ('Zona Rosa','S',11,'Preferente-S-11','Preferente'),
  ('Zona Rosa','S',12,'Preferente-S-12','Preferente'),
  ('Zona Rosa','S',13,'Preferente-S-13','Preferente'),
  ('Zona Rosa','S',14,'Preferente-S-14','Preferente'),
  ('Zona Rosa','S',15,'Preferente-S-15','Preferente'),
  ('Zona Rosa','S',16,'Preferente-S-16','Preferente'),
  ('Zona Rosa','S',17,'Preferente-S-17','Preferente'),
  ('Zona Rosa','S',18,'Preferente-S-18','Preferente'),
  ('Zona Rosa','S',19,'Preferente-S-19','Preferente'),
  ('Zona Rosa','S',20,'Preferente-S-20','Preferente'),
  ('Zona Rosa','S',21,'Preferente-S-21','Preferente'),
  ('Zona Rosa','S',22,'Preferente-S-22','Preferente'),
  ('Zona Rosa','S',23,'Preferente-S-23','Preferente'),
  ('Zona Rosa','S',24,'Preferente-S-24','Preferente'),
  ('Zona Rosa','S',25,'Preferente-S-25','Preferente'),
  ('Zona Rosa','S',26,'Preferente-S-26','Preferente'),
  ('Zona Rosa','S',27,'Preferente-S-27','Preferente'),
  ('Zona Rosa','S',28,'Preferente-S-28','Preferente'),
  ('Zona Rosa','S',29,'Preferente-S-29','Preferente'),
  ('Zona Rosa','S',30,'Preferente-S-30','Preferente'),
  ('Zona Rosa','S',31,'Preferente-S-31','Preferente'),
  ('Zona Rosa','S',32,'Preferente-S-32','Preferente'),
  ('Zona Rosa','S',33,'Preferente-S-33','Preferente'),
  ('Zona Rosa','S',34,'Preferente-S-34','Preferente'),
  ('Zona Rosa','S',35,'Preferente-S-35','Preferente'),
  ('Zona Rosa','R',1,'Preferente-R-1','Preferente'),
  ('Zona Rosa','R',2,'Preferente-R-2','Preferente'),
  ('Zona Rosa','R',3,'Preferente-R-3','Preferente'),
  ('Zona Rosa','R',4,'Preferente-R-4','Preferente'),
  ('Zona Rosa','R',5,'Preferente-R-5','Preferente'),
  ('Zona Rosa','R',6,'Preferente-R-6','Preferente'),
  ('Zona Rosa','R',7,'Preferente-R-7','Preferente'),
  ('Zona Rosa','R',8,'Preferente-R-8','Preferente'),
  ('Zona Rosa','R',9,'Preferente-R-9','Preferente'),
  ('Zona Rosa','R',10,'Preferente-R-10','Preferente'),
  ('Zona Rosa','R',11,'Preferente-R-11','Preferente'),
  ('Zona Rosa','R',12,'Preferente-R-12','Preferente'),
  ('Zona Rosa','R',13,'Preferente-R-13','Preferente'),
  ('Zona Rosa','R',14,'Preferente-R-14','Preferente'),
  ('Zona Rosa','R',15,'Preferente-R-15','Preferente'),
  ('Zona Rosa','R',16,'Preferente-R-16','Preferente'),
  ('Zona Rosa','R',17,'Preferente-R-17','Preferente'),
  ('Zona Rosa','R',18,'Preferente-R-18','Preferente'),
  ('Zona Rosa','R',19,'Preferente-R-19','Preferente'),
  ('Zona Rosa','R',20,'Preferente-R-20','Preferente'),
  ('Zona Rosa','R',21,'Preferente-R-21','Preferente'),
  ('Zona Rosa','R',22,'Preferente-R-22','Preferente'),
  ('Zona Rosa','R',23,'Preferente-R-23','Preferente'),
  ('Zona Rosa','R',24,'Preferente-R-24','Preferente'),
  ('Zona Rosa','R',25,'Preferente-R-25','Preferente'),
  ('Zona Rosa','R',26,'Preferente-R-26','Preferente'),
  ('Zona Rosa','R',27,'Preferente-R-27','Preferente'),
  ('Zona Rosa','R',28,'Preferente-R-28','Preferente'),
  ('Zona Rosa','R',29,'Preferente-R-29','Preferente'),
  ('Zona Rosa','R',30,'Preferente-R-30','Preferente'),
  ('Zona Rosa','R',31,'Preferente-R-31','Preferente'),
  ('Zona Rosa','R',32,'Preferente-R-32','Preferente'),
  ('Zona Rosa','R',33,'Preferente-R-33','Preferente'),
  ('Zona Rosa','R',34,'Preferente-R-34','Preferente'),
  ('Zona Rosa','Q',1,'Preferente-Q-1','Preferente'),
  ('Zona Rosa','Q',2,'Preferente-Q-2','Preferente'),
  ('Zona Rosa','Q',3,'Preferente-Q-3','Preferente'),
  ('Zona Rosa','Q',4,'Preferente-Q-4','Preferente'),
  ('Zona Rosa','Q',5,'Preferente-Q-5','Preferente'),
  ('Zona Rosa','Q',6,'Preferente-Q-6','Preferente'),
  ('Zona Rosa','Q',7,'Preferente-Q-7','Preferente'),
  ('Zona Rosa','Q',8,'Preferente-Q-8','Preferente'),
  ('Zona Rosa','Q',9,'Preferente-Q-9','Preferente'),
  ('Zona Rosa','Q',10,'Preferente-Q-10','Preferente'),
  ('Zona Rosa','Q',11,'Preferente-Q-11','Preferente'),
  ('Zona Rosa','Q',12,'Preferente-Q-12','Preferente'),
  ('Zona Rosa','Q',13,'Preferente-Q-13','Preferente'),
  ('Zona Rosa','Q',14,'Preferente-Q-14','Preferente'),
  ('Zona Rosa','Q',15,'Preferente-Q-15','Preferente'),
  ('Zona Rosa','Q',16,'Preferente-Q-16','Preferente'),
  ('Zona Rosa','Q',17,'Preferente-Q-17','Preferente'),
  ('Zona Rosa','Q',18,'Preferente-Q-18','Preferente'),
  ('Zona Rosa','Q',19,'Preferente-Q-19','Preferente'),
  ('Zona Rosa','Q',20,'Preferente-Q-20','Preferente'),
  ('Zona Rosa','Q',21,'Preferente-Q-21','Preferente'),
  ('Zona Rosa','Q',22,'Preferente-Q-22','Preferente'),
  ('Zona Rosa','Q',23,'Preferente-Q-23','Preferente'),
  ('Zona Rosa','Q',24,'Preferente-Q-24','Preferente'),
  ('Zona Rosa','Q',25,'Preferente-Q-25','Preferente'),
  ('Zona Rosa','Q',26,'Preferente-Q-26','Preferente'),
  ('Zona Rosa','Q',27,'Preferente-Q-27','Preferente'),
  ('Zona Rosa','Q',28,'Preferente-Q-28','Preferente'),
  ('Zona Rosa','Q',29,'Preferente-Q-29','Preferente'),
  ('Zona Rosa','Q',30,'Preferente-Q-30','Preferente'),
  ('Zona Rosa','Q',31,'Preferente-Q-31','Preferente'),
  ('Zona Rosa','Q',32,'Preferente-Q-32','Preferente'),
  ('Zona Rosa','Q',33,'Preferente-Q-33','Preferente'),
  ('Zona Rosa','P',1,'Preferente-P-1','Preferente'),
  ('Zona Rosa','P',2,'Preferente-P-2','Preferente'),
  ('Zona Rosa','P',3,'Preferente-P-3','Preferente'),
  ('Zona Rosa','P',4,'Preferente-P-4','Preferente'),
  ('Zona Rosa','P',5,'Preferente-P-5','Preferente'),
  ('Zona Rosa','P',6,'Preferente-P-6','Preferente'),
  ('Zona Rosa','P',7,'Preferente-P-7','Preferente'),
  ('Zona Rosa','P',8,'Preferente-P-8','Preferente'),
  ('Zona Rosa','P',9,'Preferente-P-9','Preferente'),
  ('Zona Rosa','P',10,'Preferente-P-10','Preferente'),
  ('Zona Rosa','P',11,'Preferente-P-11','Preferente'),
  ('Zona Rosa','P',12,'Preferente-P-12','Preferente'),
  ('Zona Rosa','P',13,'Preferente-P-13','Preferente'),
  ('Zona Rosa','P',14,'Preferente-P-14','Preferente'),
  ('Zona Rosa','P',15,'Preferente-P-15','Preferente'),
  ('Zona Rosa','P',16,'Preferente-P-16','Preferente'),
  ('Zona Rosa','P',17,'Preferente-P-17','Preferente'),
  ('Zona Rosa','P',18,'Preferente-P-18','Preferente'),
  ('Zona Rosa','P',19,'Preferente-P-19','Preferente'),
  ('Zona Rosa','P',20,'Preferente-P-20','Preferente'),
  ('Zona Rosa','P',21,'Preferente-P-21','Preferente'),
  ('Zona Rosa','P',22,'Preferente-P-22','Preferente'),
  ('Zona Rosa','P',23,'Preferente-P-23','Preferente'),
  ('Zona Rosa','P',24,'Preferente-P-24','Preferente'),
  ('Zona Rosa','P',25,'Preferente-P-25','Preferente'),
  ('Zona Rosa','P',26,'Preferente-P-26','Preferente'),
  ('Zona Rosa','P',27,'Preferente-P-27','Preferente'),
  ('Zona Rosa','P',28,'Preferente-P-28','Preferente'),
  ('Zona Rosa','P',29,'Preferente-P-29','Preferente'),
  ('Zona Rosa','P',30,'Preferente-P-30','Preferente'),
  ('Zona Rosa','P',31,'Preferente-P-31','Preferente'),
  ('Zona Rosa','P',32,'Preferente-P-32','Preferente'),
  ('Zona Rosa','O',1,'Preferente-O-1','Preferente'),
  ('Zona Rosa','O',2,'Preferente-O-2','Preferente'),
  ('Zona Rosa','O',3,'Preferente-O-3','Preferente'),
  ('Zona Rosa','O',4,'Preferente-O-4','Preferente'),
  ('Zona Rosa','O',5,'Preferente-O-5','Preferente'),
  ('Zona Rosa','O',6,'Preferente-O-6','Preferente'),
  ('Zona Rosa','O',7,'Preferente-O-7','Preferente'),
  ('Zona Rosa','O',8,'Preferente-O-8','Preferente'),
  ('Zona Rosa','O',9,'Preferente-O-9','Preferente'),
  ('Zona Rosa','O',10,'Preferente-O-10','Preferente'),
  ('Zona Rosa','O',11,'Preferente-O-11','Preferente'),
  ('Zona Rosa','O',12,'Preferente-O-12','Preferente'),
  ('Zona Rosa','O',13,'Preferente-O-13','Preferente'),
  ('Zona Rosa','O',14,'Preferente-O-14','Preferente'),
  ('Zona Rosa','O',15,'Preferente-O-15','Preferente'),
  ('Zona Rosa','O',16,'Preferente-O-16','Preferente'),
  ('Zona Rosa','O',17,'Preferente-O-17','Preferente'),
  ('Zona Rosa','O',18,'Preferente-O-18','Preferente'),
  ('Zona Rosa','O',19,'Preferente-O-19','Preferente'),
  ('Zona Rosa','O',20,'Preferente-O-20','Preferente'),
  ('Zona Rosa','O',21,'Preferente-O-21','Preferente'),
  ('Zona Rosa','O',22,'Preferente-O-22','Preferente'),
  ('Zona Rosa','O',23,'Preferente-O-23','Preferente'),
  ('Zona Rosa','O',24,'Preferente-O-24','Preferente'),
  ('Zona Rosa','O',25,'Preferente-O-25','Preferente'),
  ('Zona Rosa','O',26,'Preferente-O-26','Preferente'),
  ('Zona Rosa','O',27,'Preferente-O-27','Preferente'),
  ('Zona Rosa','O',28,'Preferente-O-28','Preferente'),
  ('Zona Rosa','O',29,'Preferente-O-29','Preferente'),
  ('Zona Rosa','O',30,'Preferente-O-30','Preferente'),
  ('Zona Rosa','O',31,'Preferente-O-31','Preferente'),
  ('Zona Rosa','O',32,'Preferente-O-32','Preferente'),
  ('Zona Rosa','O',33,'Preferente-O-33','Preferente'),
  ('Zona Rosa','O',34,'Preferente-O-34','Preferente'),
  ('Zona Rosa','N',1,'Preferente-N-1','Preferente'),
  ('Zona Rosa','N',2,'Preferente-N-2','Preferente'),
  ('Zona Rosa','N',3,'Preferente-N-3','Preferente'),
  ('Zona Rosa','N',4,'Preferente-N-4','Preferente'),
  ('Zona Rosa','N',5,'Preferente-N-5','Preferente'),
  ('Zona Rosa','N',6,'Preferente-N-6','Preferente'),
  ('Zona Rosa','N',7,'Preferente-N-7','Preferente'),
  ('Zona Rosa','N',8,'Preferente-N-8','Preferente'),
  ('Zona Rosa','N',9,'Preferente-N-9','Preferente'),
  ('Zona Rosa','N',10,'Preferente-N-10','Preferente'),
  ('Zona Rosa','N',11,'Preferente-N-11','Preferente'),
  ('Zona Rosa','N',12,'Preferente-N-12','Preferente'),
  ('Zona Rosa','N',13,'Preferente-N-13','Preferente'),
  ('Zona Rosa','N',14,'Preferente-N-14','Preferente'),
  ('Zona Rosa','N',15,'Preferente-N-15','Preferente'),
  ('Zona Rosa','N',16,'Preferente-N-16','Preferente'),
  ('Zona Rosa','N',17,'Preferente-N-17','Preferente'),
  ('Zona Rosa','N',18,'Preferente-N-18','Preferente'),
  ('Zona Rosa','N',19,'Preferente-N-19','Preferente'),
  ('Zona Rosa','N',20,'Preferente-N-20','Preferente'),
  ('Zona Rosa','N',21,'Preferente-N-21','Preferente'),
  ('Zona Rosa','N',22,'Preferente-N-22','Preferente'),
  ('Zona Rosa','N',23,'Preferente-N-23','Preferente'),
  ('Zona Rosa','N',24,'Preferente-N-24','Preferente'),
  ('Zona Rosa','N',25,'Preferente-N-25','Preferente'),
  ('Zona Rosa','N',26,'Preferente-N-26','Preferente'),
  ('Zona Rosa','N',27,'Preferente-N-27','Preferente'),
  ('Zona Rosa','N',28,'Preferente-N-28','Preferente'),
  ('Zona Rosa','N',29,'Preferente-N-29','Preferente'),
  ('Zona Rosa','N',30,'Preferente-N-30','Preferente'),
  ('Zona Rosa','N',31,'Preferente-N-31','Preferente'),
  ('Zona Rosa','N',32,'Preferente-N-32','Preferente'),
  ('Zona Rosa','N',33,'Preferente-N-33','Preferente'),
  ('Zona Rosa','N',34,'Preferente-N-34','Preferente'),
  ('Zona Rosa','M',1,'Preferente-M-1','Preferente'),
  ('Zona Rosa','M',2,'Preferente-M-2','Preferente'),
  ('Zona Rosa','M',3,'Preferente-M-3','Preferente'),
  ('Zona Rosa','M',4,'Preferente-M-4','Preferente'),
  ('Zona Rosa','M',5,'Preferente-M-5','Preferente'),
  ('Zona Rosa','M',6,'Preferente-M-6','Preferente'),
  ('Zona Rosa','M',7,'Preferente-M-7','Preferente'),
  ('Zona Rosa','M',8,'Preferente-M-8','Preferente'),
  ('Zona Rosa','M',9,'Preferente-M-9','Preferente'),
  ('Zona Rosa','M',10,'Preferente-M-10','Preferente'),
  ('Zona Rosa','M',11,'Preferente-M-11','Preferente'),
  ('Zona Rosa','M',12,'Preferente-M-12','Preferente'),
  ('Zona Rosa','M',13,'Preferente-M-13','Preferente'),
  ('Zona Rosa','M',14,'Preferente-M-14','Preferente'),
  ('Zona Rosa','M',15,'Preferente-M-15','Preferente'),
  ('Zona Rosa','M',16,'Preferente-M-16','Preferente'),
  ('Zona Rosa','M',17,'Preferente-M-17','Preferente'),
  ('Zona Rosa','M',18,'Preferente-M-18','Preferente'),
  ('Zona Rosa','M',19,'Preferente-M-19','Preferente'),
  ('Zona Rosa','M',20,'Preferente-M-20','Preferente'),
  ('Zona Rosa','M',21,'Preferente-M-21','Preferente'),
  ('Zona Rosa','M',22,'Preferente-M-22','Preferente'),
  ('Zona Rosa','M',23,'Preferente-M-23','Preferente'),
  ('Zona Rosa','M',24,'Preferente-M-24','Preferente'),
  ('Zona Rosa','M',25,'Preferente-M-25','Preferente'),
  ('Zona Rosa','M',26,'Preferente-M-26','Preferente'),
  ('Zona Rosa','M',27,'Preferente-M-27','Preferente'),
  ('Zona Rosa','M',28,'Preferente-M-28','Preferente'),
  ('Zona Rosa','M',29,'Preferente-M-29','Preferente'),
  ('Zona Rosa','M',30,'Preferente-M-30','Preferente'),
  ('Zona Rosa','M',31,'Preferente-M-31','Preferente'),
  ('Zona Rosa','M',32,'Preferente-M-32','Preferente'),
  ('Zona Rosa','M',33,'Preferente-M-33','Preferente'),
  ('Zona Rosa','M',34,'Preferente-M-34','Preferente'),
  ('Zona Rosa','L',1,'Preferente-L-1','Preferente'),
  ('Zona Rosa','L',2,'Preferente-L-2','Preferente'),
  ('Zona Rosa','L',3,'Preferente-L-3','Preferente'),
  ('Zona Rosa','L',4,'Preferente-L-4','Preferente'),
  ('Zona Rosa','L',5,'Preferente-L-5','Preferente'),
  ('Zona Rosa','L',6,'Preferente-L-6','Preferente'),
  ('Zona Rosa','L',7,'Preferente-L-7','Preferente'),
  ('Zona Rosa','L',8,'Preferente-L-8','Preferente'),
  ('Zona Rosa','L',9,'Preferente-L-9','Preferente'),
  ('Zona Rosa','L',10,'Preferente-L-10','Preferente'),
  ('Zona Rosa','L',11,'Preferente-L-11','Preferente'),
  ('Zona Rosa','L',12,'Preferente-L-12','Preferente'),
  ('Zona Rosa','L',13,'Preferente-L-13','Preferente'),
  ('Zona Rosa','L',14,'Preferente-L-14','Preferente'),
  ('Zona Rosa','L',15,'Preferente-L-15','Preferente'),
  ('Zona Rosa','L',16,'Preferente-L-16','Preferente'),
  ('Zona Rosa','L',17,'Preferente-L-17','Preferente'),
  ('Zona Rosa','L',18,'Preferente-L-18','Preferente'),
  ('Zona Rosa','L',19,'Preferente-L-19','Preferente'),
  ('Zona Rosa','L',20,'Preferente-L-20','Preferente'),
  ('Zona Rosa','L',21,'Preferente-L-21','Preferente'),
  ('Zona Rosa','L',22,'Preferente-L-22','Preferente'),
  ('Zona Rosa','L',23,'Preferente-L-23','Preferente'),
  ('Zona Rosa','L',24,'Preferente-L-24','Preferente'),
  ('Zona Rosa','L',25,'Preferente-L-25','Preferente'),
  ('Zona Rosa','L',26,'Preferente-L-26','Preferente'),
  ('Zona Rosa','L',27,'Preferente-L-27','Preferente'),
  ('Zona Rosa','L',28,'Preferente-L-28','Preferente'),
  ('Zona Rosa','L',29,'Preferente-L-29','Preferente'),
  ('Zona Rosa','L',30,'Preferente-L-30','Preferente'),
  ('Zona Rosa','L',31,'Preferente-L-31','Preferente'),
  ('Zona Rosa','L',32,'Preferente-L-32','Preferente'),
  ('Zona Rosa','K',1,'Preferente-K-1','Preferente'),
  ('Zona Rosa','K',2,'Preferente-K-2','Preferente'),
  ('Zona Rosa','K',3,'Preferente-K-3','Preferente'),
  ('Zona Rosa','K',4,'Preferente-K-4','Preferente'),
  ('Zona Rosa','K',5,'Preferente-K-5','Preferente'),
  ('Zona Rosa','K',6,'Preferente-K-6','Preferente'),
  ('Zona Rosa','K',7,'Preferente-K-7','Preferente'),
  ('Zona Rosa','K',8,'Preferente-K-8','Preferente'),
  ('Zona Rosa','K',9,'Preferente-K-9','Preferente'),
  ('Zona Rosa','K',10,'Preferente-K-10','Preferente'),
  ('Zona Rosa','K',11,'Preferente-K-11','Preferente'),
  ('Zona Rosa','K',12,'Preferente-K-12','Preferente'),
  ('Zona Rosa','K',13,'Preferente-K-13','Preferente'),
  ('Zona Rosa','K',14,'Preferente-K-14','Preferente'),
  ('Zona Rosa','K',15,'Preferente-K-15','Preferente'),
  ('Zona Rosa','K',16,'Preferente-K-16','Preferente'),
  ('Zona Rosa','K',17,'Preferente-K-17','Preferente'),
  ('Zona Rosa','K',18,'Preferente-K-18','Preferente'),
  ('Zona Rosa','K',19,'Preferente-K-19','Preferente'),
  ('Zona Rosa','K',20,'Preferente-K-20','Preferente'),
  ('Zona Rosa','K',21,'Preferente-K-21','Preferente'),
  ('Zona Rosa','K',22,'Preferente-K-22','Preferente'),
  ('Zona Rosa','K',23,'Preferente-K-23','Preferente'),
  ('Zona Rosa','K',24,'Preferente-K-24','Preferente'),
  ('Zona Rosa','K',25,'Preferente-K-25','Preferente'),
  ('Zona Rosa','K',26,'Preferente-K-26','Preferente'),
  ('Zona Rosa','K',27,'Preferente-K-27','Preferente'),
  ('Zona Rosa','K',28,'Preferente-K-28','Preferente'),
  ('Zona Rosa','K',29,'Preferente-K-29','Preferente'),
  ('Zona Rosa','K',30,'Preferente-K-30','Preferente'),
  ('Zona Rosa','K',31,'Preferente-K-31','Preferente'),
  ('Zona Rosa','K',32,'Preferente-K-32','Preferente'),
  ('Zona Rosa','J',1,'Preferente-J-1','Preferente'),
  ('Zona Rosa','J',2,'Preferente-J-2','Preferente'),
  ('Zona Rosa','J',3,'Preferente-J-3','Preferente'),
  ('Zona Rosa','J',4,'Preferente-J-4','Preferente'),
  ('Zona Rosa','J',5,'Preferente-J-5','Preferente'),
  ('Zona Rosa','J',6,'Preferente-J-6','Preferente'),
  ('Zona Rosa','J',7,'Preferente-J-7','Preferente'),
  ('Zona Rosa','J',8,'Preferente-J-8','Preferente'),
  ('Zona Rosa','J',9,'Preferente-J-9','Preferente'),
  ('Zona Rosa','J',10,'Preferente-J-10','Preferente'),
  ('Zona Rosa','J',11,'Preferente-J-11','Preferente'),
  ('Zona Azul','I',1,'VIP-I-1','VIP'),
  ('Zona Azul','I',2,'VIP-I-2','VIP'),
  ('Zona Azul','I',3,'VIP-I-3','VIP'),
  ('Zona Azul','I',4,'VIP-I-4','VIP'),
  ('Zona Azul','I',5,'VIP-I-5','VIP'),
  ('Zona Azul','I',6,'VIP-I-6','VIP'),
  ('Zona Azul','I',7,'VIP-I-7','VIP'),
  ('Zona Azul','I',8,'VIP-I-8','VIP'),
  ('Zona Azul','I',9,'VIP-I-9','VIP'),
  ('Zona Azul','I',10,'VIP-I-10','VIP'),
  ('Zona Azul','I',11,'VIP-I-11','VIP'),
  ('Zona Azul','I',12,'VIP-I-12','VIP'),
  ('Zona Azul','I',13,'VIP-I-13','VIP'),
  ('Zona Azul','I',14,'VIP-I-14','VIP'),
  ('Zona Azul','I',15,'VIP-I-15','VIP'),
  ('Zona Azul','I',16,'VIP-I-16','VIP'),
  ('Zona Azul','I',17,'VIP-I-17','VIP'),
  ('Zona Azul','I',18,'VIP-I-18','VIP'),
  ('Zona Azul','I',19,'VIP-I-19','VIP'),
  ('Zona Azul','I',20,'VIP-I-20','VIP'),
  ('Zona Azul','I',21,'VIP-I-21','VIP'),
  ('Zona Azul','I',22,'VIP-I-22','VIP'),
  ('Zona Azul','I',23,'VIP-I-23','VIP'),
  ('Zona Azul','I',24,'VIP-I-24','VIP'),
  ('Zona Azul','I',25,'VIP-I-25','VIP'),
  ('Zona Azul','I',26,'VIP-I-26','VIP'),
  ('Zona Azul','I',27,'VIP-I-27','VIP'),
  ('Zona Azul','I',28,'VIP-I-28','VIP'),
  ('Zona Azul','I',29,'VIP-I-29','VIP'),
  ('Zona Azul','I',30,'VIP-I-30','VIP'),
  ('Zona Azul','I',31,'VIP-I-31','VIP'),
  ('Zona Azul','I',32,'VIP-I-32','VIP'),
  ('Zona Azul','H',1,'VIP-H-1','VIP'),
  ('Zona Azul','H',2,'VIP-H-2','VIP'),
  ('Zona Azul','H',3,'VIP-H-3','VIP'),
  ('Zona Azul','H',4,'VIP-H-4','VIP'),
  ('Zona Azul','H',5,'VIP-H-5','VIP'),
  ('Zona Azul','H',6,'VIP-H-6','VIP'),
  ('Zona Azul','H',7,'VIP-H-7','VIP'),
  ('Zona Azul','H',8,'VIP-H-8','VIP'),
  ('Zona Azul','H',9,'VIP-H-9','VIP'),
  ('Zona Azul','H',10,'VIP-H-10','VIP'),
  ('Zona Azul','H',11,'VIP-H-11','VIP'),
  ('Zona Azul','H',12,'VIP-H-12','VIP'),
  ('Zona Azul','H',13,'VIP-H-13','VIP'),
  ('Zona Azul','H',14,'VIP-H-14','VIP'),
  ('Zona Azul','H',15,'VIP-H-15','VIP'),
  ('Zona Azul','H',16,'VIP-H-16','VIP'),
  ('Zona Azul','H',17,'VIP-H-17','VIP'),
  ('Zona Azul','H',18,'VIP-H-18','VIP'),
  ('Zona Azul','H',19,'VIP-H-19','VIP'),
  ('Zona Azul','H',20,'VIP-H-20','VIP'),
  ('Zona Azul','H',21,'VIP-H-21','VIP'),
  ('Zona Azul','H',22,'VIP-H-22','VIP'),
  ('Zona Azul','H',23,'VIP-H-23','VIP'),
  ('Zona Azul','H',24,'VIP-H-24','VIP'),
  ('Zona Azul','H',25,'VIP-H-25','VIP'),
  ('Zona Azul','H',26,'VIP-H-26','VIP'),
  ('Zona Azul','H',27,'VIP-H-27','VIP'),
  ('Zona Azul','H',28,'VIP-H-28','VIP'),
  ('Zona Azul','H',29,'VIP-H-29','VIP'),
  ('Zona Azul','G',1,'VIP-G-1','VIP'),
  ('Zona Azul','G',2,'VIP-G-2','VIP'),
  ('Zona Azul','G',3,'VIP-G-3','VIP'),
  ('Zona Azul','G',4,'VIP-G-4','VIP'),
  ('Zona Azul','G',5,'VIP-G-5','VIP'),
  ('Zona Azul','G',6,'VIP-G-6','VIP'),
  ('Zona Azul','G',7,'VIP-G-7','VIP'),
  ('Zona Azul','G',8,'VIP-G-8','VIP'),
  ('Zona Azul','G',9,'VIP-G-9','VIP'),
  ('Zona Azul','G',10,'VIP-G-10','VIP'),
  ('Zona Azul','G',11,'VIP-G-11','VIP'),
  ('Zona Azul','G',12,'VIP-G-12','VIP'),
  ('Zona Azul','G',13,'VIP-G-13','VIP'),
  ('Zona Azul','G',14,'VIP-G-14','VIP'),
  ('Zona Azul','G',15,'VIP-G-15','VIP'),
  ('Zona Azul','G',16,'VIP-G-16','VIP'),
  ('Zona Azul','G',17,'VIP-G-17','VIP'),
  ('Zona Azul','G',18,'VIP-G-18','VIP'),
  ('Zona Azul','G',19,'VIP-G-19','VIP'),
  ('Zona Azul','G',20,'VIP-G-20','VIP'),
  ('Zona Azul','G',21,'VIP-G-21','VIP'),
  ('Zona Azul','G',22,'VIP-G-22','VIP'),
  ('Zona Azul','G',23,'VIP-G-23','VIP'),
  ('Zona Azul','G',24,'VIP-G-24','VIP'),
  ('Zona Azul','G',25,'VIP-G-25','VIP'),
  ('Zona Azul','G',26,'VIP-G-26','VIP'),
  ('Zona Azul','G',27,'VIP-G-27','VIP'),
  ('Zona Azul','G',28,'VIP-G-28','VIP'),
  ('Zona Azul','G',29,'VIP-G-29','VIP'),
  ('Zona Azul','F',1,'VIP-F-1','VIP'),
  ('Zona Azul','F',2,'VIP-F-2','VIP'),
  ('Zona Azul','F',3,'VIP-F-3','VIP'),
  ('Zona Azul','F',4,'VIP-F-4','VIP'),
  ('Zona Azul','F',5,'VIP-F-5','VIP'),
  ('Zona Azul','F',6,'VIP-F-6','VIP'),
  ('Zona Azul','F',7,'VIP-F-7','VIP'),
  ('Zona Azul','F',8,'VIP-F-8','VIP'),
  ('Zona Azul','F',9,'VIP-F-9','VIP'),
  ('Zona Azul','F',10,'VIP-F-10','VIP'),
  ('Zona Azul','F',11,'VIP-F-11','VIP'),
  ('Zona Azul','F',12,'VIP-F-12','VIP'),
  ('Zona Azul','F',13,'VIP-F-13','VIP'),
  ('Zona Azul','F',14,'VIP-F-14','VIP'),
  ('Zona Azul','F',15,'VIP-F-15','VIP'),
  ('Zona Azul','F',16,'VIP-F-16','VIP'),
  ('Zona Azul','F',17,'VIP-F-17','VIP'),
  ('Zona Azul','F',18,'VIP-F-18','VIP'),
  ('Zona Azul','F',19,'VIP-F-19','VIP'),
  ('Zona Azul','F',20,'VIP-F-20','VIP'),
  ('Zona Azul','F',21,'VIP-F-21','VIP'),
  ('Zona Azul','F',22,'VIP-F-22','VIP'),
  ('Zona Azul','F',23,'VIP-F-23','VIP'),
  ('Zona Azul','F',24,'VIP-F-24','VIP'),
  ('Zona Azul','F',25,'VIP-F-25','VIP'),
  ('Zona Azul','F',26,'VIP-F-26','VIP'),
  ('Zona Azul','F',27,'VIP-F-27','VIP'),
  ('Zona Azul','F',28,'VIP-F-28','VIP'),
  ('Zona Azul','F',29,'VIP-F-29','VIP'),
  ('Zona Azul','E',1,'VIP-E-1','VIP'),
  ('Zona Azul','E',2,'VIP-E-2','VIP'),
  ('Zona Azul','E',3,'VIP-E-3','VIP'),
  ('Zona Azul','E',4,'VIP-E-4','VIP'),
  ('Zona Azul','E',5,'VIP-E-5','VIP'),
  ('Zona Azul','E',6,'VIP-E-6','VIP'),
  ('Zona Azul','E',7,'VIP-E-7','VIP'),
  ('Zona Azul','E',8,'VIP-E-8','VIP'),
  ('Zona Azul','E',9,'VIP-E-9','VIP'),
  ('Zona Azul','E',10,'VIP-E-10','VIP'),
  ('Zona Azul','E',11,'VIP-E-11','VIP'),
  ('Zona Azul','E',12,'VIP-E-12','VIP'),
  ('Zona Azul','E',13,'VIP-E-13','VIP'),
  ('Zona Azul','E',14,'VIP-E-14','VIP'),
  ('Zona Azul','E',15,'VIP-E-15','VIP'),
  ('Zona Azul','E',16,'VIP-E-16','VIP'),
  ('Zona Azul','E',17,'VIP-E-17','VIP'),
  ('Zona Azul','E',18,'VIP-E-18','VIP'),
  ('Zona Azul','E',19,'VIP-E-19','VIP'),
  ('Zona Azul','E',20,'VIP-E-20','VIP'),
  ('Zona Azul','E',21,'VIP-E-21','VIP'),
  ('Zona Azul','E',22,'VIP-E-22','VIP'),
  ('Zona Azul','E',23,'VIP-E-23','VIP'),
  ('Zona Azul','E',24,'VIP-E-24','VIP'),
  ('Zona Azul','E',25,'VIP-E-25','VIP'),
  ('Zona Azul','E',26,'VIP-E-26','VIP'),
  ('Zona Azul','E',27,'VIP-E-27','VIP'),
  ('Zona Azul','E',28,'VIP-E-28','VIP'),
  ('Zona Azul','D',1,'VIP-D-1','VIP'),
  ('Zona Azul','D',2,'VIP-D-2','VIP'),
  ('Zona Azul','D',3,'VIP-D-3','VIP'),
  ('Zona Azul','D',4,'VIP-D-4','VIP'),
  ('Zona Azul','D',5,'VIP-D-5','VIP'),
  ('Zona Azul','D',6,'VIP-D-6','VIP'),
  ('Zona Azul','D',7,'VIP-D-7','VIP'),
  ('Zona Azul','D',8,'VIP-D-8','VIP'),
  ('Zona Azul','D',9,'VIP-D-9','VIP'),
  ('Zona Azul','D',10,'VIP-D-10','VIP'),
  ('Zona Azul','D',11,'VIP-D-11','VIP'),
  ('Zona Azul','D',12,'VIP-D-12','VIP'),
  ('Zona Azul','D',13,'VIP-D-13','VIP'),
  ('Zona Azul','D',14,'VIP-D-14','VIP'),
  ('Zona Azul','D',15,'VIP-D-15','VIP'),
  ('Zona Azul','D',16,'VIP-D-16','VIP'),
  ('Zona Azul','D',17,'VIP-D-17','VIP'),
  ('Zona Azul','D',18,'VIP-D-18','VIP'),
  ('Zona Azul','D',19,'VIP-D-19','VIP'),
  ('Zona Azul','D',20,'VIP-D-20','VIP'),
  ('Zona Azul','D',21,'VIP-D-21','VIP'),
  ('Zona Azul','D',22,'VIP-D-22','VIP'),
  ('Zona Azul','D',23,'VIP-D-23','VIP'),
  ('Zona Azul','D',24,'VIP-D-24','VIP'),
  ('Zona Azul','D',25,'VIP-D-25','VIP'),
  ('Zona Azul','D',26,'VIP-D-26','VIP'),
  ('Zona Azul','D',27,'VIP-D-27','VIP'),
  ('Zona Azul','C',1,'VIP-C-1','VIP'),
  ('Zona Azul','C',2,'VIP-C-2','VIP'),
  ('Zona Azul','C',3,'VIP-C-3','VIP'),
  ('Zona Azul','C',4,'VIP-C-4','VIP'),
  ('Zona Azul','C',5,'VIP-C-5','VIP'),
  ('Zona Azul','C',6,'VIP-C-6','VIP'),
  ('Zona Azul','C',7,'VIP-C-7','VIP'),
  ('Zona Azul','C',8,'VIP-C-8','VIP'),
  ('Zona Azul','C',9,'VIP-C-9','VIP'),
  ('Zona Azul','C',10,'VIP-C-10','VIP'),
  ('Zona Azul','C',11,'VIP-C-11','VIP'),
  ('Zona Azul','C',12,'VIP-C-12','VIP'),
  ('Zona Azul','C',13,'VIP-C-13','VIP'),
  ('Zona Azul','C',14,'VIP-C-14','VIP'),
  ('Zona Azul','C',15,'VIP-C-15','VIP'),
  ('Zona Azul','C',16,'VIP-C-16','VIP'),
  ('Zona Azul','C',17,'VIP-C-17','VIP'),
  ('Zona Azul','C',18,'VIP-C-18','VIP'),
  ('Zona Azul','C',19,'VIP-C-19','VIP'),
  ('Zona Azul','C',20,'VIP-C-20','VIP'),
  ('Zona Azul','C',21,'VIP-C-21','VIP'),
  ('Zona Azul','C',22,'VIP-C-22','VIP'),
  ('Zona Azul','C',23,'VIP-C-23','VIP'),
  ('Zona Azul','C',24,'VIP-C-24','VIP'),
  ('Zona Azul','C',25,'VIP-C-25','VIP'),
  ('Zona Azul','C',26,'VIP-C-26','VIP'),
  ('Zona Roja','B',1,'Exclusivo-B-1','Exclusivo'),
  ('Zona Roja','B',2,'Exclusivo-B-2','Exclusivo'),
  ('Zona Roja','B',3,'Exclusivo-B-3','Exclusivo'),
  ('Zona Roja','B',4,'Exclusivo-B-4','Exclusivo'),
  ('Zona Roja','B',5,'Exclusivo-B-5','Exclusivo'),
  ('Zona Roja','B',6,'Exclusivo-B-6','Exclusivo'),
  ('Zona Roja','B',7,'Exclusivo-B-7','Exclusivo'),
  ('Zona Roja','B',8,'Exclusivo-B-8','Exclusivo'),
  ('Zona Roja','B',9,'Exclusivo-B-9','Exclusivo'),
  ('Zona Roja','B',10,'Exclusivo-B-10','Exclusivo'),
  ('Zona Roja','B',11,'Exclusivo-B-11','Exclusivo'),
  ('Zona Roja','B',12,'Exclusivo-B-12','Exclusivo'),
  ('Zona Roja','B',13,'Exclusivo-B-13','Exclusivo'),
  ('Zona Roja','B',14,'Exclusivo-B-14','Exclusivo'),
  ('Zona Roja','B',15,'Exclusivo-B-15','Exclusivo'),
  ('Zona Roja','B',16,'Exclusivo-B-16','Exclusivo'),
  ('Zona Roja','B',17,'Exclusivo-B-17','Exclusivo'),
  ('Zona Roja','B',18,'Exclusivo-B-18','Exclusivo'),
  ('Zona Roja','B',19,'Exclusivo-B-19','Exclusivo'),
  ('Zona Roja','B',20,'Exclusivo-B-20','Exclusivo'),
  ('Zona Roja','B',21,'Exclusivo-B-21','Exclusivo'),
  ('Zona Roja','B',22,'Exclusivo-B-22','Exclusivo'),
  ('Zona Roja','B',23,'Exclusivo-B-23','Exclusivo'),
  ('Zona Roja','B',24,'Exclusivo-B-24','Exclusivo'),
  ('Zona Roja','B',25,'Exclusivo-B-25','Exclusivo'),
  ('Zona Roja','A',1,'Exclusivo-A-1','Exclusivo'),
  ('Zona Roja','A',2,'Exclusivo-A-2','Exclusivo'),
  ('Zona Roja','A',3,'Exclusivo-A-3','Exclusivo'),
  ('Zona Roja','A',4,'Exclusivo-A-4','Exclusivo'),
  ('Zona Roja','A',5,'Exclusivo-A-5','Exclusivo'),
  ('Zona Roja','A',6,'Exclusivo-A-6','Exclusivo'),
  ('Zona Roja','A',7,'Exclusivo-A-7','Exclusivo'),
  ('Zona Roja','A',8,'Exclusivo-A-8','Exclusivo'),
  ('Zona Roja','A',9,'Exclusivo-A-9','Exclusivo'),
  ('Zona Roja','A',10,'Exclusivo-A-10','Exclusivo'),
  ('Zona Roja','A',11,'Exclusivo-A-11','Exclusivo'),
  ('Zona Roja','A',12,'Exclusivo-A-12','Exclusivo'),
  ('Zona Roja','A',13,'Exclusivo-A-13','Exclusivo'),
  ('Zona Roja','A',14,'Exclusivo-A-14','Exclusivo'),
  ('Zona Roja','A',15,'Exclusivo-A-15','Exclusivo'),
  ('Zona Roja','A',16,'Exclusivo-A-16','Exclusivo'),
  ('Zona Roja','A',17,'Exclusivo-A-17','Exclusivo'),
  ('Zona Roja','A',18,'Exclusivo-A-18','Exclusivo'),
  ('Zona Roja','A',19,'Exclusivo-A-19','Exclusivo'),
  ('Zona Roja','A',20,'Exclusivo-A-20','Exclusivo'),
  ('Zona Roja','A',21,'Exclusivo-A-21','Exclusivo'),
  ('Zona Roja','A',22,'Exclusivo-A-22','Exclusivo'),
  ('Zona Roja','A',23,'Exclusivo-A-23','Exclusivo'),
  ('Zona Roja','A',24,'Exclusivo-A-24','Exclusivo'),
  ('Zona Roja','A',25,'Exclusivo-A-25','Exclusivo'),
  ('Zona Marrón','J',1,'Discapacitados-J-1','Discapacitados'),
  ('Zona Marrón','J',2,'Discapacitados-J-2','Discapacitados'),
  ('Zona Marrón','J',3,'Discapacitados-J-3','Discapacitados'),
  ('Zona Marrón','J',4,'Discapacitados-J-4','Discapacitados'),
  ('Zona Marrón','J',5,'Discapacitados-J-5','Discapacitados'),
  ('Zona Marrón','J',6,'Discapacitados-J-6','Discapacitados')
) as v(section, seat_row, seat_number, seat_label, categoria)
join price_categories pc
  on pc.production_id = 'showman' and pc.nombre = v.categoria;

-- Verificación: aborta (rollback) si los conteos no son los esperados.
do $$
declare n int;
begin
  select count(*) into n from seats where production_id = 'showman';
  if n <> 725 then raise exception 'Se esperaban 725 asientos, hay %', n; end if;
  if (select count(*) from seats s join price_categories pc on pc.id = s.price_category_id
      where s.production_id='showman' and pc.nombre='Preferente') <> 469
  or (select count(*) from seats s join price_categories pc on pc.id = s.price_category_id
      where s.production_id='showman' and pc.nombre='VIP') <> 200
  or (select count(*) from seats s join price_categories pc on pc.id = s.price_category_id
      where s.production_id='showman' and pc.nombre='Exclusivo') <> 50
  or (select count(*) from seats s join price_categories pc on pc.id = s.price_category_id
      where s.production_id='showman' and pc.nombre='Discapacitados') <> 6
  then raise exception 'Conteo por categoría incorrecto'; end if;
end $$;


-- ──────── 0019_performances_date_tbd.sql ────────
-- 0019: permitir funciones con fecha "por definir"
-- Showman tiene funciones confirmadas pero sin fecha/hora todavía. Una función
-- sin fecha se puede crear, pero NO puede ponerse en venta hasta tener fecha.

alter table performances
  alter column starts_at drop not null;

alter table performances
  drop constraint if exists performances_on_sale_requires_date;
alter table performances
  add constraint performances_on_sale_requires_date
  check (not on_sale or starts_at is not null);

-- ──────── 0020_showman_functions_and_prices.sql ────────
-- 0020: Showman — venue, dos funciones (fecha por definir) y precios por función
-- Requiere 0018 (categorías) y 0019 (starts_at nullable). Datos reales:
-- venue Teatro de la Ciudad; precios: Exclusivo $400, VIP $350,
-- Preferente $300, Discapacitados $300. Las funciones quedan sin venta
-- (on_sale=false) y sin fecha; la fecha/hora y la venta se editan desde el panel.


update productions set venue = 'Teatro de la Ciudad' where id = 'showman';

insert into performances (production_id, starts_at, on_sale) values
  ('showman', null, false),
  ('showman', null, false);

insert into performance_price_categories (performance_id, price_category_id, price)
select p.id, pc.id, v.price
from performances p
cross join (values ('Exclusivo',400),('VIP',350),('Preferente',300),('Discapacitados',300)) as v(nombre, price)
join price_categories pc on pc.production_id = 'showman' and pc.nombre = v.nombre
where p.production_id = 'showman';

do $$
begin
  if (select count(*) from performances where production_id='showman') <> 2 then
    raise exception 'Se esperaban 2 funciones de Showman';
  end if;
  if (select count(*) from performance_price_categories ppc
      join performances p on p.id = ppc.performance_id where p.production_id='showman') <> 8 then
    raise exception 'Se esperaban 8 precios (2 funciones x 4 categorías)';
  end if;
end $$;


-- ──────── 0021_seat_map_rpcs.sql ────────
-- 0021: seat map for staff Boletaje
-- 1) seats.lado: which block of the row a seat belongs to (left/center/right)
-- 2) admin_create_seated_order: admin-only sale that works regardless of on_sale
-- 3) admin_cancel_ticket: admin-only, frees a sold seat (history is kept)
-- 4) check_in_ticket: staff/admin QR validation (atomic)

-- ============================================================
-- 1. seats.lado
-- ============================================================
alter table seats
  add column if not exists lado text
  check (lado in ('izquierda','central','derecha'));

-- Cuts per row: (fin_izq, fin_centro). Seats > fin_centro are 'derecha'.
-- Source: supabase/seeds/gen_showman_seats.py
with cuts(seat_row, fin_izq, fin_centro) as (values
  ('X',12,12),('W',12,24),('V',11,22),('U',11,23),('T',11,22),('S',12,24),
  ('R',12,23),('Q',11,23),('P',11,22),('O',11,23),('N',12,23),('M',12,24),
  ('L',11,22),('K',11,23),('J',0,11),
  ('I',11,23),('H',10,21),('G',9,21),('F',10,21),('E',9,21),('D',9,20),
  ('C',8,19),('B',8,19),('A',8,19)
)
update seats s
set lado = case
  when s.seat_number <= c.fin_izq then 'izquierda'
  when s.seat_number <= c.fin_centro then 'central'
  else 'derecha' end
from cuts c
where s.production_id = 'showman'
  and s.seat_row = c.seat_row
  and s.section <> 'Zona Marrón';

-- Discapacitados (J1-J3 left, J4-J6 right), their own price category
update seats s
set lado = case when s.seat_number <= 3 then 'izquierda' else 'derecha' end
where s.production_id = 'showman' and s.section = 'Zona Marrón';

do $$
declare n integer;
begin
  select count(*) into n from seats where production_id = 'showman' and lado is null;
  if n <> 0 then raise exception '0021: % asientos de Showman sin lado', n; end if;
end $$;

-- ============================================================
-- 2. admin_create_seated_order
-- ============================================================
create or replace function admin_create_seated_order(
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
  v_tickets json;
begin
  if not is_admin() then
    raise exception 'No autorizado';
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

  -- Performance must exist. on_sale is NOT required (admin sells at the box office).
  select pf.production_id into v_production_id
  from performances pf where pf.id = target_performance_id;
  if not found then raise exception 'La función no existe'; end if;

  -- Optional seller
  if target_seller_codigo is not null and btrim(target_seller_codigo) <> '' then
    select id into v_seller_id from sellers
    where codigo = upper(btrim(target_seller_codigo));
    if not found then raise exception 'El código de vendedor no existe'; end if;
  end if;

  -- Lock + validate every seat
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
      raise exception 'No existe un precio configurado para uno de los asientos seleccionados'; end if;
  end loop;

  select coalesce(sum(ppc.price), 0) into v_total
  from unnest(target_seat_ids) sid
  join seats s on s.id = sid
  join performance_price_categories ppc
    on ppc.performance_id = target_performance_id
   and ppc.price_category_id = s.price_category_id;

  insert into orders (performance_id, status, buyer_nombre, buyer_telefono,
                      buyer_user_id, total, seller_id, created_by_staff_id,
                      approved_by, approved_at)
  values (target_performance_id, 'aprobado', btrim(target_buyer_nombre),
          btrim(target_buyer_telefono), null, v_total, v_seller_id,
          auth.uid(), auth.uid(), now())
  returning id, order_code into v_order_id, v_order_code;

  insert into tickets (order_id, performance_id, seat_id, unit_price, is_active)
  select v_order_id, target_performance_id, s.id, ppc.price, true
  from unnest(target_seat_ids) sid
  join seats s on s.id = sid
  join performance_price_categories ppc
    on ppc.performance_id = target_performance_id
   and ppc.price_category_id = s.price_category_id;

  select json_agg(json_build_object(
           'ticket_id', t.id, 'seat_id', t.seat_id,
           'seat_label', s.seat_label, 'qr_token', t.qr_token)
         order by s.seat_label)
  into v_tickets
  from tickets t join seats s on s.id = t.seat_id
  where t.order_id = v_order_id;

  return json_build_object('order_id', v_order_id, 'order_code', v_order_code,
                           'total', v_total, 'tickets', v_tickets);
end;
$$;

-- ============================================================
-- 3. admin_cancel_ticket
-- ============================================================
create or replace function admin_cancel_ticket(target_ticket_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seat_id uuid;
begin
  if not is_admin() then raise exception 'No autorizado'; end if;

  update tickets set is_active = false
  where id = target_ticket_id and is_active
  returning seat_id into v_seat_id;

  if not found then
    raise exception 'El boleto no existe o ya está cancelado';
  end if;

  return json_build_object('ticket_id', target_ticket_id, 'seat_id', v_seat_id, 'cancelled', true);
end;
$$;

-- ============================================================
-- 4. check_in_ticket
-- ============================================================
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
  if not is_staff() then raise exception 'No autorizado'; end if;

  begin
    v_token := btrim(target_qr_token)::uuid;
  exception when others then
    return json_build_object('result', 'no_encontrado');
  end;

  select t.id, t.is_active, t.checked_in_at, s.seat_label, pc.nombre as category,
         pf.starts_at, o.buyer_nombre
  into v_ticket
  from tickets t
  join orders o on o.id = t.order_id
  join performances pf on pf.id = t.performance_id
  left join seats s on s.id = t.seat_id
  left join price_categories pc on pc.id = s.price_category_id
  where t.qr_token = v_token;

  if not found then return json_build_object('result', 'no_encontrado'); end if;

  if not v_ticket.is_active then
    return json_build_object('result', 'cancelado', 'seat_label', v_ticket.seat_label,
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

-- ============================================================
-- 5. PRIVILEGES (lesson of 0016: revoke from anon explicitly)
-- ============================================================
revoke execute on function admin_create_seated_order(uuid, text, text, uuid[], text) from public, anon;
revoke execute on function admin_cancel_ticket(uuid) from public, anon;
revoke execute on function check_in_ticket(text) from public, anon;
grant execute on function admin_create_seated_order(uuid, text, text, uuid[], text) to authenticated;
grant execute on function admin_cancel_ticket(uuid) to authenticated;
grant execute on function check_in_ticket(text) to authenticated;

-- ──────── 0022_admin_delete_performance.sql ────────
-- 0022: admin_delete_performance
-- Deletes a function (performance) only when it has NO active tickets.
-- Cancelled tickets (is_active = false) and their orders are history that
-- would otherwise block the delete (orders/tickets -> performances have no
-- cascade), so they are removed together with the function. blocked_seats and
-- performance_price_categories already cascade from performances.

create or replace function admin_delete_performance(target_performance_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_orders integer;
begin
  if not is_admin() then
    raise exception 'No autorizado';
  end if;

  if not exists (select 1 from performances where id = target_performance_id) then
    raise exception 'La función no existe';
  end if;

  if exists (select 1 from tickets
             where performance_id = target_performance_id and is_active) then
    raise exception 'La función tiene boletos activos; cancélalos todos antes de eliminarla';
  end if;

  -- Orders of this function (tickets go with them: tickets.order_id cascades).
  delete from orders where performance_id = target_performance_id;
  get diagnostics v_deleted_orders = row_count;

  delete from performances where id = target_performance_id;

  return json_build_object('deleted', true, 'orders_removed', v_deleted_orders);
end;
$$;

revoke execute on function admin_delete_performance(uuid) from public, anon;
grant execute on function admin_delete_performance(uuid) to authenticated;

-- ──────── 0023_public_checkout.sql ────────
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

-- ──────── 0024_showman_general_zone.sql ────────
-- 0024: Showman — filas R–X pasan de Preferente ($300) a General ($250)
-- Decisión de Johann: J–Q se quedan como Preferente $300; R–X son zona General
-- (verde) a $250 c/u. Se crea la categoría General, se reasignan los asientos de
-- las filas R–X (categoría, zona y etiqueta), y se agrega su precio a cada función
-- de Showman. Los boletos ya vendidos guardan su unit_price, no se afectan; por eso
-- la migración se detiene si hubiera boletos en esas filas (hoy no hay ninguno).


do $$
begin
  if exists (select 1 from tickets t join seats s on s.id = t.seat_id
             where s.production_id = 'showman' and s.seat_row between 'R' and 'X') then
    raise exception 'Hay boletos en filas R–X; revisa antes de recategorizar';
  end if;
end $$;

insert into price_categories (production_id, nombre, descripcion)
values ('showman', 'General', 'Zona verde (filas R–X)')
on conflict (production_id, nombre) do nothing;

update seats s
set price_category_id = (select id from price_categories where production_id = 'showman' and nombre = 'General'),
    section = 'Zona Verde',
    seat_label = regexp_replace(s.seat_label, '^Preferente-', 'General-')
where s.production_id = 'showman'
  and s.seat_row between 'R' and 'X'
  and s.section = 'Zona Rosa';

insert into performance_price_categories (performance_id, price_category_id, price)
select p.id, pc.id, 250
from performances p
join price_categories pc on pc.production_id = 'showman' and pc.nombre = 'General'
where p.production_id = 'showman'
on conflict (performance_id, price_category_id) do update set price = excluded.price;

do $$
begin
  if (select count(*) from seats s join price_categories pc on pc.id = s.price_category_id
      where s.production_id = 'showman' and pc.nombre = 'General') <> 227 then
    raise exception 'Se esperaban 227 asientos General (filas R–X)';
  end if;
  if (select count(*) from seats s join price_categories pc on pc.id = s.price_category_id
      where s.production_id = 'showman' and pc.nombre = 'Preferente') <> 242 then
    raise exception 'Se esperaban 242 asientos Preferente (filas J–Q)';
  end if;
  if exists (select 1 from seats where production_id = 'showman' and seat_row between 'R' and 'X'
             and (section <> 'Zona Verde' or seat_label not like 'General-%')) then
    raise exception 'Filas R–X con zona o etiqueta sin actualizar';
  end if;
  if (select count(*) from performance_price_categories ppc
      join performances p on p.id = ppc.performance_id
      join price_categories pc on pc.id = ppc.price_category_id
      where p.production_id = 'showman' and pc.nombre = 'General' and ppc.price = 250)
     <> (select count(*) from performances where production_id = 'showman') then
    raise exception 'Falta el precio General $250 en alguna función';
  end if;
end $$;


-- ──────── 0025_performance_default_prices.sql ────────
-- 0025: una función nueva hereda los precios de la función más reciente de su
-- producción. Sin precios no se puede comprar (create_seated_ticket_order exige
-- precio por categoría), y el panel "Nueva función" solo inserta la función.
-- Los precios siguen siendo por función: después se pueden ajustar sin afectar a las demás.

create or replace function copy_prices_to_new_performance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src uuid;
begin
  select p.id into v_src
  from performances p
  where p.production_id = new.production_id
    and p.id <> new.id
    and exists (select 1 from performance_price_categories x where x.performance_id = p.id)
  order by p.created_at desc
  limit 1;

  if v_src is not null then
    insert into performance_price_categories (performance_id, price_category_id, price)
    select new.id, ppc.price_category_id, ppc.price
    from performance_price_categories ppc
    where ppc.performance_id = v_src
    on conflict (performance_id, price_category_id) do nothing;
  end if;
  return new;
end;
$$;

revoke execute on function copy_prices_to_new_performance() from public, anon, authenticated;

drop trigger if exists trg_copy_prices_to_new_performance on performances;
create trigger trg_copy_prices_to_new_performance
after insert on performances
for each row execute function copy_prices_to_new_performance();

-- ──────── 0026_public_prices_and_zone_names.sql ────────
-- 0026: precios visibles para el comprador + renombre de zonas de Showman
-- (1) performance_prices_public_read exigía productions.on_sale = true, pero la venta
--     de Showman ya depende de la función (0023, create_seated_ticket_order v2), así que
--     el comprador veía 0 precios: sin colores de zona y con total $0. Se alinea con la
--     regla de venta: función en venta + con fecha + producción no concluida.
-- (2) Renombre de zonas por decisión de Johann (precios sin cambio):
--       Preferente -> Preferente B,  VIP -> Preferente A,  Exclusivo -> VIP
--     Se renombra en ese orden para no chocar con price_categories(production_id, nombre)
--     ni con seats(production_id, seat_label). `section` (Zona Roja/Azul/Rosa...) no cambia.


drop policy if exists performance_prices_public_read on performance_price_categories;
create policy performance_prices_public_read on performance_price_categories
  for select using (
    exists (
      select 1 from performances pf
      join productions pr on pr.id = pf.production_id
      where pf.id = performance_price_categories.performance_id
        and pf.on_sale = true
        and pf.starts_at is not null
        and not pr.concluded
    )
  );

do $$
begin
  if exists (select 1 from price_categories where production_id = 'showman' and nombre in ('Preferente A','Preferente B')) then
    raise exception 'Ya existen categorías Preferente A/B; revisa antes de renombrar';
  end if;
end $$;

-- 1) Preferente -> Preferente B
update price_categories set nombre = 'Preferente B', descripcion = 'Zona rosa (filas J–Q)'
 where production_id = 'showman' and nombre = 'Preferente';
update seats set seat_label = regexp_replace(seat_label, '^Preferente-', 'Preferente B-')
 where production_id = 'showman' and seat_label like 'Preferente-%';

-- 2) VIP -> Preferente A
update price_categories set nombre = 'Preferente A', descripcion = 'Zona azul (filas C–I)'
 where production_id = 'showman' and nombre = 'VIP';
update seats set seat_label = regexp_replace(seat_label, '^VIP-', 'Preferente A-')
 where production_id = 'showman' and seat_label like 'VIP-%';

-- 3) Exclusivo -> VIP
update price_categories set nombre = 'VIP', descripcion = 'Zona roja (filas A–B)'
 where production_id = 'showman' and nombre = 'Exclusivo';
update seats set seat_label = regexp_replace(seat_label, '^Exclusivo-', 'VIP-')
 where production_id = 'showman' and seat_label like 'Exclusivo-%';

do $$
declare r record;
begin
  for r in select * from (values ('VIP',50),('Preferente A',200),('Preferente B',242),('General',227),('Discapacitados',6)) v(n,c) loop
    if (select count(*) from seats s join price_categories pc on pc.id = s.price_category_id
        where s.production_id = 'showman' and pc.nombre = r.n) <> r.c then
      raise exception 'Conteo inesperado para %', r.n;
    end if;
    if (select count(*) from seats s join price_categories pc on pc.id = s.price_category_id
        where s.production_id = 'showman' and pc.nombre = r.n and s.seat_label not like r.n || '-%') <> 0 then
      raise exception 'Etiquetas inconsistentes para %', r.n;
    end if;
  end loop;
  if exists (select 1 from price_categories where production_id = 'showman' and nombre in ('Exclusivo','Preferente')) then
    raise exception 'Quedan nombres antiguos';
  end if;
  if (select count(*) from pg_policies where tablename = 'performance_price_categories' and policyname = 'performance_prices_public_read') <> 1 then
    raise exception 'Falta la política performance_prices_public_read';
  end if;
end $$;


-- ──────── 0027_discount_codes.sql ────────
-- 0027: códigos de descuento
-- Un código define: % de descuento, zonas donde aplica (ninguna = todas), funciones donde
-- aplica (ninguna = todas), vigencia, usos totales y máximo de boletos por orden.
-- "Uso" = una orden pendiente o aprobada con ese código (rechazada/expirada libera el uso).
-- El descuento se calcula SIEMPRE en el servidor (create_seated_ticket_order v3); el cliente
-- solo manda el texto del código. tickets.unit_price guarda el precio ya descontado.
-- Los códigos solo los ve un admin; el comprador valida el suyo con preview_discount_code.


-- ============================================================
-- 1. Tablas
-- ============================================================
create table discount_codes (
  id uuid primary key default gen_random_uuid(),
  production_id text not null references productions(id),
  codigo text not null check (codigo = upper(btrim(codigo)) and length(codigo) between 3 and 30),
  percent numeric(5,2) not null check (percent > 0 and percent <= 100),
  valid_from timestamptz,
  valid_until timestamptz,
  max_uses_total int check (max_uses_total is null or max_uses_total > 0),
  max_tickets_per_order int check (max_tickets_per_order is null or max_tickets_per_order > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (production_id, codigo),
  check (valid_from is null or valid_until is null or valid_from < valid_until)
);

create table discount_code_categories (
  discount_code_id uuid not null references discount_codes(id) on delete cascade,
  price_category_id uuid not null references price_categories(id) on delete cascade,
  primary key (discount_code_id, price_category_id)
);

create table discount_code_performances (
  discount_code_id uuid not null references discount_codes(id) on delete cascade,
  performance_id uuid not null references performances(id) on delete cascade,
  primary key (discount_code_id, performance_id)
);

alter table orders
  add column discount_code_id uuid references discount_codes(id),
  add column discount_codigo text,                       -- copia del texto, para que el comprador lo vea sin leer discount_codes
  add column discount_amount numeric(10,2) not null default 0;

create index idx_orders_discount_code on orders(discount_code_id) where discount_code_id is not null;

-- ============================================================
-- 2. RLS: solo admins leen/escriben las tablas de códigos
-- ============================================================
alter table discount_codes enable row level security;
alter table discount_code_categories enable row level security;
alter table discount_code_performances enable row level security;

create policy discount_codes_admin_all on discount_codes for all using (is_admin()) with check (is_admin());
create policy discount_code_categories_admin_all on discount_code_categories for all using (is_admin()) with check (is_admin());
create policy discount_code_performances_admin_all on discount_code_performances for all using (is_admin()) with check (is_admin());

-- ============================================================
-- 3. RPCs de administración
-- ============================================================
create or replace function admin_save_discount_code(
  target_id uuid,
  target_production_id text,
  target_codigo text,
  target_percent numeric,
  target_valid_from timestamptz,
  target_valid_until timestamptz,
  target_max_uses_total int,
  target_max_tickets_per_order int,
  target_is_active boolean,
  target_category_ids uuid[],
  target_performance_ids uuid[]
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_codigo text := upper(btrim(coalesce(target_codigo, '')));
begin
  if not is_admin() then raise exception 'Solo un admin puede gestionar códigos de descuento'; end if;
  if not exists (select 1 from productions where id = target_production_id) then
    raise exception 'La producción no existe'; end if;
  if v_codigo !~ '^[A-Z0-9_-]{3,30}$' then
    raise exception 'El código debe tener 3–30 caracteres: letras, números, guion o guion bajo'; end if;
  if target_percent is null or target_percent <= 0 or target_percent > 100 then
    raise exception 'El porcentaje debe ser mayor que 0 y máximo 100'; end if;
  if target_valid_from is not null and target_valid_until is not null and target_valid_from >= target_valid_until then
    raise exception 'La fecha de inicio debe ser anterior a la fecha de fin'; end if;

  target_category_ids := coalesce(target_category_ids, '{}');
  target_performance_ids := coalesce(target_performance_ids, '{}');
  if exists (select 1 from unnest(target_category_ids) c
             where not exists (select 1 from price_categories pc where pc.id = c and pc.production_id = target_production_id)) then
    raise exception 'Alguna zona no pertenece a la producción'; end if;
  if exists (select 1 from unnest(target_performance_ids) p
             where not exists (select 1 from performances pf where pf.id = p and pf.production_id = target_production_id)) then
    raise exception 'Alguna función no pertenece a la producción'; end if;

  if target_id is null then
    insert into discount_codes (production_id, codigo, percent, valid_from, valid_until,
                                max_uses_total, max_tickets_per_order, is_active)
    values (target_production_id, v_codigo, target_percent, target_valid_from, target_valid_until,
            target_max_uses_total, target_max_tickets_per_order, coalesce(target_is_active, true))
    returning id into v_id;
  else
    update discount_codes
       set codigo = v_codigo, percent = target_percent, valid_from = target_valid_from,
           valid_until = target_valid_until, max_uses_total = target_max_uses_total,
           max_tickets_per_order = target_max_tickets_per_order,
           is_active = coalesce(target_is_active, true), updated_at = now()
     where id = target_id and production_id = target_production_id
    returning id into v_id;
    if v_id is null then raise exception 'El código no existe'; end if;
  end if;

  delete from discount_code_categories where discount_code_id = v_id;
  insert into discount_code_categories (discount_code_id, price_category_id)
    select distinct v_id, c from unnest(target_category_ids) c;
  delete from discount_code_performances where discount_code_id = v_id;
  insert into discount_code_performances (discount_code_id, performance_id)
    select distinct v_id, p from unnest(target_performance_ids) p;

  return v_id;
exception when unique_violation then
  raise exception 'Ya existe un código "%" en esta producción', v_codigo;
end;
$$;

create or replace function admin_delete_discount_code(target_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'Solo un admin puede gestionar códigos de descuento'; end if;
  if exists (select 1 from orders where discount_code_id = target_id) then
    update discount_codes set is_active = false, updated_at = now() where id = target_id;
    return json_build_object('deleted', false, 'deactivated', true);
  end if;
  delete from discount_codes where id = target_id;
  return json_build_object('deleted', true, 'deactivated', false);
end;
$$;

create or replace function admin_list_discount_codes(target_production_id text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'Solo un admin puede gestionar códigos de descuento'; end if;
  return coalesce((
    select json_agg(json_build_object(
      'id', d.id, 'codigo', d.codigo, 'percent', d.percent,
      'valid_from', d.valid_from, 'valid_until', d.valid_until,
      'max_uses_total', d.max_uses_total, 'max_tickets_per_order', d.max_tickets_per_order,
      'is_active', d.is_active,
      'uses', (select count(*) from orders o where o.discount_code_id = d.id and o.status in ('pendiente','aprobado')),
      'category_ids', coalesce((select json_agg(c.price_category_id) from discount_code_categories c where c.discount_code_id = d.id), '[]'::json),
      'performance_ids', coalesce((select json_agg(p.performance_id) from discount_code_performances p where p.discount_code_id = d.id), '[]'::json)
    ) order by d.created_at)
    from discount_codes d where d.production_id = target_production_id
  ), '[]'::json);
end;
$$;

-- ============================================================
-- 4. Validación compartida (compra y vista previa)
--    Devuelve la fila del código (bloqueada FOR UPDATE si lock) o lanza el motivo.
-- ============================================================
create or replace function _resolve_discount_code(
  p_performance_id uuid, p_production_id text, p_code text, p_lock boolean
) returns discount_codes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dc discount_codes;
  v_codigo text := upper(btrim(coalesce(p_code, '')));
begin
  if p_lock then
    select * into v_dc from discount_codes where production_id = p_production_id and codigo = v_codigo for update;
  else
    select * into v_dc from discount_codes where production_id = p_production_id and codigo = v_codigo;
  end if;
  if not found then raise exception 'El código de descuento no existe'; end if;
  if not v_dc.is_active then raise exception 'El código de descuento no está activo'; end if;
  if v_dc.valid_from is not null and now() < v_dc.valid_from then
    raise exception 'El código de descuento aún no es válido'; end if;
  if v_dc.valid_until is not null and now() > v_dc.valid_until then
    raise exception 'El código de descuento ya venció'; end if;
  if exists (select 1 from discount_code_performances where discount_code_id = v_dc.id)
     and not exists (select 1 from discount_code_performances
                     where discount_code_id = v_dc.id and performance_id = p_performance_id) then
    raise exception 'El código de descuento no aplica a esta función'; end if;
  if v_dc.max_uses_total is not null
     and (select count(*) from orders o where o.discount_code_id = v_dc.id and o.status in ('pendiente','aprobado'))
         >= v_dc.max_uses_total then
    raise exception 'El código de descuento ya se agotó'; end if;
  return v_dc;
end;
$$;
revoke execute on function _resolve_discount_code(uuid, text, text, boolean) from public, anon, authenticated;

create or replace function preview_discount_code(target_performance_id uuid, target_code text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_production_id text;
  v_dc discount_codes;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión para usar un código'; end if;
  select pf.production_id into v_production_id from performances pf where pf.id = target_performance_id;
  if not found then raise exception 'La función no existe'; end if;
  v_dc := _resolve_discount_code(target_performance_id, v_production_id, target_code, false);
  return json_build_object(
    'codigo', v_dc.codigo, 'percent', v_dc.percent,
    'max_tickets_per_order', v_dc.max_tickets_per_order,
    'category_ids', (select json_agg(c.price_category_id) from discount_code_categories c where c.discount_code_id = v_dc.id)
  );
end;
$$;

-- ============================================================
-- 5. create_seated_ticket_order v3 (agrega target_discount_code)
-- ============================================================
drop function if exists create_seated_ticket_order(uuid, text, text, uuid[], text);

create or replace function create_seated_ticket_order(
  target_performance_id uuid,
  target_buyer_nombre text,
  target_buyer_telefono text,
  target_seat_ids uuid[],
  target_seller_codigo text default null,
  target_discount_code text default null
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
  v_gross numeric(10,2);
  v_total numeric(10,2);
  v_discount numeric(10,2) := 0;
  v_seller_id uuid;
  v_labels json;
  v_dc discount_codes;
  v_dc_restricted boolean := false;
  v_percent numeric := 0;
  v_dc_id uuid;
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

  if (select count(*) from orders o
      where o.buyer_user_id = auth.uid() and o.status = 'pendiente') >= 3 then
    raise exception 'Ya tienes 3 solicitudes pendientes de pago; espera a que se aprueben o se cancelen';
  end if;

  if target_seller_codigo is not null and btrim(target_seller_codigo) <> '' then
    select id into v_seller_id from sellers
    where codigo = upper(btrim(target_seller_codigo)) and active;
    if not found then raise exception 'El código de vendedor no existe'; end if;
  end if;

  -- Código de descuento: la fila queda bloqueada hasta el final de la transacción para que
  -- dos compras simultáneas no excedan max_uses_total.
  if target_discount_code is not null and btrim(target_discount_code) <> '' then
    v_dc := _resolve_discount_code(target_performance_id, v_production_id, target_discount_code, true);
    if v_dc.max_tickets_per_order is not null and cardinality(target_seat_ids) > v_dc.max_tickets_per_order then
      raise exception 'Este código permite máximo % boletos por compra', v_dc.max_tickets_per_order;
    end if;
    v_dc_id := v_dc.id;
    v_percent := v_dc.percent;
    v_dc_restricted := exists (select 1 from discount_code_categories where discount_code_id = v_dc.id);
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

  -- Precio por asiento: el de la BD menos el descuento si el asiento es elegible
  -- (sin código, o el código no restringe zonas, o la zona del asiento está permitida).
  select coalesce(sum(ppc.price), 0),
         coalesce(sum(case when v_dc_id is not null
                            and (not v_dc_restricted or exists (select 1 from discount_code_categories dcc
                                 where dcc.discount_code_id = v_dc_id and dcc.price_category_id = s.price_category_id))
                           then round(ppc.price * v_percent / 100, 2) else 0 end), 0)
    into v_gross, v_discount
  from unnest(target_seat_ids) sid
  join seats s on s.id = sid
  join performance_price_categories ppc
    on ppc.performance_id = target_performance_id
   and ppc.price_category_id = s.price_category_id;
  v_total := v_gross - v_discount;

  if v_dc_id is not null and v_discount = 0 then
    raise exception 'El código de descuento no aplica a los asientos seleccionados';
  end if;

  insert into orders (performance_id, status, buyer_nombre, buyer_telefono,
                      buyer_user_id, total, seller_id,
                      discount_code_id, discount_codigo, discount_amount)
  values (target_performance_id, 'pendiente', btrim(target_buyer_nombre),
          btrim(target_buyer_telefono), auth.uid(), v_total, v_seller_id,
          v_dc_id, case when v_dc_id is not null then v_dc.codigo end, v_discount)
  returning id, order_code into v_order_id, v_order_code;

  insert into tickets (order_id, performance_id, seat_id, unit_price, is_active)
  select v_order_id, target_performance_id, s.id,
         ppc.price - case when v_dc_id is not null
                           and (not v_dc_restricted or exists (select 1 from discount_code_categories dcc
                                where dcc.discount_code_id = v_dc_id and dcc.price_category_id = s.price_category_id))
                          then round(ppc.price * v_percent / 100, 2) else 0 end,
         true
  from unnest(target_seat_ids) sid
  join seats s on s.id = sid
  join performance_price_categories ppc
    on ppc.performance_id = target_performance_id
   and ppc.price_category_id = s.price_category_id;

  select json_agg(s.seat_label order by s.seat_label) into v_labels
  from seats s where s.id = any(target_seat_ids);

  return json_build_object('order_id', v_order_id, 'order_code', v_order_code,
                           'status', 'pendiente', 'quantity', cardinality(target_seat_ids),
                           'total', v_total, 'discount_amount', v_discount,
                           'discount_codigo', case when v_dc_id is not null then v_dc.codigo end,
                           'seats', v_labels);
end;
$$;

-- ============================================================
-- 6. Permisos
-- ============================================================
revoke execute on function create_seated_ticket_order(uuid, text, text, uuid[], text, text) from public, anon;
grant execute on function create_seated_ticket_order(uuid, text, text, uuid[], text, text) to authenticated;

revoke execute on function preview_discount_code(uuid, text) from public, anon;
grant execute on function preview_discount_code(uuid, text) to authenticated;

revoke execute on function admin_save_discount_code(uuid, text, text, numeric, timestamptz, timestamptz, int, int, boolean, uuid[], uuid[]) from public, anon;
grant execute on function admin_save_discount_code(uuid, text, text, numeric, timestamptz, timestamptz, int, int, boolean, uuid[], uuid[]) to authenticated;
revoke execute on function admin_delete_discount_code(uuid) from public, anon;
grant execute on function admin_delete_discount_code(uuid) to authenticated;
revoke execute on function admin_list_discount_codes(text) from public, anon;
grant execute on function admin_list_discount_codes(text) to authenticated;

-- ============================================================
-- 7. Comprobaciones
-- ============================================================
do $$
begin
  if (select count(*) from pg_proc where proname = 'create_seated_ticket_order') <> 1 then
    raise exception 'Debe existir una sola create_seated_ticket_order';
  end if;
  if (select count(*) from pg_policies where tablename like 'discount_code%') <> 3 then
    raise exception 'Faltan políticas de discount_code*';
  end if;
end $$;


-- ──────── 0028_gallery.sql ────────
-- 0028: galería de fotos subida desde el panel
-- Bucket público 'gallery' (lectura pública, escritura solo admin) + tabla gallery_photos
-- que guarda el orden y el tipo: 'galeria' (galería pública de la producción) o
-- 'ensayos' (galería de ensayos de la Fan Zone). Ruta: <production_id>/<kind>/<uuid>.jpg


insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gallery', 'gallery', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg','image/png','image/webp'];

create policy gallery_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'gallery' and is_admin());
create policy gallery_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'gallery' and is_admin()) with check (bucket_id = 'gallery' and is_admin());
create policy gallery_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'gallery' and is_admin());

create table gallery_photos (
  id uuid primary key default gen_random_uuid(),
  production_id text not null references productions(id) on delete cascade,
  kind text not null check (kind in ('galeria','ensayos')),
  path text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index idx_gallery_photos_prod on gallery_photos(production_id, kind, sort_order);

alter table gallery_photos enable row level security;
create policy gallery_photos_read on gallery_photos for select using (true);
create policy gallery_photos_admin_write on gallery_photos for all to authenticated
  using (is_admin()) with check (is_admin());

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'gallery' and public) then
    raise exception 'Falta el bucket gallery';
  end if;
  if (select count(*) from pg_policies where tablename = 'gallery_photos') <> 2 then
    raise exception 'Faltan políticas de gallery_photos';
  end if;
end $$;


-- ──────── Registro de migraciones (trazabilidad en DEV) ────────
insert into supabase_migrations.schema_migrations (version, name) values
  ('20261010000001', '0009_helper_functions_and_triggers'),
  ('20261010000002', '0010_rls_policies'),
  ('20261010000003', '0011_ticketing_rpcs'),
  ('20261010000004', '0012_order_expiration'),
  ('20261010000005', '0013_manual_order_management'),
  ('20261010000006', '0014_ticket_pricing'),
  ('20261010000007', '0015_seat_reservation'),
  ('20261010000008', '0016_security_hardening'),
  ('20261010000009', '0017_production_concluded'),
  ('20261010000010', '0018_showman_categories_and_seats'),
  ('20261010000011', '0019_performances_date_tbd'),
  ('20261010000012', '0020_showman_functions_and_prices'),
  ('20261010000013', '0021_seat_map_rpcs'),
  ('20261010000014', '0022_admin_delete_performance'),
  ('20261010000015', '0023_public_checkout'),
  ('20261010000016', '0024_showman_general_zone'),
  ('20261010000017', '0025_performance_default_prices'),
  ('20261010000018', '0026_public_prices_and_zone_names'),
  ('20261010000019', '0027_discount_codes'),
  ('20261010000020', '0028_gallery');

commit;
select 'OK: migraciones 0009–0028 aplicadas en DARF 2.0 DEV' as resultado;
