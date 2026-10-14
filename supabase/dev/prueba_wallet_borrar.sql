-- DARF 2.0 — base oficial. Borra el boleto de PRUEBA de Wallet (obra "Prueba Wallet", su función y orden).
begin;
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0. No se ejecutó nada.';
  end if;
end $$;
delete from tickets where order_id in (select o.id from orders o join performances f on f.id = o.performance_id where f.production_id = 'prueba-wallet');
delete from orders where performance_id in (select id from performances where production_id = 'prueba-wallet');
delete from productions where id = 'prueba-wallet';  -- borra también su función
select 'Borrado. Quedan ' || (select count(*) from productions where id = 'prueba-wallet') || ' obras de prueba y '
       || (select count(*) from performances where production_id = 'prueba-wallet') || ' funciones de prueba.' as resultado;
commit;
