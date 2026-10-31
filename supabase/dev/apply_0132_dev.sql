-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV" (la base de darfproductions.com).
-- 0132: desglose de ventas por zona (boletos y dinero por función y por zona) para Boletos → Ventas.
-- Solo agrega una función de consulta: no cambia ningún dato. Se puede correr más de una vez. Si la base no es DEV,
-- aborta.
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
end $$;
-- 0132 (Diego 2026-10-30): desglose de la venta por zona, arriba de todo en Boletos → Ventas.
--   * Por función y por zona: boletos vendidos (pagados), cortesías, apartados (por aprobar) y el dinero.
--   * El dinero de cada boleto es su parte de lo que pagó la orden (descuentos repartidos según su precio), así la suma
--     de las zonas da exactamente "Ingresos aprobados". Las cortesías cuentan como boletos, con $0.
--   * Una sola consulta para que la tabla salga rápido; la web arma el total de todas las funciones o de una.
-- Precede: 0131.

begin;

create or replace function ventas_por_zona(pid text)
returns table (performance_id uuid, zona_id uuid, vendidos int, cortesias int, apartados int, ingresos numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (has_perm(pid, 'ventas.ver') or has_perm(pid, 'reportes.ver')) then raise exception 'No autorizado'; end if;
  return query
  with b as (
    select t.performance_id, coalesce(s.price_category_id, t.price_category_id) as zona_id, o.status,
           o.metodo_pago is not distinct from 'cortesia' as cortesia,
           -- Parte de la orden que le toca al boleto (por su precio; si todos van en $0, partes iguales).
           case when sum(t.unit_price) over w > 0 then o.total * t.unit_price / sum(t.unit_price) over w
                else o.total / count(*) over w end as parte
      from tickets t
      join orders o on o.id = t.order_id
      join performances pf on pf.id = t.performance_id
      left join seats s on s.id = t.seat_id
     where pf.production_id = pid and t.is_active and o.status in ('aprobado', 'pendiente')
    window w as (partition by t.order_id)
  )
  select b.performance_id, b.zona_id,
         (count(*) filter (where b.status = 'aprobado' and not b.cortesia))::int,
         (count(*) filter (where b.status = 'aprobado' and b.cortesia))::int,
         (count(*) filter (where b.status = 'pendiente'))::int,
         round(coalesce(sum(b.parte) filter (where b.status = 'aprobado'), 0), 2)
    from b
   group by b.performance_id, b.zona_id;
end $$;
revoke all on function ventas_por_zona(text) from public, anon;
grant execute on function ventas_por_zona(text) to authenticated;

commit;

select 'Listo 0132: ventas por zona' as resultado;
