-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV" (la base de darfproductions.com).
-- Showman (Diego 2026-11-20), solo ensayos de hoy en adelante y no cancelados:
--   * Sábados y domingos: además de quien ya estaba citado, se cita a TODO el equipo de producción.
--   * Martes: además de quien ya estaba citado, se cita a Patricio González.
-- No quita a nadie ni borra nada. Se puede correr más de una vez.
-- Si la base no es DEV, o no encuentra a Patricio González (o encuentra a más de uno), aborta sin cambiar nada.
do $$
declare pid text; pato uuid; n int; finde int; martes int;
begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
  select id into pid from productions where id = 'showman' or lower(nombre) = 'showman' order by (id = 'showman') desc limit 1;
  if pid is null then raise exception 'ABORTADO: no encontré la obra Showman.'; end if;
  select count(*), min(id::text)::uuid into n, pato from profiles where unaccent_lower(coalesce(nombre, '')) like 'patricio gonzalez%';
  if n <> 1 then raise exception 'ABORTADO: encontré % cuentas con el nombre Patricio González. No se cambió nada.', n; end if;

  update rehearsals set equipo_todos = true
   where production_id = pid and estado = 'programado' and not equipo_todos
     and (inicia at time zone 'America/Mexico_City')::date >= (now() at time zone 'America/Mexico_City')::date
     and extract(isodow from inicia at time zone 'America/Mexico_City') in (6, 7);
  get diagnostics finde = row_count;

  update rehearsals set equipo = array_append(equipo, pato)
   where production_id = pid and estado = 'programado' and not (pato = any(equipo))
     and (inicia at time zone 'America/Mexico_City')::date >= (now() at time zone 'America/Mexico_City')::date
     and extract(isodow from inicia at time zone 'America/Mexico_City') = 2;
  get diagnostics martes = row_count;

  raise notice 'Sábados y domingos con todo el equipo: % ensayos cambiados. Martes con Patricio: % ensayos cambiados.', finde, martes;
  -- A un ensayo solo le llega a quien es del equipo de la obra (Equipo y elenco de Showman).
  if not es_equipo(pid, pato) then
    raise notice 'OJO: Patricio González no está en el equipo de Showman. Agrégalo en Showman, Equipo y elenco, para que le salgan los martes.';
  end if;
end $$;

-- Cómo quedaron los próximos ensayos.
select (array['lun','mar','mié','jue','vie','sáb','dom'])[extract(isodow from r.inicia at time zone 'America/Mexico_City')::int] || ' ' || to_char(r.inicia at time zone 'America/Mexico_City', 'DD/MM HH24:MI') as cuando, r.titulo,
       case when r.equipo_todos then 'Todo el equipo'
            else coalesce((select string_agg(coalesce(nullif(btrim(p.nombre), ''), 'Sin nombre'), ', ') from profiles p where p.id = any(r.equipo)), '—') end as equipo_citado
  from rehearsals r
 where (r.production_id = 'showman' or r.production_id in (select id from productions where lower(nombre) = 'showman'))
   and r.estado = 'programado' and (r.inicia at time zone 'America/Mexico_City')::date >= (now() at time zone 'America/Mexico_City')::date
 order by r.inicia
 limit 40;
