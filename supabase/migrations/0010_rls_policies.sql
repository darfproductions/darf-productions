-- 0010: Row Level Security
-- Enforces the public/authenticated/staff/admin split from the design doc
-- at the database level, so a compromised or hand-edited frontend cannot
-- bypass it.
--
-- Role model: 'staff' has read-only internal visibility (panel data, orders,
-- tickets, profiles, sellers, blocked_seats) plus check-in and
-- contact-message triage (read + mark-read). 'admin' is a strict superset:
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
-- read-only visibility, admin has full write ("Gestionar tickets").
-- Check-in is the one staff-writable exception: it's an operational scan
-- action, not ticket management, and races between two scanners must be
-- resolved by the authoritative check-in RPC (later step), not by this
-- policy — so staff gets UPDATE restricted to the check-in columns only via
-- that RPC path, not a blanket table policy.
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
-- and mark messages as read (day-to-day triage) but cannot delete history;
-- deleting is admin-only.
create policy "contact_messages_public_insert" on contact_messages
  for insert with check (true);
create policy "contact_messages_staff_read" on contact_messages
  for select using (is_staff());
create policy "contact_messages_staff_mark_read" on contact_messages
  for update using (is_staff()) with check (is_staff());
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
