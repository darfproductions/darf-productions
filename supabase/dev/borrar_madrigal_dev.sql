-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV" (la base de darfproductions.com).
-- Borra POR COMPLETO la producción "La Familia Madrigal" (Diego, 2026-11-05: "borra todo lo de Madrigal
-- definitivamente"): funciones, boletos y órdenes, audiciones e inscripciones, ensayos, elenco, página, Fan Zone…
-- Las cuentas y fichas de las personas se conservan. NO SE PUEDE DESHACER.
-- Seguro: solo borra si encuentra exactamente UNA obra cuyo nombre contenga "Madrigal"; si no, aborta sin tocar nada.
-- Al final muestra cuánto se borró.
do $$
declare n int; pid text; nom text; n_ord int; n_aud int; n_app int;
begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
  select count(*) into n from productions where nombre ilike '%madrigal%';
  if n <> 1 then raise exception 'ABORTADO: encontré % obras con "Madrigal" en el nombre (esperaba 1). No se borró nada.', n; end if;
  select id, nombre into pid, nom from productions where nombre ilike '%madrigal%';
  select count(*) into n_ord from orders r join performances f on f.id = r.performance_id where f.production_id = pid;
  select count(*) into n_aud from auditions where production_id = pid;
  select count(*) into n_app from audition_applications a join auditions au on au.id = a.audition_id where au.production_id = pid;
  -- Lo que tiene candados o no se va solo en cascada, primero.
  delete from audition_applications where audition_id in (select id from auditions where production_id = pid);
  delete from evento_ordenes where encuentro_id in (select id from fan_encuentros where production_id = pid);
  delete from discount_codes where production_id = pid;
  delete from productions where id = pid;
  insert into audit_log (tabla, accion, production_id, antes, despues)
  values ('productions', 'borrar_obra', null,
          jsonb_build_object('id', pid, 'nombre', nom, 'ordenes', n_ord, 'audiciones', n_aud, 'solicitudes', n_app, 'via', 'script DEV'), null);
  raise notice 'Borrada "%" (%): % órdenes, % audiciones, % solicitudes.', nom, pid, n_ord, n_aud, n_app;
end $$;

select 'Listo: La Familia Madrigal borrada' as resultado
 where not exists (select 1 from productions where nombre ilike '%madrigal%');
