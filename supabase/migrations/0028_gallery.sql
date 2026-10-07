-- 0028: galería de fotos subida desde el panel
-- Bucket público 'gallery' (lectura pública, escritura solo admin) + tabla gallery_photos
-- que guarda el orden y el tipo: 'galeria' (galería pública de la producción) o
-- 'ensayos' (galería de ensayos de la Fan Zone). Ruta: <production_id>/<kind>/<uuid>.jpg

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gallery', 'gallery', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg','image/png','image/webp'];

create policy gallery_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'gallery' and is_admin());
create policy gallery_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'gallery' and is_admin()) with check (bucket_id = 'gallery' and is_admin());
create policy gallery_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'gallery' and is_admin());

create table gallery_photos (
  id uuid primary key default gen_random_uuid(),
  production_id text not null references productions(id) on delete cascade,
  kind text not null check (kind in ('galeria','ensayos')),
  path text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index idx_gallery_photos_prod on gallery_photos(production_id, kind, sort_order);

alter table gallery_photos enable row level security;
create policy gallery_photos_read on gallery_photos for select using (true);
create policy gallery_photos_admin_write on gallery_photos for all to authenticated
  using (is_admin()) with check (is_admin());

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'gallery' and public) then
    raise exception 'Falta el bucket gallery';
  end if;
  if (select count(*) from pg_policies where tablename = 'gallery_photos') <> 2 then
    raise exception 'Faltan políticas de gallery_photos';
  end if;
end $$;

commit;
