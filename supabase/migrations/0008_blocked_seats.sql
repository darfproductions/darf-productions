-- 0008: blocked_seats
-- Mirrors DB.blocked today (staff "bloquear asiento" without selling it) —
-- but a block is specific to a PERFORMANCE, not the production as a whole:
-- blocking seat A1 for Saturday's show must not block A1 for Sunday's show.
-- Primary key is the (performance_id, seat_id) pair, not seat_id alone.
--
-- Only meaningful once `seats`/`performances` have real rows for a
-- production; empty tables simply mean this stays empty too — no error, no
-- dependency issue, nothing else in the schema requires rows here.

create table if not exists blocked_seats (
  performance_id uuid not null references performances(id) on delete cascade,
  seat_id uuid not null references seats(id) on delete cascade,
  blocked_by uuid references auth.users(id),
  blocked_at timestamptz not null default now(),
  primary key (performance_id, seat_id)
);

create index if not exists idx_blocked_seats_performance on blocked_seats(performance_id);
