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
