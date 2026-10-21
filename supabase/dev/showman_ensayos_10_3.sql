-- Showman: los ensayos que siguen pasan de 9:00–14:00 a 10:00–15:00 (hora de México).
-- Solo toca ensayos programados que aún no empiezan y que hoy están de 9 a 2.
-- Correr una vez en Supabase → SQL Editor.

do $$ declare n int; begin
  update rehearsals
     set inicia = inicia + interval '1 hour',
         termina = termina + interval '1 hour'
   where production_id = 'showman'
     and estado = 'programado'
     and inicia > now()
     and to_char(inicia at time zone 'America/Mexico_City', 'HH24:MI') = '09:00'
     and to_char(termina at time zone 'America/Mexico_City', 'HH24:MI') = '14:00';
  get diagnostics n = row_count;
  raise notice 'Ensayos cambiados a 10:00–15:00: %', n;
end $$;

select to_char(inicia at time zone 'America/Mexico_City', 'YYYY-MM-DD HH24:MI') as inicia,
       to_char(termina at time zone 'America/Mexico_City', 'HH24:MI') as termina
  from rehearsals
 where production_id = 'showman' and estado = 'programado' and inicia > now()
 order by inicia;
