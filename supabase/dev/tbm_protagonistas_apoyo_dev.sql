-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV" (la base de darfproductions.com).
-- Teen Beach Movie (Diego 2026-11-24): protagonistas solo McKenzie, Brady, Lela y Tanner; los demás personajes pasan a
-- «Personajes de apoyo». Los grupos de ensamble se quedan como están.
--   * En la obra (sus personajes) y en sus audiciones (el ajuste del cast). No mueve a nadie del cast ni borra nada.
-- Requiere 0168. Se puede correr más de una vez. Si la base no es DEV, aborta sin cambiar nada.
do $$
declare n1 int; n2 int;
begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'audition_roles' and column_name = 'categoria') then
    raise exception 'ABORTADO: falta correr apply_0168_dev.sql.';
  end if;
  if not exists (select 1 from productions p where p.id = 'teenbeachmovie' or unaccent_lower(p.nombre) = 'teen beach movie') then
    raise exception 'ABORTADO: no encontré la obra Teen Beach Movie.';
  end if;

  -- Personajes de la obra.
  update production_characters c
     set categoria = case when unaccent_lower(c.nombre) like 'mckenzie%' or unaccent_lower(btrim(c.nombre)) in ('brady', 'lela', 'tanner')
                          then 'protagonista' else 'apoyo' end
    from productions p
   where p.id = c.production_id and (p.id = 'teenbeachmovie' or unaccent_lower(p.nombre) = 'teen beach movie')
     and c.categoria <> 'ensamble';
  get diagnostics n1 = row_count;

  -- Personajes de sus audiciones (lo que se ve en el ajuste del cast).
  update audition_roles r
     set categoria = case when unaccent_lower(r.nombre) like 'mckenzie%' or unaccent_lower(btrim(r.nombre)) in ('brady', 'lela', 'tanner')
                          then 'protagonista' else 'apoyo' end
    from auditions a join productions p on p.id = a.production_id
   where a.id = r.audition_id and (p.id = 'teenbeachmovie' or unaccent_lower(p.nombre) = 'teen beach movie')
     and _audition_categoria(r.id) <> 'ensamble';
  get diagnostics n2 = row_count;
  raise notice 'Personajes de la obra: %, personajes en audiciones: %', n1, n2;
end $$;

-- Cómo quedó, por audición: cada personaje y su tipo.
select a.titulo as audicion, r.nombre as personaje,
       case _audition_categoria(r.id) when 'protagonista' then 'Protagonista' when 'apoyo' then 'Personaje de apoyo' else 'Grupo de ensamble' end as tipo
  from audition_roles r join auditions a on a.id = r.audition_id join productions p on p.id = a.production_id
 where p.id = 'teenbeachmovie' or unaccent_lower(p.nombre) = 'teen beach movie'
 order by a.titulo, array_position(array['protagonista', 'apoyo', 'ensamble'], _audition_categoria(r.id)), r.orden;
