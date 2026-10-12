-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV".
-- Aplica la migración 0054 (vencimiento de órdenes). Si la base no es DEV, aborta.
begin;
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
end $$;

alter table orders add column vencida_at timestamptz;

-- Plazo al crear una orden pendiente del público.
create or replace function orders_set_expiry() returns trigger
language plpgsql security definer set search_path = public as $$
declare inicio timestamptz;
begin
  if new.status = 'pendiente' and new.expires_at is null and new.created_by_staff_id is null then
    select starts_at into inicio from performances where id = new.performance_id;
    new.expires_at := greatest(now() + interval '30 minutes',
                               least(now() + interval '24 hours', coalesce(inicio - interval '3 hours', now() + interval '24 hours')));
  end if;
  return new;
end $$;
create trigger orders_set_expiry before insert on orders for each row execute function orders_set_expiry();

-- Libera lo vencido (opcionalmente solo de una obra). Cualquiera con sesión puede llamarla:
-- solo actúa sobre órdenes cuyo plazo ya pasó.
create or replace function expire_due_orders(pid text default null) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with vencidas as (
    update orders o set status = 'rechazado', rejected_at = now(), vencida_at = now()
     where o.status = 'pendiente' and o.expires_at is not null and o.expires_at < now()
       and (pid is null or o.performance_id in (select id from performances where production_id = pid))
    returning o.id
  )
  update tickets t set is_active = false from vencidas v where t.order_id = v.id and t.is_active;
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function orders_set_expiry() from public, anon, authenticated;
revoke execute on function expire_due_orders(text) from public, anon;
grant execute on function expire_due_orders(text) to authenticated;


insert into supabase_migrations.schema_migrations (version, name)
values ('20261012014047', '0054_order_expiry') on conflict do nothing;
commit;
select 'OK: 0054 aplicada en DARF 2.0 DEV' as resultado;
