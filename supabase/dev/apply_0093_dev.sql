-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV".
-- 0093: póster oficial de la obra (opcional; 4 formatos × 2 versiones). Requiere 0092.
-- Si la base no es DEV, aborta. Se corre completa en Supabase → SQL Editor.
begin;
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
end $$;

alter table productions
  add column if not exists poster_3x4_path text,
  add column if not exists poster_3x4_info_path text,
  add column if not exists poster_9x16_path text,
  add column if not exists poster_9x16_info_path text,
  add column if not exists poster_4x3_path text,
  add column if not exists poster_4x3_info_path text,
  add column if not exists poster_16x9_path text,
  add column if not exists poster_16x9_info_path text;

alter table productions drop constraint if exists productions_poster_rutas;
alter table productions add constraint productions_poster_rutas check (
  coalesce(poster_3x4_path, id || '/kit/') like id || '/kit/%' and coalesce(poster_3x4_info_path, id || '/kit/') like id || '/kit/%'
  and coalesce(poster_9x16_path, id || '/kit/') like id || '/kit/%' and coalesce(poster_9x16_info_path, id || '/kit/') like id || '/kit/%'
  and coalesce(poster_4x3_path, id || '/kit/') like id || '/kit/%' and coalesce(poster_4x3_info_path, id || '/kit/') like id || '/kit/%'
  and coalesce(poster_16x9_path, id || '/kit/') like id || '/kit/%' and coalesce(poster_16x9_info_path, id || '/kit/') like id || '/kit/%');

commit;
