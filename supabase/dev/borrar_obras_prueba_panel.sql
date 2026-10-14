-- DARF 2.0 — base oficial. Borra las dos obras de prueba creadas desde el panel el 14 oct 2026:
-- "Prueba Wallet" (prueba-wallet) y "Mamma Mia! Prueba Wallet" (mamma-mia-prueba-wallet-2027).
-- Con la obra se borran sus funciones, zonas, créditos, canciones y avisos; las fichas de personas se quedan.
begin;
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0. No se ejecutó nada.';
  end if;
end $$;
create temp table obras_prueba on commit drop as
  select id from productions where id in ('prueba-wallet', 'mamma-mia-prueba-wallet-2027');
delete from tickets where order_id in (select o.id from orders o join performances f on f.id = o.performance_id where f.production_id in (select id from obras_prueba));
delete from orders where performance_id in (select id from performances where production_id in (select id from obras_prueba));
delete from productions where id in (select id from obras_prueba);
select 'Obras: ' || (select string_agg(nombre || ' (' || estado || ')', ', ' order by created_at) from productions)
       || ' · Créditos: ' || (select count(*) from production_credits)
       || ' · Funciones: ' || (select count(*) from performances) as resultado;
commit;
