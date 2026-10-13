-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV". ⚠️ BORRA DATOS (no se puede deshacer).
-- Deja DEV lista para usarse como la oficial (decisión de Diego, 2026-10-13: lo de la 1.0 era prueba).
-- Se corre completa en Supabase → SQL Editor. Si algo no cuadra, se detiene y no borra nada.
begin;
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
  if (select count(*) from profiles where rol = 'admin') <> 1 then
    raise exception 'ABORTADO: debe haber exactamente una cuenta de Director. No se ejecutó nada.';
  end if;
end $$;

-- ════════ Se QUEDA ════════
-- Obras y su contenido (créditos, canciones, fotos, galería, Fan Zone, programa, banners y
-- anuncios), mapa de asientos y zonas, roles y permisos, preguntas de DARFY, tipos de
-- documento y configuración del taller por obra, configuración de avisos y correo.
-- La cuenta del Director (su perfil).
create temp table conservar (t text primary key) on commit drop;
insert into conservar values
  ('productions'), ('production_acts'), ('production_songs'), ('production_credits'), ('production_facts'),
  ('production_media'), ('production_thanks'), ('production_characters'), ('production_banner'), ('production_banner_items'),
  ('site_banner'), ('site_banner_items'), ('anuncios'), ('gallery_photos'), ('fanzone_items'), ('program_pages'), ('program_sponsors'),
  ('people'), ('profiles'), ('seats'), ('price_categories'),
  ('panel_roles'), ('permissions'), ('role_permissions'), ('darfy_faq'), ('audition_templates'),
  ('member_doc_types'), ('production_fees'), ('production_discipline'), ('rubric_criteria'), ('rubric_levels'), ('rubric_settings'),
  ('push_config'), ('invite_config');

-- ════════ Se BORRA todo lo demás ════════
-- Órdenes, boletos, funciones de prueba, avisos, audiciones e inscripciones, Club Fan (los
-- números de socio vuelven a empezar en #0001), credenciales, elenco y equipos de prueba,
-- expedientes, pagos, ensayos, comunicados, mensajes de contacto, vendedores, descuentos y la
-- bitácora. Los contadores (números de socio, folios) vuelven a empezar.
do $$ declare lista text;
begin
  select string_agg(format('public.%I', tablename), ', ' order by tablename) into lista
    from pg_tables where schemaname = 'public' and tablename not in (select t from conservar);
  execute 'truncate table ' || lista || ' restart identity';
end $$;

-- Cuentas: solo se queda la del Director (sus datos de prueba ya se borraron arriba).
delete from auth.users where id not in (select id from profiles where rol = 'admin');

-- Fichas de personas: se quedan las del elenco y equipos de las obras (créditos).
delete from people p
 where not exists (select 1 from production_credits c where c.person_id = p.id)
   and p.profile_id is distinct from (select id from profiles where rol = 'admin');

-- Nombres de las obras sin "(PRUEBA)" y ninguna fijada en portada (la portada elige sola).
update productions set nombre = btrim(regexp_replace(nombre, '\s*\(PRUEBA\)\s*', ' ', 'gi')), destacada = false;

-- La bitácora y los avisos arrancan en blanco (sin los registros de esta misma limpieza).
truncate table audit_log, notifications restart identity;

-- Resumen de lo que quedó.
select 'Obras: ' || (select string_agg(nombre || ' (' || estado || ')', ', ' order by created_at) from productions)
       || ' · Cuentas: ' || (select count(*) from auth.users)
       || ' · Fichas de personas: ' || (select count(*) from people)
       || ' · Créditos: ' || (select count(*) from production_credits)
       || ' · Asientos: ' || (select count(*) from seats)
       || ' · Funciones: ' || (select count(*) from performances)
       || ' · Órdenes: ' || (select count(*) from orders) as resultado;

commit;
