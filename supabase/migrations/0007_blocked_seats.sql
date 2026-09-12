-- 0007: blocked_seats
-- Mirrors DB.blocked today (staff "bloquear asiento" without selling it).
-- Only meaningful once `seats` has real rows for a production; an empty
-- `seats` table simply means this stays empty too — no error, no dependency
-- issue, nothing else in the schema requires rows here.

create table if not exists blocked_seats (
  seat_id uuid primary key references seats(id) on delete cascade,
  blocked_by uuid references auth.users(id),
  blocked_at timestamptz not null default now()
);
