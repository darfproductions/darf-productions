-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV" (la base de darfproductions.com).
-- Teen Beach Movie (Diego 2026-11-23): deshacer "Todos llegan" que se prendió por accidente.
--   * Apaga la opción "Todos llegan: marca solo a quien faltó" en sus audiciones que no han terminado.
--   * A quien quedó como llegado y todavía no pasó a audicionar, le quita la llegada (y la hora), y las faltas que se
--     hayan marcado: todos vuelven a "No ha llegado".
--   * Si la audición da los turnos al llegar (numeración "por llegada"), quita esos números para que se den mañana.
--     Si los turnos se reparten antes (numeración previa o por personaje), los números se quedan como estaban.
--   No toca a quien ya pasó a audicionar, ni las solicitudes, ni el estado de la inscripción.
-- Se puede correr más de una vez. Si la base no es DEV, aborta sin cambiar nada.
create temp table _tbm (audicion text, llegadas_quitadas int);

do $$
declare au record; n int;
begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
  for au in select a.* from auditions a join productions p on p.id = a.production_id
             where (p.id = 'teenbeachmovie' or unaccent_lower(p.nombre) = 'teen beach movie') and a.estado not in ('finalizada', 'cancelada')
  loop
    update auditions set asumir_llegada = false where id = au.id;
    update audition_applications
       set checked_in_at = null, checked_in_by = null, llegada_asumida = false, falto_at = null,
           numero = case when au.numeracion = 'llegada' then null else numero end, updated_at = now()
     where audition_id = au.id and entered_at is null and (checked_in_at is not null or falto_at is not null);
    get diagnostics n = row_count;
    insert into _tbm values (au.titulo, n);
  end loop;
  if not exists (select 1 from _tbm) then raise exception 'ABORTADO: no encontré audiciones activas de Teen Beach Movie.'; end if;
end $$;

-- Cómo quedó: cuántas llegadas se quitaron, cuántos siguen como llegados (debe ser 0) y cómo está la inscripción.
select t.audicion, t.llegadas_quitadas,
       (select count(*) from audition_applications x where x.audition_id = a.id and x.checked_in_at is not null) as siguen_llegados,
       a.estado as inscripcion, to_char(a.inscripcion_cierra at time zone 'America/Mexico_City', 'DD/MM HH24:MI') as cierra,
       a.asumir_llegada as todos_llegan
  from _tbm t join auditions a on a.titulo = t.audicion
  join productions p on p.id = a.production_id and (p.id = 'teenbeachmovie' or unaccent_lower(p.nombre) = 'teen beach movie');
