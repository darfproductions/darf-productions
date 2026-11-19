-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV" (la base de darfproductions.com).
-- Honorarios: ligar a Camila Bauer (tiene dos fichas con el mismo nombre). Correr DESPUÉS de honorarios_datos_iniciales_dev.sql.
-- Elige la ficha así: la que está en Casa DARF; si ninguna (o las dos), la única con cuenta. Si aun así no se puede
-- decidir, NO carga nada y te muestra las dos fichas para escoger. No borra nada. Se puede correr más de una vez.
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
end $$;

do $$
declare
  norm constant text := 'camila bauer';
  elegida uuid; n int; s text;
begin
  drop table if exists _cb;
  create temp table _cb on commit drop as
    select p.id, p.nombre, p.profile_id,
           exists (select 1 from casa_members m where m.user_id = p.profile_id) as en_casa
      from people p
     where translate(lower(btrim(p.nombre)), 'áéíóúüñ', 'aeiouun') = norm
        or translate(lower(btrim(p.nombre)), 'áéíóúüñ', 'aeiouun') like norm || ' %';

  select count(*) into n from _cb where en_casa;
  if n = 1 then select id into elegida from _cb where en_casa;
  else
    select count(*) into n from _cb where profile_id is not null;
    if n = 1 then select id into elegida from _cb where profile_id is not null; end if;
  end if;
  if elegida is null then
    raise exception 'No pude decidir cuál ficha es: %. Mándale captura a Claude.',
      (select string_agg(nombre || ' (' || case when profile_id is null then 'sin cuenta' else 'con cuenta' end
                         || case when en_casa then ', en Casa DARF' else '' end || ')', '; ') from _cb);
  end if;

  select id into s from productions where id = 'showman' or nombre ilike 'showman%' limit 1;
  insert into hon_asignaciones (bolsa, person_id, puesto, pct, desde)
  select x.bolsa, elegida, x.puesto, x.pct, '2026-01-01'
    from (values ('compartida', 'Comunidad y redes sociales', 13::numeric), ('creativa:' || s, 'Community manager', 5::numeric)) as x(bolsa, puesto, pct)
   where not exists (select 1 from hon_asignaciones a where a.bolsa = x.bolsa and a.person_id = elegida and a.hasta is null);
end $$;

-- Cómo quedaron las bolsas (todas deben sumar 100).
select replace(bolsa, 'creativa:', 'creativa ') as bolsa, count(*) as personas, sum(pct) as suma
  from hon_asignaciones where hasta is null group by bolsa order by bolsa;
