-- 0022: admin_delete_performance
-- Deletes a function (performance) only when it has NO active tickets.
-- Cancelled tickets (is_active = false) and their orders are history that
-- would otherwise block the delete (orders/tickets -> performances have no
-- cascade), so they are removed together with the function. blocked_seats and
-- performance_price_categories already cascade from performances.

create or replace function admin_delete_performance(target_performance_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_orders integer;
begin
  if not is_admin() then
    raise exception 'No autorizado';
  end if;

  if not exists (select 1 from performances where id = target_performance_id) then
    raise exception 'La función no existe';
  end if;

  if exists (select 1 from tickets
             where performance_id = target_performance_id and is_active) then
    raise exception 'La función tiene boletos activos; cancélalos todos antes de eliminarla';
  end if;

  -- Orders of this function (tickets go with them: tickets.order_id cascades).
  delete from orders where performance_id = target_performance_id;
  get diagnostics v_deleted_orders = row_count;

  delete from performances where id = target_performance_id;

  return json_build_object('deleted', true, 'orders_removed', v_deleted_orders);
end;
$$;

revoke execute on function admin_delete_performance(uuid) from public, anon;
grant execute on function admin_delete_performance(uuid) to authenticated;
