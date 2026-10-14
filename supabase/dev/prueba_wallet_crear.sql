-- DARF 2.0 — base oficial. Boleto de PRUEBA para Wallet (2026-10-14), solo para la cuenta del Director.
-- Crea una obra privada "Prueba Wallet" (borrador: no sale en la página) con los colores e imágenes de
-- Showman, una función en 7 días y una orden aprobada con 1 boleto a nombre del Director (el folio lo pone la base).
-- Se borra todo con supabase/dev/prueba_wallet_borrar.sql.
begin;
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0. No se ejecutó nada.';
  end if;
  if exists (select 1 from productions where id = 'prueba-wallet') then
    raise exception 'ABORTADO: la prueba ya existe. Bórrala primero con prueba_wallet_borrar.sql.';
  end if;
end $$;

insert into productions (id, nombre, estado, color_fondo, color_superficie, color_texto, color_acento, logo_path, ambiente_path, frase)
select 'prueba-wallet', 'Prueba Wallet', 'borrador', color_fondo, color_superficie, color_texto, color_acento, logo_path, ambiente_path, frase
  from productions where id = 'showman';

with f as (
  insert into performances (production_id, starts_at, venue)
  values ('prueba-wallet', date_trunc('hour', now()) + interval '7 days', 'Teatro de prueba')
  returning id
), o as (
  insert into orders (order_code, performance_id, buyer_nombre, buyer_telefono, total, status, buyer_user_id)
  select 'PRUEBA', f.id, coalesce(p.nombre, 'DARF Productions'), '4420000000', 0, 'aprobado', p.id
    from f, profiles p where p.rol = 'admin'
  returning id, performance_id
)
insert into tickets (order_id, performance_id, unit_price) select o.id, o.performance_id, 0 from o;

select 'Listo: ' || count(*) || ' boleto de prueba, orden ' || min(o.order_code) || ' (' || min(o.status::text) || ').' as resultado
  from tickets t join orders o on o.id = t.order_id join performances f on f.id = o.performance_id
 where f.production_id = 'prueba-wallet';
commit;
