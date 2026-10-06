-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: el contenido de 0025_performance_default_prices.sql en la misma transacción.

do $$
declare p uuid; n_src int; n_new int;
begin
  select count(*) into n_src from performance_price_categories ppc
    join performances pf on pf.id = ppc.performance_id
    where pf.id = (select id from performances where production_id='showman' and exists
      (select 1 from performance_price_categories x where x.performance_id = performances.id)
      order by created_at desc limit 1);
  if n_src = 0 then raise exception 'FALLO T0: no hay función origen con precios'; end if;

  -- T1: función nueva hereda todos los precios
  insert into performances (production_id, starts_at, on_sale) values ('showman', now() + interval '40 days', false) returning id into p;
  select count(*) into n_new from performance_price_categories where performance_id = p;
  if n_new <> n_src then raise exception 'FALLO T1: heredó % de % precios', n_new, n_src; end if;

  -- T2: producción sin funciones con precio no falla (queda sin precios)
  insert into productions (id, nombre, venue, price, capacity, on_sale)
    values ('t_prod','Test','X',100,10,false);
  insert into performances (production_id, starts_at, on_sale) values ('t_prod', now() + interval '5 days', false) returning id into p;
  if exists (select 1 from performance_price_categories where performance_id = p) then raise exception 'FALLO T2'; end if;
end $$;

do $$ begin raise exception 'OK: TODAS LAS PRUEBAS PASARON (se aborta a proposito para no persistir)'; end $$;
