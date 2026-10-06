-- 0017: productions.concluded
-- Lets an admin mark a production as finished ("concluida"). A concluded
-- production stops appearing in Cartelera and in the staff sales panel, and
-- cannot be on sale. Existing rows default to false, so nothing changes until
-- an admin flips it. Writes are already covered by `productions_admin_write`
-- (admin-only) and reads by `productions_public_read` — no policy change.

alter table productions
  add column if not exists concluded boolean not null default false;

-- A concluded production can never be on sale.
alter table productions
  drop constraint if exists productions_concluded_not_on_sale;
alter table productions
  add constraint productions_concluded_not_on_sale
  check (not (concluded and on_sale));
