-- 0002: productions
-- Mirrors DB.productions (js/app.js seedProductions) but with no fixed capacity
-- assumption: capacity is optional metadata, never used to size a seat grid.
-- Rows are NOT seeded here — seeding real production rows is a separate,
-- reviewed step, not part of schema migration.

create table if not exists productions (
  id text primary key,               -- keeps the existing string ids ('showman','mm','hsm')
  nombre text not null,
  venue text,
  fecha text,
  price numeric(10,2) not null default 0,
  capacity int,                       -- optional informational figure only; never assumed by app logic
  on_sale boolean not null default false,
  attendees_historic int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_productions_on_sale on productions(on_sale);
