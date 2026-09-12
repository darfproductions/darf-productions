-- 0004: seats
-- Physical seat map, scoped to the PRODUCTION (the venue's seats don't
-- change between performances of the same production) — not to a
-- performance. Availability/selling of a seat is scoped per-performance
-- instead, via `tickets.performance_id` (0007) and `blocked_seats` (0008).
--
-- Deliberately created EMPTY. No rows, no hardcoded rows/sections/capacity.
-- Real seat maps get loaded later, per production, once the venue plan is
-- confirmed — via a separate, reviewed seed migration (not part of this file).
-- Nothing downstream (orders, tickets, availability) requires this table to
-- have any rows: a ticket can exist with seat_id = null (general admission)
-- until real seats are seeded.

create table if not exists seats (
  id uuid primary key default gen_random_uuid(),
  production_id text not null references productions(id) on delete cascade,
  section text,                  -- e.g. 'Piso', 'Balcón A' — null if the venue has no sections
  seat_row text,                 -- as printed on the physical ticket, e.g. 'A'
  seat_number int check (seat_number is null or seat_number > 0),
  seat_label text not null,      -- human-readable label shown to staff/fan, e.g. 'Piso-A-12'
  is_active boolean not null default true,  -- lets staff retire a seat without deleting history
  created_at timestamptz not null default now()
);

create unique index if not exists uq_seats_production_label on seats(production_id, seat_label);
create index if not exists idx_seats_production on seats(production_id);
