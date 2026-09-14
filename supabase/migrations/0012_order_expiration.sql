-- 0012: order expiration
--
-- Adds an expiration timestamp to pending orders.
-- This will later be used to release tickets from unpaid orders.

alter table orders
add column if not exists expires_at timestamptz;

create index if not exists idx_orders_expires_at
on orders(expires_at)
where status = 'pendiente';
