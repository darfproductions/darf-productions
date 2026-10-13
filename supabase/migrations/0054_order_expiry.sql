-- 0054: vencimiento de órdenes pendientes (Fase 4, bloque 4A; decisiones de Diego, 2026-10-12).
--   * Plazo para pagar: 24 horas, pero nunca después de 3 horas antes de la función.
--     Si se compra muy cerca de la función, se dan al menos 30 minutos.
--   * Al vencer: los boletos se desactivan (el asiento queda libre), la orden pasa a
--     'rechazado' con vencida_at (se muestra como "Vencida") y libera su uso del código
--     de descuento. No se agregó un estado nuevo para no romper lo que ya lee 'rechazado'.
--   * Sin programador (decisión de Diego): expire_due_orders() se llama antes de mostrar
--     el mapa, al comprar, al vender en taquilla y al abrir órdenes en el panel. Las
--     funciones de compra (create_seated_ticket_order, admin_create_seated_order) NO se
--     reescriben (visión §8.2).
--   * Las ventas de taquilla nacen aprobadas: no vencen. Las órdenes que ya existían no
--     reciben plazo (expires_at null = no vence).
-- Precede: 0053. Cambia la lógica de inventario (aprobado por Diego).

begin;

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

commit;
