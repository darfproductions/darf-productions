-- 0093: póster oficial de la obra (Diego, 2026-10-13). Opcional: una obra puede anunciarse (por
-- ejemplo, con sus audiciones) antes de tener póster, elenco, fechas o lugar. Cuando se sube:
--   * 4 formatos: 3:4 (póster), 9:16 (historias), 4:3 y 16:9 (destacadas).
--   * 2 versiones de cada uno: "con toda la información" (fechas, lugar, créditos; se usa donde la
--     página NO pone los datos, como al compartir) y "solo imagen" (sin textos; se usa donde la
--     página ya pone el logo y los datos encima: destacada, tarjetas, "Voy a ir").
--   Mientras falten, la web usa la imagen de ambiente como hasta ahora.
-- Precede: 0092.

begin;

alter table productions
  add column if not exists poster_3x4_path text,
  add column if not exists poster_3x4_info_path text,
  add column if not exists poster_9x16_path text,
  add column if not exists poster_9x16_info_path text,
  add column if not exists poster_4x3_path text,
  add column if not exists poster_4x3_info_path text,
  add column if not exists poster_16x9_path text,
  add column if not exists poster_16x9_info_path text;

-- Los archivos viven en la carpeta del kit de la obra (bucket producciones).
alter table productions drop constraint if exists productions_poster_rutas;
alter table productions add constraint productions_poster_rutas check (
  coalesce(poster_3x4_path, id || '/kit/') like id || '/kit/%' and coalesce(poster_3x4_info_path, id || '/kit/') like id || '/kit/%'
  and coalesce(poster_9x16_path, id || '/kit/') like id || '/kit/%' and coalesce(poster_9x16_info_path, id || '/kit/') like id || '/kit/%'
  and coalesce(poster_4x3_path, id || '/kit/') like id || '/kit/%' and coalesce(poster_4x3_info_path, id || '/kit/') like id || '/kit/%'
  and coalesce(poster_16x9_path, id || '/kit/') like id || '/kit/%' and coalesce(poster_16x9_info_path, id || '/kit/') like id || '/kit/%');

commit;
