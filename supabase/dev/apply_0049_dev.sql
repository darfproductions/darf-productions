-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV".
-- Aplica la migración 0049 (programa: plantilla, enlace o archivo). Si la base no es DEV, aborta.
begin;
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
end $$;

alter table program_pages
  add column modo text not null default 'plantilla' check (modo in ('plantilla', 'enlace', 'archivo')),
  add column enlace_url text check (enlace_url is null or (enlace_url ~* '^https://\S+$' and length(enlace_url) <= 500)),
  add column archivo_path text check (archivo_path is null or archivo_path like production_id || '/programa/%');

-- Si el modo pide enlace o archivo, debe existir antes de publicar.
alter table program_pages add constraint program_pages_modo_listo check (
  not publicado
  or modo = 'plantilla'
  or (modo = 'enlace' and enlace_url is not null)
  or (modo = 'archivo' and archivo_path is not null));

-- El bucket público de obras acepta también PDF (programas), hasta 20 MB.
-- Las reglas de cada tipo de imagen siguen en la web; quién escribe dónde sigue en can_write_object.
update storage.buckets
   set file_size_limit = 20971520,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
 where id = 'producciones';

insert into supabase_migrations.schema_migrations (version, name)
values ('20261012003717', '0049_program_modes') on conflict do nothing;
commit;
select 'OK: 0049 aplicada en DARF 2.0 DEV' as resultado;
