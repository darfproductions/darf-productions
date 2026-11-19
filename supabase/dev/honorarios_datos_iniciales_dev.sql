-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV" (la base de darfproductions.com).
-- Honorarios: datos iniciales del documento de Patricio (18 nov 2026). Correr DESPUÉS de apply_0149_dev.sql.
--   * Configuración: los valores de la sección 2 (reserva 10 %, emergencia 5 %, renta 8,000, gastos 1,500, 60/40,
--     recargo 200, redondeo a 10, umbral 10 alumnos, fondo común 30 %, cierre 40/25/20/15 y Casa DARF 60/40).
--   * Obras: Greased Lightning y La Familia Madrigal (Encanto) con mensualidad; Showman solo temporada (40/45/0/15).
--     A Grease y Encanto se les enciende "se paga el 1.er sábado, corte el 2.º".
--   * Porcentajes de cada bolsa (sección 6 y Showman 7.2), ligados a la ficha de cada persona por su nombre.
--     Quien no se encuentre (o tenga nombre repetido) NO se carga: sale en la lista del final para ligarlo a mano.
-- Todo aplica desde el 1 de enero de 2026 y se puede cambiar en Panel, Honorarios. No borra nada.
-- Se puede correr más de una vez (lo que ya está no se duplica). Si la base no es DEV, aborta.
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
  if to_regclass('public.hon_asignaciones') is null then
    raise exception 'ABORTADO: primero corre apply_0149_dev.sql.';
  end if;
end $$;

create temp table if not exists _hon_carga (bolsa text, nombre text, puesto text, pct numeric, persona uuid, encontrados int) on commit preserve rows;
truncate _hon_carga;

do $$
declare
  desde constant date := '2026-01-01';
  g text; e text; s text; r record; n int;
  norm text;
begin
  -- Obras (por nombre; tiene que haber una sola de cada una).
  select count(*) into n from productions where nombre ilike '%grease%';
  select id into g from productions where nombre ilike '%grease%' limit 1;
  if n <> 1 then raise exception 'ABORTADO: no encontré una sola obra "Grease" (hay %).', n; end if;
  select count(*) into n from productions where nombre ilike '%madrigal%' or nombre ilike '%encanto%';
  select id into e from productions where nombre ilike '%madrigal%' or nombre ilike '%encanto%' limit 1;
  if n <> 1 then raise exception 'ABORTADO: no encontré una sola obra "La Familia Madrigal / Encanto" (hay %).', n; end if;
  select count(*) into n from productions where id = 'showman' or nombre ilike 'showman%';
  select id into s from productions where id = 'showman' or nombre ilike 'showman%' limit 1;
  if n <> 1 then raise exception 'ABORTADO: no encontré una sola obra "Showman" (hay %).', n; end if;

  insert into hon_config (vigente_desde) values (desde) on conflict (vigente_desde) do nothing;
  insert into hon_obras (production_id, mensual, orden) values (g, true, 1), (e, true, 2) on conflict (production_id) do nothing;
  insert into hon_obras (production_id, mensual, orden, cierre_empresa_pct, cierre_creativos_pct, cierre_compartida_pct, cierre_casa_pct)
  values (s, false, 3, 40, 45, 0, 15) on conflict (production_id) do nothing;
  update production_fees set vence_sabado = true where production_id in (g, e);

  insert into _hon_carga (bolsa, nombre, puesto, pct) values
    ('creativa:' || g, 'Diego Romero', 'Dirección escénica y artística', 29),
    ('creativa:' || g, 'Ana Fernanda Ramírez', 'Dirección vocal', 28),
    ('creativa:' || g, 'Regina Cedillo', 'Dirección coreográfica', 28),
    ('creativa:' || g, 'Patricio González', 'Finanzas y codirección creativa', 9),
    ('creativa:' || g, 'Juan Pablo Villalva', 'Jefe de producción', 6),
    ('creativa:' || e, 'Adriana Alarcón', 'Codirección', 21.5),
    ('creativa:' || e, 'Emiliano Castellanos', 'Codirección', 21.5),
    ('creativa:' || e, 'Valeria Luna', 'Coreografía', 21.5),
    ('creativa:' || e, 'Camila Cedillo', 'Coreografía', 21.5),
    ('creativa:' || e, 'Diego Romero', 'Supervisión creativa', 5),
    ('creativa:' || e, 'Ana Fernanda Ramírez', 'Supervisión creativa', 3),
    ('creativa:' || e, 'Regina Cedillo', 'Supervisión creativa', 2),
    ('creativa:' || e, 'Patricio González', 'Finanzas y codirección creativa', 2),
    ('creativa:' || e, 'Juan Pablo Villalva', 'Jefe de producción', 2),
    ('compartida', 'Diego Romero', 'Dirección general', 9),
    ('compartida', 'Ana Fernanda Ramírez', 'Dirección creativa', 7.2),
    ('compartida', 'Juan Pablo Villalva', 'Dirección logística y de producción', 22),
    ('compartida', 'Patricio González', 'Dirección financiera', 21.8),
    ('compartida', 'Valentina Lima', 'Recursos humanos y relaciones internas', 14),
    ('compartida', 'Mía Castro', 'Dirección visual', 13),
    ('compartida', 'Camila Bauer', 'Comunidad y redes sociales', 13),
    -- Showman: su equipo se lleva el 45 % de la ganancia; aquí va el % de esa bolsa (6.30 de 45 = 14 %, etc.).
    ('creativa:' || s, 'Diego Romero', 'Dirección general', 14),
    ('creativa:' || s, 'Ana Fernanda Ramírez', 'Dirección vocal', 12),
    ('creativa:' || s, 'Patricio González', 'Finanzas y codirección escénica', 11),
    ('creativa:' || s, 'Juan Pablo Villalva', 'Jefe de producción', 11),
    ('creativa:' || s, 'Regina Cedillo', 'Dirección coreográfica', 12),
    ('creativa:' || s, 'Valentina Lima', 'Gerente de producción', 7),
    ('creativa:' || s, 'Camila Cedillo', 'Dirección circense', 6.6667),
    ('creativa:' || s, 'Valeria Luna', 'Dirección circense', 9.3333),
    ('creativa:' || s, 'Mía Castro', 'Dirección visual', 6),
    ('creativa:' || s, 'Camila Bauer', 'Community manager', 5),
    ('creativa:' || s, 'Emiliano Villalva', 'Stage manager', 6);

  -- Ligar por nombre (sin acentos ni mayúsculas): el nombre exacto, o que empiece así (por un segundo apellido).
  for r in select distinct nombre from _hon_carga loop
    norm := translate(lower(r.nombre), 'áéíóúüñ', 'aeiouun');
    update _hon_carga c set
      encontrados = (select count(*) from people p where translate(lower(btrim(p.nombre)), 'áéíóúüñ', 'aeiouun') = norm
                        or translate(lower(btrim(p.nombre)), 'áéíóúüñ', 'aeiouun') like norm || ' %'),
      persona = (select min(p.id::text)::uuid from people p where translate(lower(btrim(p.nombre)), 'áéíóúüñ', 'aeiouun') = norm
                        or translate(lower(btrim(p.nombre)), 'áéíóúüñ', 'aeiouun') like norm || ' %')
     where c.nombre = r.nombre;
  end loop;

  insert into hon_asignaciones (bolsa, person_id, puesto, pct, desde)
  select c.bolsa, c.persona, c.puesto, c.pct, desde from _hon_carga c
   where c.encontrados = 1
     and not exists (select 1 from hon_asignaciones a where a.bolsa = c.bolsa and a.person_id = c.persona and a.hasta is null);
end $$;

-- Lista para revisar: con quién se ligó a cada persona y si tiene cuenta y está en Casa DARF.
select c.nombre as "Persona del documento",
       case when c.encontrados = 1 then 'Ligada' when c.encontrados = 0 then 'NO ENCONTRADA (no se cargó)' else 'NOMBRE REPETIDO (no se cargó)' end as "Estado",
       p.nombre as "Ficha", case when p.profile_id is null then 'No' else 'Sí' end as "Tiene cuenta",
       case when cm.user_id is null then '—' when cc.directivo then 'Cabeza' else 'Integrante' end as "Casa DARF",
       string_agg(distinct replace(replace(c.bolsa, 'creativa:', 'creativa '), 'compartida', 'compartida'), ', ') as "Bolsas"
  from _hon_carga c
  left join people p on p.id = c.persona and c.encontrados = 1
  left join (select distinct user_id from casa_members) cm on cm.user_id = p.profile_id
  left join casa_cargos cc on cc.user_id = p.profile_id
 group by c.nombre, c.encontrados, p.nombre, p.profile_id, cm.user_id, cc.directivo
 order by 2 desc, 1;
