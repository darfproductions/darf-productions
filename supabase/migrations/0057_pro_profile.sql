-- 0057: perfil profesional (plan punto 6; decisiones de Diego, 2026-10-12; visión §9.2).
--   * Ligado a la FICHA de la persona (people), no solo a la cuenta: así también lo tienen
--     las personas de la 1.0 sin cuenta.
--   * Lo edita la persona (si la ficha es suya) y lo corrigen el Director o quien gestiona el
--     elenco de una obra donde aparece (elenco.gestionar).
--   * Contenido: retrato profesional, semblanza, trayectoria externa, habilidades, redes, reel
--     y galería (máx. 6 fotos). Archivos en el bucket público 'perfiles' (<ficha>/...).
--   * Página pública /artistas/<slug> solo si la persona la activa. Menores de edad: además
--     hace falta que el equipo registre el permiso del tutor.
--   * En el elenco de una obra: la foto de la obra; si no hay, el retrato del perfil.
-- Precede: 0056.

begin;

create table pro_profiles (
  person_id uuid primary key references people(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 60),
  publico boolean not null default false,
  tutor_autorizado_at timestamptz,
  tutor_autorizado_por uuid references auth.users(id) on delete set null,
  retrato_path text check (retrato_path like person_id::text || '/%'),
  semblanza text check (length(semblanza) <= 3000),
  trayectoria jsonb not null default '[]' check (jsonb_typeof(trayectoria) = 'array' and jsonb_array_length(trayectoria) <= 60),
  habilidades jsonb not null default '{}' check (jsonb_typeof(habilidades) = 'object'),
  instagram text check (length(instagram) <= 100),
  tiktok text check (length(tiktok) <= 100),
  youtube text check (youtube ~* '^https://\S+$' and length(youtube) <= 300),
  reel_url text check (reel_url ~* '^https://\S+$' and length(reel_url) <= 300),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

create table pro_photos (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references pro_profiles(person_id) on delete cascade,
  path text not null check (path like person_id::text || '/%'),
  orden int not null default 0,
  created_at timestamptz not null default now()
);
create index idx_pro_photos_person on pro_photos(person_id, orden);

-- ──────── Quién puede qué ────────
create or replace function can_edit_pro_profile(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    exists (select 1 from people where id = pid and profile_id = auth.uid())
    or is_admin()
    or exists (select 1 from production_credits c where c.person_id = pid and has_perm(c.production_id, 'elenco.gestionar')))
$$;

-- ¿Puede tocar lo que solo el equipo decide (permiso del tutor)?
create or replace function is_pro_team(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    is_admin() or exists (select 1 from production_credits c where c.person_id = pid and has_perm(c.production_id, 'elenco.gestionar')))
$$;

-- Menor de edad según la fecha de nacimiento de su cuenta (sin fecha: no se sabe → no menor).
create or replace function person_is_minor(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select pr.fecha_nacimiento > (current_date - interval '18 years')::date
                     from people pe join profiles pr on pr.id = pe.profile_id where pe.id = pid), false)
$$;

create or replace function pro_is_public(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from pro_profiles p where p.person_id = pid and p.publico
                  and (not person_is_minor(pid) or p.tutor_autorizado_at is not null))
$$;

-- Slug automático desde el nombre ("Ana Pérez" → ana-perez, ana-perez-2…).
create or replace function pro_slug(pid uuid) returns text
language plpgsql volatile set search_path = public as $$
declare base text; s text; n int := 1;
begin
  select trim(both '-' from regexp_replace(unaccent_lower(nombre), '[^a-z0-9]+', '-', 'g')) into base from people where id = pid;
  base := left(coalesce(nullif(base, ''), 'artista'), 50);
  if length(base) < 3 then base := base || '-darf'; end if;
  s := base;
  while exists (select 1 from pro_profiles where slug = s and person_id <> pid) loop
    n := n + 1; s := base || '-' || n;
  end loop;
  return s;
end $$;

create or replace function pro_profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and (new.slug is null or new.slug = '') then new.slug := pro_slug(new.person_id); end if;
  -- El permiso del tutor solo lo registra el equipo.
  if auth.uid() is not null and not is_pro_team(new.person_id) then
    if tg_op = 'INSERT' then new.tutor_autorizado_at := null; new.tutor_autorizado_por := null;
    else new.tutor_autorizado_at := old.tutor_autorizado_at; new.tutor_autorizado_por := old.tutor_autorizado_por; end if;
  elsif tg_op = 'INSERT' or new.tutor_autorizado_at is distinct from old.tutor_autorizado_at then
    new.tutor_autorizado_por := case when new.tutor_autorizado_at is null then null else auth.uid() end;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger pro_profiles_guard before insert or update on pro_profiles for each row execute function pro_profiles_guard();

create or replace function pro_photos_limit() returns trigger
language plpgsql set search_path = public as $$
begin
  if (select count(*) from pro_photos where person_id = new.person_id) >= 6 then
    raise exception 'La galería admite máximo 6 fotos.';
  end if;
  return new;
end $$;
create trigger pro_photos_limit before insert on pro_photos for each row execute function pro_photos_limit();

alter table pro_profiles enable row level security;
alter table pro_photos enable row level security;
create policy pro_profiles_public on pro_profiles for select using (pro_is_public(person_id));
create policy pro_profiles_team_read on pro_profiles for select to authenticated using (can_edit_pro_profile(person_id) or can_view_person(person_id));
create policy pro_profiles_edit on pro_profiles for all to authenticated
  using (can_edit_pro_profile(person_id)) with check (can_edit_pro_profile(person_id));
create policy pro_photos_public on pro_photos for select using (pro_is_public(person_id));
create policy pro_photos_team_read on pro_photos for select to authenticated using (can_edit_pro_profile(person_id) or can_view_person(person_id));
create policy pro_photos_edit on pro_photos for all to authenticated
  using (can_edit_pro_profile(person_id)) with check (can_edit_pro_profile(person_id));

-- Mi ficha: la crea si mi cuenta aún no tiene una (para poder armar mi perfil).
create or replace function my_person() returns uuid
language plpgsql security definer set search_path = public as $$
declare pid uuid; n text;
begin
  if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
  select id into pid from people where profile_id = auth.uid();
  if found then return pid; end if;
  select coalesce(nullif(btrim(pr.nombre), ''), split_part(u.email::text, '@', 1)) into n
    from auth.users u left join profiles pr on pr.id = u.id where u.id = auth.uid();
  insert into people (nombre, profile_id) values (n, auth.uid()) returning id into pid;
  return pid;
end $$;

-- Retrato y enlace al perfil de cada persona del elenco de una obra visible (también sin sesión).
create or replace function production_pro_info(pid text)
returns table (person_id uuid, retrato_path text, slug text)
language sql stable security definer set search_path = public as $$
  select distinct c.person_id, p.retrato_path, case when pro_is_public(c.person_id) then p.slug end
    from production_credits c join pro_profiles p on p.person_id = c.person_id
   where c.production_id = pid and production_is_visible(pid)
$$;

-- Obras DARF de una persona con perfil público (para su página).
create or replace function pro_darf_credits(pid uuid)
returns table (production_id text, obra text, tipo text, papel text)
language sql stable security definer set search_path = public as $$
  select c.production_id, p.nombre, c.tipo, c.papel
    from production_credits c join productions p on p.id = c.production_id
   where c.person_id = pid and production_is_visible(c.production_id)
     and (pro_is_public(pid) or can_edit_pro_profile(pid))
   order by p.created_at desc
$$;

-- ──────── Archivos ────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('perfiles', 'perfiles', true, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 8388608, allowed_mime_types = excluded.allowed_mime_types;

create or replace function pro_owner(path text) returns uuid
language sql immutable as $$
  select case when split_part(path, '/', 1) ~ '^[0-9a-f-]{36}$' then split_part(path, '/', 1)::uuid end
$$;
create policy perfiles_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'perfiles' and can_edit_pro_profile(pro_owner(name)));
create policy perfiles_remove on storage.objects for delete to authenticated
  using (bucket_id = 'perfiles' and can_edit_pro_profile(pro_owner(name)));

revoke execute on function pro_profiles_guard() from public, anon, authenticated;
revoke execute on function pro_photos_limit() from public, anon, authenticated;
revoke execute on function pro_slug(uuid) from public, anon, authenticated;
revoke execute on function can_edit_pro_profile(uuid), is_pro_team(uuid), person_is_minor(uuid), my_person() from public, anon;
grant execute on function can_edit_pro_profile(uuid), is_pro_team(uuid), person_is_minor(uuid), my_person() to authenticated;
revoke execute on function pro_is_public(uuid), production_pro_info(text), pro_darf_credits(uuid) from public;
grant execute on function pro_is_public(uuid), production_pro_info(text), pro_darf_credits(uuid) to anon, authenticated;

create trigger audit_pro_profiles after insert or update or delete on pro_profiles for each row execute function audit_row();

commit;
