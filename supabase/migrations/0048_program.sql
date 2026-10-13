-- 0048: programa digital por obra (Fase 3, etapa 3F).
--   * Página pública /programa/<obra> que se llena sola con la obra (reparto, ensamble,
--     equipos, canciones, agradecimientos) más lo propio del programa: notas de dirección,
--     mensaje extra y patrocinadores con logo y enlace. Se publica aparte de la obra.
--   * Lo edita quien tiene programa.editar (Producción, Contenido).
--   * Logos de patrocinadores en producciones/<obra>/programa/... (programa.editar).
-- Precede: 0047.

begin;

create table program_pages (
  production_id text primary key references productions(id) on delete cascade,
  publicado boolean not null default false,
  notas_direccion text check (length(notas_direccion) <= 8000),
  firma_direccion text check (length(firma_direccion) <= 120),
  mensaje text check (length(mensaje) <= 4000),
  mostrar_canciones boolean not null default true,
  mostrar_equipos boolean not null default true,
  mostrar_agradecimientos boolean not null default true,
  updated_at timestamptz not null default now()
);

create table program_sponsors (
  id uuid primary key default gen_random_uuid(),
  production_id text not null references productions(id) on delete cascade,
  nombre text not null check (length(btrim(nombre)) between 1 and 120),
  url text check (url is null or (url ~* '^https://\S+$' and length(url) <= 500)),
  logo_path text check (logo_path is null or logo_path like production_id || '/programa/%'),
  orden int not null default 0
);

-- Visible al público si el programa está publicado y la obra es pública.
create or replace function program_is_public(pid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from program_pages g join productions p on p.id = g.production_id
                  where g.production_id = pid and g.publicado and p.estado in ('publicada', 'archivada'))
$$;

alter table program_pages enable row level security;
alter table program_sponsors enable row level security;
create policy program_pages_public on program_pages for select using (program_is_public(production_id));
create policy program_pages_team on program_pages for all to authenticated
  using (has_perm(production_id, 'programa.editar')) with check (has_perm(production_id, 'programa.editar'));
create policy program_sponsors_public on program_sponsors for select using (program_is_public(production_id));
create policy program_sponsors_team on program_sponsors for all to authenticated
  using (has_perm(production_id, 'programa.editar')) with check (has_perm(production_id, 'programa.editar'));

-- Archivos de la obra: se agrega la carpeta programa/ para programa.editar.
create or replace function can_write_object(bucket text, path text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when bucket = 'producciones' then
      has_perm(split_part(path, '/', 1), 'obra.editar')
      or (split_part(path, '/', 2) = 'creditos' and has_perm(split_part(path, '/', 1), 'elenco.gestionar'))
      or (split_part(path, '/', 2) = 'programa' and has_perm(split_part(path, '/', 1), 'programa.editar'))
    when bucket = 'gallery' then has_perm(split_part(path, '/', 1), 'fanzone.editar')
    else false
  end
$$;

revoke execute on function program_is_public(text) from public;
grant execute on function program_is_public(text) to anon, authenticated;

create trigger audit_program_pages after insert or update or delete on program_pages for each row execute function audit_row();

commit;
