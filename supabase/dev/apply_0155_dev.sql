-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV" (la base de darfproductions.com).
-- 0155: Secciones que sí aplican a una obra aunque su tipo diga que no (botón «Sí aplica a esta obra»).
-- Correr DESPUÉS de apply_0154_dev.sql. Se puede correr más de una vez. Si la base no es DEV, aborta.
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'productions' and column_name = 'tipo') then
    raise exception 'ABORTADO: faltan los tipos de producción (0139).';
  end if;
end $$;
-- 0155 · Secciones que sí aplican a una obra aunque su tipo diga que no (Diego 2026-11-20).
--   El tipo de producción (0139) manda a "Más · No aplica a este tipo" algunas secciones (Vendedores en una Escuela,
--   Cuotas en una Profesional…). Si una obra sí las usa, se encienden para ella: vuelven a su lugar de siempre.
--   Solo es una lista de ids de página; no cambia permisos ni datos.
-- Precede: 0139. No borra datos.


alter table productions add column if not exists secciones_extra text[] not null default '{}';
alter table productions drop constraint if exists productions_secciones_extra;
alter table productions add constraint productions_secciones_extra
  check (coalesce(array_length(secciones_extra, 1), 0) <= 30
         and array_to_string(secciones_extra, ',') ~ '^[a-z_,-]*$');

select 'Listo: 0155 aplicada (secciones que sí aplican).' as resultado;
