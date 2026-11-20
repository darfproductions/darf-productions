-- 0155 · Secciones que sí aplican a una obra aunque su tipo diga que no (Diego 2026-11-20).
--   El tipo de producción (0139) manda a "Más · No aplica a este tipo" algunas secciones (Vendedores en una Escuela,
--   Cuotas en una Profesional…). Si una obra sí las usa, se encienden para ella: vuelven a su lugar de siempre.
--   Solo es una lista de ids de página; no cambia permisos ni datos.
-- Precede: 0139. No borra datos.

begin;

alter table productions add column if not exists secciones_extra text[] not null default '{}';
alter table productions drop constraint if exists productions_secciones_extra;
alter table productions add constraint productions_secciones_extra
  check (coalesce(array_length(secciones_extra, 1), 0) <= 30
         and array_to_string(secciones_extra, ',') ~ '^[a-z_,-]*$');

commit;
