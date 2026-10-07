-- Ejecutar DESPUÉS de aplicar 0026, en una transacción que termina abortada (no persiste nada).
-- Termina con un error intencional "OK: ..." si todo pasa.

do $$
declare p_on uuid; p_off uuid; n_on int; n_off int;
begin
  -- Contexto: una función en venta (con fecha) y una sin venta, con precios
  insert into performances (production_id, starts_at, on_sale) values ('showman', now() + interval '50 days', true)  returning id into p_on;
  insert into performances (production_id, starts_at, on_sale) values ('showman', now() + interval '51 days', false) returning id into p_off;
  -- (el trigger de 0025 copia los precios a ambas)

  set local role anon;
  select count(*) into n_on  from performance_price_categories where performance_id = p_on;
  select count(*) into n_off from performance_price_categories where performance_id = p_off;
  reset role;

  if n_on <> 5 then raise exception 'FALLO T1: anon ve % precios de función en venta (esperado 5)', n_on; end if;
  if n_off <> 0 then raise exception 'FALLO T2: anon ve % precios de función sin venta (esperado 0)', n_off; end if;

  -- T3: nombres nuevos con sus precios
  if (select string_agg(pc.nombre || '=' || ppc.price::int, ',' order by pc.nombre)
        from performance_price_categories ppc join price_categories pc on pc.id = ppc.price_category_id
        where ppc.performance_id = p_on)
     <> 'Discapacitados=300,General=250,Preferente A=350,Preferente B=300,VIP=400' then
    raise exception 'FALLO T3: precios/nombres inesperados';
  end if;

  raise exception 'OK: TODAS LAS PRUEBAS PASARON (se aborta a propósito para no persistir)';
end $$;
