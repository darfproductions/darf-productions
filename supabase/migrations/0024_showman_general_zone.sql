-- 0024: Showman — filas R–X pasan de Preferente ($300) a General ($250)
-- Decisión de Johann: J–Q se quedan como Preferente $300; R–X son zona General
-- (verde) a $250 c/u. Se crea la categoría General, se reasignan los asientos de
-- las filas R–X (categoría, zona y etiqueta), y se agrega su precio a cada función
-- de Showman. Los boletos ya vendidos guardan su unit_price, no se afectan; por eso
-- la migración se detiene si hubiera boletos en esas filas (hoy no hay ninguno).

begin;

do $$
begin
  if exists (select 1 from tickets t join seats s on s.id = t.seat_id
             where s.production_id = 'showman' and s.seat_row between 'R' and 'X') then
    raise exception 'Hay boletos en filas R–X; revisa antes de recategorizar';
  end if;
end $$;

insert into price_categories (production_id, nombre, descripcion)
values ('showman', 'General', 'Zona verde (filas R–X)')
on conflict (production_id, nombre) do nothing;

update seats s
set price_category_id = (select id from price_categories where production_id = 'showman' and nombre = 'General'),
    section = 'Zona Verde',
    seat_label = regexp_replace(s.seat_label, '^Preferente-', 'General-')
where s.production_id = 'showman'
  and s.seat_row between 'R' and 'X'
  and s.section = 'Zona Rosa';

insert into performance_price_categories (performance_id, price_category_id, price)
select p.id, pc.id, 250
from performances p
join price_categories pc on pc.production_id = 'showman' and pc.nombre = 'General'
where p.production_id = 'showman'
on conflict (performance_id, price_category_id) do update set price = excluded.price;

do $$
begin
  if (select count(*) from seats s join price_categories pc on pc.id = s.price_category_id
      where s.production_id = 'showman' and pc.nombre = 'General') <> 227 then
    raise exception 'Se esperaban 227 asientos General (filas R–X)';
  end if;
  if (select count(*) from seats s join price_categories pc on pc.id = s.price_category_id
      where s.production_id = 'showman' and pc.nombre = 'Preferente') <> 242 then
    raise exception 'Se esperaban 242 asientos Preferente (filas J–Q)';
  end if;
  if exists (select 1 from seats where production_id = 'showman' and seat_row between 'R' and 'X'
             and (section <> 'Zona Verde' or seat_label not like 'General-%')) then
    raise exception 'Filas R–X con zona o etiqueta sin actualizar';
  end if;
  if (select count(*) from performance_price_categories ppc
      join performances p on p.id = ppc.performance_id
      join price_categories pc on pc.id = ppc.price_category_id
      where p.production_id = 'showman' and pc.nombre = 'General' and ppc.price = 250)
     <> (select count(*) from performances where production_id = 'showman') then
    raise exception 'Falta el precio General $250 en alguna función';
  end if;
end $$;

commit;
