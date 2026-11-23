-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV" (la base de darfproductions.com).
-- Teatros (Diego 2026-11-23): donde hoy dice "Teatro de prueba":
--   * High School Musical (hsm) → "Teatro Humanitas Querétaro"
--   * Mamma Mia! (mm)           → "Teatro UVM Querétaro"
-- Cambia el teatro de la obra, el de sus funciones que decían "Teatro de prueba" y el de su borrador de Página (si lo
-- hay), para que no regrese al publicar. No toca funciones que ya tengan otro teatro. Se puede correr más de una vez.
-- Si la base no es DEV, aborta sin cambiar nada.
do $$
declare cambio record;
begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
  for cambio in select * from (values ('hsm', 'Teatro Humanitas Querétaro'), ('mm', 'Teatro UVM Querétaro')) v(pid, teatro) loop
    if not exists (select 1 from productions where id = cambio.pid) then
      raise notice 'OJO: no encontré la obra "%"; no se cambió.', cambio.pid;
      continue;
    end if;
    update productions set venue = cambio.teatro
     where id = cambio.pid and (venue is null or btrim(venue) = '' or venue ilike '%prueba%');
    update performances set venue = cambio.teatro
     where production_id = cambio.pid and venue ilike '%prueba%';
    update obra_borradores set borrador = jsonb_set(borrador, '{venue}', to_jsonb(cambio.teatro))
     where production_id = cambio.pid and seccion = 'datos' and borrador ? 'venue' and borrador->>'venue' ilike '%prueba%';
    update obra_borradores set fans = jsonb_set(fans, '{venue}', to_jsonb(cambio.teatro))
     where production_id = cambio.pid and seccion = 'datos' and fans ? 'venue' and fans->>'venue' ilike '%prueba%';
  end loop;
end $$;

-- Cómo quedó (la obra y sus funciones). Si alguna función sigue con otro teatro, es porque ya tenía uno propio.
select p.id as obra, p.nombre, p.venue as teatro_de_la_obra,
       (select string_agg(distinct coalesce(pf.venue, '(el de la obra)'), ', ') from performances pf where pf.production_id = p.id) as teatro_en_funciones
  from productions p where p.id in ('hsm', 'mm') order by p.id;
