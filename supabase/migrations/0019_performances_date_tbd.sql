-- 0019: permitir funciones con fecha "por definir"
-- Showman tiene funciones confirmadas pero sin fecha/hora todavía. Una función
-- sin fecha se puede crear, pero NO puede ponerse en venta hasta tener fecha.

alter table performances
  alter column starts_at drop not null;

alter table performances
  drop constraint if exists performances_on_sale_requires_date;
alter table performances
  add constraint performances_on_sale_requires_date
  check (not on_sale or starts_at is not null);
