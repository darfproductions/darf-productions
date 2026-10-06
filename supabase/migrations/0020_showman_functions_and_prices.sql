-- 0020: Showman — venue, dos funciones (fecha por definir) y precios por función
-- Requiere 0018 (categorías) y 0019 (starts_at nullable). Datos reales:
-- venue Teatro de la Ciudad; precios: Exclusivo $400, VIP $350,
-- Preferente $300, Discapacitados $300. Las funciones quedan sin venta
-- (on_sale=false) y sin fecha; la fecha/hora y la venta se editan desde el panel.

begin;

update productions set venue = 'Teatro de la Ciudad' where id = 'showman';

insert into performances (production_id, starts_at, on_sale) values
  ('showman', null, false),
  ('showman', null, false);

insert into performance_price_categories (performance_id, price_category_id, price)
select p.id, pc.id, v.price
from performances p
cross join (values ('Exclusivo',400),('VIP',350),('Preferente',300),('Discapacitados',300)) as v(nombre, price)
join price_categories pc on pc.production_id = 'showman' and pc.nombre = v.nombre
where p.production_id = 'showman';

do $$
begin
  if (select count(*) from performances where production_id='showman') <> 2 then
    raise exception 'Se esperaban 2 funciones de Showman';
  end if;
  if (select count(*) from performance_price_categories ppc
      join performances p on p.id = ppc.performance_id where p.production_id='showman') <> 8 then
    raise exception 'Se esperaban 8 precios (2 funciones x 4 categorías)';
  end if;
end $$;

commit;
