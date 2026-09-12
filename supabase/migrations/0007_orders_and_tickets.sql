-- 0007: orders + tickets
-- orders = one purchase/request. Scoped to a PERFORMANCE (funcion), not
-- just a production — the same seat must be sellable once per performance
-- of the same production (e.g. Showman Saturday vs. Showman Sunday), so
-- `production_id` alone is not enough to know which sale this competes
-- with. `production_id` is therefore NOT stored on orders — it's always
-- reachable via performances.production_id, so there is exactly one source
-- of truth and no risk of an order's production/performance disagreeing.
--
-- tickets = one row per individual ticket/QR inside an order — the
-- per-seat QR system today, generalized so a ticket MAY or MAY NOT have a
-- seat (seat_id null = general admission, the default until a seat map
-- exists for a production). tickets.performance_id is DERIVED from the
-- parent order, not settable by a client insert — see
-- sync_and_validate_ticket() in 0009_helper_functions_and_triggers.sql —
-- because that's what lets the anti-double-booking index below live on
-- `tickets` as a plain partial unique index instead of a cross-table check.

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  order_code text not null unique,             -- server-generated, e.g. 'DARF-XXXXXX'
  performance_id uuid not null references performances(id),
  status order_status not null default 'pendiente',
  buyer_nombre text not null,
  buyer_telefono text not null,
  buyer_user_id uuid references auth.users(id),   -- null for anonymous purchase
  total numeric(10,2) not null,                -- always recalculated server-side, never trusted from client
  seller_id uuid references sellers(id),
  created_by_staff_id uuid references auth.users(id),  -- set when staff creates a ticket directly (taquilla)
  approved_by uuid references auth.users(id),
  rejected_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

create index if not exists idx_orders_performance on orders(performance_id);
create index if not exists idx_orders_status on orders(status);
create index if not exists idx_orders_buyer_user on orders(buyer_user_id);

create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  performance_id uuid not null references performances(id),  -- kept in sync with order_id's performance by trigger; not client-settable
  seat_id uuid references seats(id),           -- NULL = general admission (no seat map yet / not applicable)
  qr_token uuid not null unique default gen_random_uuid(),
  is_active boolean not null default true,     -- set false if the parent order is rejected
  checked_in_at timestamptz,
  checked_in_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_tickets_order on tickets(order_id);
create index if not exists idx_tickets_performance on tickets(performance_id);

-- Prevents double-booking of a specific seat WITHIN THE SAME PERFORMANCE:
-- only one ACTIVE ticket can hold a given (performance_id, seat_id) pair at
-- a time. The same physical seat can still be held by a different active
-- ticket in a *different* performance — this index only ever compares rows
-- that share a performance_id. Does not apply to seat_id = null (general
-- admission), which has no such limit.
create unique index if not exists uq_tickets_active_seat_per_performance
  on tickets(performance_id, seat_id)
  where is_active and seat_id is not null;
