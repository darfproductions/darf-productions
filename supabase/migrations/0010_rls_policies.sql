-- 0010: Row Level Security
-- Enforces the public/authenticated/staff/admin split from the design doc
-- at the database level, so a compromised or hand-edited frontend cannot
-- bypass it.
--
-- Role model: is_staff() is true for BOTH 'staff' and 'admin' — it gates
-- ordinary operational actions (approve orders, block/release seats, scan
-- tickets, manage the catalog). is_admin() is true ONLY for 'admin' — it
-- gates the one deliberately-restricted action: granting or changing a
-- user's role. That is the elevated permission staff must NOT have, since
-- a staff member promoting another account to staff/admin is the same
-- privilege-escalation risk as a user promoting themselves.

alter table productions enable row level security;
alter table performances enable row level security;
alter table seats enable row level security;
alter table orders enable row level security;
alter table tickets enable row level security;
alter table blocked_seats enable row level security;
alter table sellers enable row level security;
alter table contact_messages enable row level security;
alter table profiles enable row level security;

-- productions: public read, staff/admin write
create policy "productions_public_read" on productions
  for select using (true);
create policy "productions_staff_write" on productions
  for all using (is_staff()) with check (is_staff());

-- performances: public read (checkout needs to list which funciones are on
-- sale), staff/admin write (creating a performance, toggling on_sale).
create policy "performances_public_read" on performances
  for select using (true);
create policy "performances_staff_write" on performances
  for all using (is_staff()) with check (is_staff());

-- seats: public read (availability rendering needs section/row/number),
-- staff/admin write. Safe when the table is empty — a public SELECT on an
-- empty table just returns zero rows, nothing errors.
create policy "seats_public_read" on seats
  for select using (true);
create policy "seats_staff_write" on seats
  for all using (is_staff()) with check (is_staff());

-- orders: no public/anon SELECT on the raw table (contains buyer PII).
-- Anonymous order-code lookup and anonymous order creation are handled by
-- SECURITY DEFINER RPCs (a later, separate step) that bypass RLS
-- deliberately and narrowly — not by opening this table up.
create policy "orders_owner_read" on orders
  for select using (buyer_user_id = auth.uid());
create policy "orders_staff_read" on orders
  for select using (is_staff());
create policy "orders_staff_write" on orders
  for all using (is_staff()) with check (is_staff());
-- No insert/update policy for plain authenticated users: order creation,
-- approval, and rejection all go through RPCs, not direct table writes —
-- this is what stops a buyer from editing another buyer's order or their
-- own order's status/total/performance directly.

-- tickets: owner can read their own tickets (via their order), staff/admin
-- can read/write all. No client-side UPDATE policy at all — check-in must
-- go through the authoritative RPC (later step) so two scanners racing on
-- the same QR can't both succeed, and so a fan can never self-mark a
-- ticket used.
create policy "tickets_owner_read" on tickets
  for select using (
    exists (select 1 from orders o where o.id = tickets.order_id and o.buyer_user_id = auth.uid())
  );
create policy "tickets_staff_all" on tickets
  for all using (is_staff()) with check (is_staff());

-- blocked_seats: staff/admin only, both read and write. Key is now
-- (performance_id, seat_id) — a block in one performance never matches a
-- row for another performance of the same seat, so RLS needs no change
-- beyond the underlying key shape already enforcing that scoping.
create policy "blocked_seats_staff_all" on blocked_seats
  for all using (is_staff()) with check (is_staff());

-- sellers: no public SELECT on the full table (would leak all seller codes
-- + names). Code validation for checkout is a SECURITY DEFINER RPC (later
-- step). Staff/admin manage the table directly — seller management is
-- operational, not an admin-exclusive action.
create policy "sellers_staff_all" on sellers
  for all using (is_staff()) with check (is_staff());

-- contact_messages: public can INSERT (the contact form), nobody but
-- staff/admin can SELECT/UPDATE/DELETE (no reading other people's messages
-- back).
create policy "contact_messages_public_insert" on contact_messages
  for insert with check (true);
create policy "contact_messages_staff_read" on contact_messages
  for select using (is_staff());
create policy "contact_messages_staff_write" on contact_messages
  for update using (is_staff()) with check (is_staff());
create policy "contact_messages_staff_delete" on contact_messages
  for delete using (is_staff());

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
-- in particular, only admin can change someone's `rol`. This is the one
-- place staff's "more limited operational permissions" and admin's "full
-- administrative permissions" diverge in this schema.
create policy "profiles_staff_read" on profiles
  for select using (is_staff());
create policy "profiles_admin_write" on profiles
  for all using (is_admin()) with check (is_admin());
