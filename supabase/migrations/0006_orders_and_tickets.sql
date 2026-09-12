-- 0006: orders + tickets
-- orders = one purchase/request (mirrors DB.orders header fields).
-- tickets = one row per individual ticket/QR inside an order — this is the
-- per-seat QR system today, generalized so a ticket MAY or MAY NOT have a
-- seat. While `seats` is empty (no venue confirmed), tickets are created
-- with seat_id = null (general admission) and the app treats each ticket
-- row as one admission unit. Nothing here requires `seats` to be populated.

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  order_code text not null unique,             -- server-generated, e.g. 'DARF-XXXXXX'
  production_id text not null references productions(id),
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

create index if not exists idx_orders_production on orders(production_id);
create index if not exists idx_orders_status on orders(status);
create index if not exists idx_orders_buyer_user on orders(buyer_user_id);

create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  seat_id uuid references seats(id),           -- NULL = general admission (no seat map yet / not applicable)
  qr_token uuid not null unique default gen_random_uuid(),
  is_active boolean not null default true,     -- set false if the parent order is rejected
  checked_in_at timestamptz,
  checked_in_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_tickets_order on tickets(order_id);

-- Prevents double-booking of a specific seat: only one ACTIVE ticket can
-- hold a given seat at a time. Does not apply to seat_id = null (general
-- admission), which has no such limit.
create unique index if not exists uq_tickets_active_seat
  on tickets(seat_id)
  where is_active and seat_id is not null;
