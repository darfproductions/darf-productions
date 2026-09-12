-- 0003: performances
-- A production (e.g. "Showman") can have multiple performances/funciones
-- (e.g. Saturday show, Sunday show). Seat availability and sales are scoped
-- to a performance, not to the production as a whole — the same physical
-- seat is sold once per performance, not once per production.
--
-- No rows are inserted here. No date, venue, or performance is hardcoded —
-- productions currently have zero performances until staff/admin creates
-- them (via a later, separate step), same as `seats` in 0004.

create table if not exists performances (
  id uuid primary key default gen_random_uuid(),
  production_id text not null references productions(id) on delete cascade,
  starts_at timestamptz not null,
  venue text,                          -- optional: overrides/supplements productions.venue if a performance runs elsewhere
  on_sale boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_performances_production on performances(production_id);
create index if not exists idx_performances_on_sale on performances(on_sale);
