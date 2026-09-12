-- 0009: Row Level Security
-- Enforces the public/authenticated/staff split from the design doc at the
-- database level, so a compromised or hand-edited frontend cannot bypass it.

alter table productions enable row level security;
alter table seats enable row level security;
alter table orders enable row level security;
alter table tickets enable row level security;
alter table blocked_seats enable row level security;
alter table sellers enable row level security;
alter table contact_messages enable row level security;
alter table profiles enable row level security;

-- productions: public read, staff write
create policy "productions_public_read" on productions
  for select using (true);
create policy "productions_staff_write" on productions
  for all using (is_staff()) with check (is_staff());

-- seats: public read (availability rendering needs section/row/number),
-- staff write. Safe when the table is empty — a public SELECT on an empty
-- table just returns zero rows, nothing errors.
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
-- own order's status/total directly.

-- tickets: owner can read their own tickets (via their order), staff can
-- read/write all. No client-side UPDATE policy at all — check-in must go
-- through the authoritative RPC (later step) so two scanners racing on the
-- same QR can't both succeed, and so a fan can never self-mark a ticket used.
create policy "tickets_owner_read" on tickets
  for select using (
    exists (select 1 from orders o where o.id = tickets.order_id and o.buyer_user_id = auth.uid())
  );
create policy "tickets_staff_all" on tickets
  for all using (is_staff()) with check (is_staff());

-- blocked_seats: staff-only, both read and write.
create policy "blocked_seats_staff_all" on blocked_seats
  for all using (is_staff()) with check (is_staff());

-- sellers: no public SELECT on the full table (would leak all seller codes
-- + names). Code validation for checkout is a SECURITY DEFINER RPC (later
-- step). Staff manage the table directly.
create policy "sellers_staff_all" on sellers
  for all using (is_staff()) with check (is_staff());

-- contact_messages: public can INSERT (the contact form), nobody but staff
-- can SELECT/UPDATE/DELETE (no reading other people's messages back).
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
create policy "profiles_staff_read" on profiles
  for select using (is_staff());
create policy "profiles_staff_write" on profiles
  for all using (is_staff()) with check (is_staff());
