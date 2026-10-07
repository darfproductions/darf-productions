-- 0026: precios visibles para el comprador + renombre de zonas de Showman
-- (1) performance_prices_public_read exigía productions.on_sale = true, pero la venta
--     de Showman ya depende de la función (0023, create_seated_ticket_order v2), así que
--     el comprador veía 0 precios: sin colores de zona y con total $0. Se alinea con la
--     regla de venta: función en venta + con fecha + producción no concluida.
-- (2) Renombre de zonas por decisión de Johann (precios sin cambio):
--       Preferente -> Preferente B,  VIP -> Preferente A,  Exclusivo -> VIP
--     Se renombra en ese orden para no chocar con price_categories(production_id, nombre)
--     ni con seats(production_id, seat_label). `section` (Zona Roja/Azul/Rosa...) no cambia.

begin;

drop policy if exists performance_prices_public_read on performance_price_categories;
create policy performance_prices_public_read on performance_price_categories
  for select using (
    exists (
      select 1 from performances pf
      join productions pr on pr.id = pf.production_id
      where pf.id = performance_price_categories.performance_id
        and pf.on_sale = true
        and pf.starts_at is not null
        and not pr.concluded
    )
  );

do $$
begin
  if exists (select 1 from price_categories where production_id = 'showman' and nombre in ('Preferente A','Preferente B')) then
    raise exception 'Ya existen categorías Preferente A/B; revisa antes de renombrar';
  end if;
end $$;

-- 1) Preferente -> Preferente B
update price_categories set nombre = 'Preferente B', descripcion = 'Zona rosa (filas J–Q)'
 where production_id = 'showman' and nombre = 'Preferente';
update seats set seat_label = regexp_replace(seat_label, '^Preferente-', 'Preferente B-')
 where production_id = 'showman' and seat_label like 'Preferente-%';

-- 2) VIP -> Preferente A
update price_categories set nombre = 'Preferente A', descripcion = 'Zona azul (filas C–I)'
 where production_id = 'showman' and nombre = 'VIP';
update seats set seat_label = regexp_replace(seat_label, '^VIP-', 'Preferente A-')
 where production_id = 'showman' and seat_label like 'VIP-%';

-- 3) Exclusivo -> VIP
update price_categories set nombre = 'VIP', descripcion = 'Zona roja (filas A–B)'
 where production_id = 'showman' and nombre = 'Exclusivo';
update seats set seat_label = regexp_replace(seat_label, '^Exclusivo-', 'VIP-')
 where production_id = 'showman' and seat_label like 'Exclusivo-%';

do $$
declare r record;
begin
  for r in select * from (values ('VIP',50),('Preferente A',200),('Preferente B',242),('General',227),('Discapacitados',6)) v(n,c) loop
    if (select count(*) from seats s join price_categories pc on pc.id = s.price_category_id
        where s.production_id = 'showman' and pc.nombre = r.n) <> r.c then
      raise exception 'Conteo inesperado para %', r.n;
    end if;
    if (select count(*) from seats s join price_categories pc on pc.id = s.price_category_id
        where s.production_id = 'showman' and pc.nombre = r.n and s.seat_label not like r.n || '-%') <> 0 then
      raise exception 'Etiquetas inconsistentes para %', r.n;
    end if;
  end loop;
  if exists (select 1 from price_categories where production_id = 'showman' and nombre in ('Exclusivo','Preferente')) then
    raise exception 'Quedan nombres antiguos';
  end if;
  if (select count(*) from pg_policies where tablename = 'performance_price_categories' and policyname = 'performance_prices_public_read') <> 1 then
    raise exception 'Falta la política performance_prices_public_read';
  end if;
end $$;

commit;
