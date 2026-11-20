-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV" (la base de darfproductions.com).
-- Showman: deja en Protagonistas solo a P.T. Barnum, Phillip Carlyle, Charity Barnum y Anne Wheeler, y pasa a los
-- demás protagonistas a Personajes de apoyo, en el mismo orden en que estaban (Diego 2026-11-20).
-- No borra nada: solo cambia la sección (categoría) y el orden. Se puede correr más de una vez.
-- Si la base no es DEV, o no encuentra a los 4 principales con esos nombres, aborta sin cambiar nada.
do $$
declare pid text; n int;
begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
  select id into pid from productions where id = 'showman' or lower(nombre) = 'showman' order by (id = 'showman') desc limit 1;
  if pid is null then raise exception 'ABORTADO: no encontré la obra Showman.'; end if;
  select count(*) into n from production_characters
   where production_id = pid and lower(btrim(nombre)) in ('p.t. barnum', 'phillip carlyle', 'charity barnum', 'anne wheeler');
  if n <> 4 then raise exception 'ABORTADO: encontré % de los 4 principales (P.T. Barnum, Phillip Carlyle, Charity Barnum, Anne Wheeler). No se cambió nada.', n; end if;

  -- Los 4 principales se quedan (o regresan) en Protagonistas.
  update production_characters set categoria = 'protagonista'
   where production_id = pid and lower(btrim(nombre)) in ('p.t. barnum', 'phillip carlyle', 'charity barnum', 'anne wheeler');
  -- Los demás protagonistas pasan a Personajes de apoyo.
  update production_characters set categoria = 'apoyo'
   where production_id = pid and categoria = 'protagonista'
     and lower(btrim(nombre)) not in ('p.t. barnum', 'phillip carlyle', 'charity barnum', 'anne wheeler');
  -- Orden: los 4 principales en ese orden; los que bajaron, primero en Apoyo y como estaban; después el resto.
  update production_characters x set orden = q.n
    from (select id, row_number() over (
            order by array_position(array['protagonista', 'apoyo', 'ensamble'], categoria),
                     coalesce(array_position(array['p.t. barnum', 'phillip carlyle', 'charity barnum', 'anne wheeler'], lower(btrim(nombre))), 99),
                     orden, created_at) as n
            from production_characters where production_id = pid) q
   where x.id = q.id;
end $$;

-- Cómo quedó.
select case c.categoria when 'protagonista' then 'Protagonistas' when 'apoyo' then 'Apoyo' else 'Ensamble' end as seccion,
       c.orden, c.nombre
  from production_characters c join productions p on p.id = c.production_id
 where p.id = 'showman' or lower(p.nombre) = 'showman'
 order by c.orden;
