-- 0025: una función nueva hereda los precios de la función más reciente de su
-- producción. Sin precios no se puede comprar (create_seated_ticket_order exige
-- precio por categoría), y el panel "Nueva función" solo inserta la función.
-- Los precios siguen siendo por función: después se pueden ajustar sin afectar a las demás.

create or replace function copy_prices_to_new_performance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src uuid;
begin
  select p.id into v_src
  from performances p
  where p.production_id = new.production_id
    and p.id <> new.id
    and exists (select 1 from performance_price_categories x where x.performance_id = p.id)
  order by p.created_at desc
  limit 1;

  if v_src is not null then
    insert into performance_price_categories (performance_id, price_category_id, price)
    select new.id, ppc.price_category_id, ppc.price
    from performance_price_categories ppc
    where ppc.performance_id = v_src
    on conflict (performance_id, price_category_id) do nothing;
  end if;
  return new;
end;
$$;

revoke execute on function copy_prices_to_new_performance() from public, anon, authenticated;

drop trigger if exists trg_copy_prices_to_new_performance on performances;
create trigger trg_copy_prices_to_new_performance
after insert on performances
for each row execute function copy_prices_to_new_performance();
