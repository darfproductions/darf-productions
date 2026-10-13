-- 0046: materiales privados y comunicados con confirmación de lectura (etapa 3E, bloque 4).
--   * Materiales por obra: partituras, pistas, libreto, videos de coreografía… como archivo
--     privado (bucket 'materiales', máx. 50 MB) o enlace (YouTube no listado, Drive).
--     Carpeta opcional ("Acto 1"). Para todo el elenco, grupos o personas.
--     Los suben quienes tienen materiales.gestionar; los ven materiales.ver (staff,
--     maquillaje…) y los integrantes activos a quienes van dirigidos.
--   * Comunicados: título, mensaje, "importante", para todos, grupos o personas. Cada
--     integrante lo marca como leído; quien envía ve quién ya lo leyó y quién no.
--   * Solo integrantes ACTIVOS (sin baja) reciben materiales y comunicados.
-- Precede: 0045.

begin;

-- ¿Integrante activo hoy en la obra?
create or replace function is_active_member(pid text, uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from production_members m
      left join member_enrollment e on e.production_id = m.production_id and e.user_id = m.user_id
     where m.production_id = pid and m.user_id = uid and m.role_id = 'integrante'
       and (e.baja_at is null or e.baja_at > current_date))
$$;

-- ¿Le toca a esta persona (todos / grupos / personas)?
create or replace function audience_includes(pid text, uid uuid, aud text, grupos text[], personas uuid[]) returns boolean
language sql stable security definer set search_path = public as $$
  select is_active_member(pid, uid) and (
    aud = 'todos'
    or (aud = 'grupos' and grupos && member_groups(pid, uid))
    or (aud = 'personas' and uid = any(personas)))
$$;

-- ──────── Materiales ────────
create table materials (
  id uuid primary key default gen_random_uuid(),
  production_id text not null references productions(id) on delete cascade,
  titulo text not null check (length(btrim(titulo)) between 1 and 160),
  descripcion text,
  tipo text not null default 'otro' check (tipo in ('partitura', 'pista', 'libreto', 'coreografia', 'video', 'otro')),
  carpeta text check (length(carpeta) <= 80),
  archivo_path text,
  url text check (url is null or (url ~* '^https://\S+$' and length(url) <= 500)),
  audiencia text not null default 'todos' check (audiencia in ('todos', 'grupos', 'personas')),
  grupos text[] not null default '{}',
  personas uuid[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check ((archivo_path is null) <> (url is null)),
  check (archivo_path is null or archivo_path like production_id || '/%'),
  check (audiencia <> 'grupos' or cardinality(grupos) > 0),
  check (audiencia <> 'personas' or cardinality(personas) > 0)
);
create index idx_materials_prod on materials(production_id, carpeta);

alter table materials enable row level security;
create policy materials_team on materials for all to authenticated
  using (has_perm(production_id, 'materiales.gestionar')) with check (has_perm(production_id, 'materiales.gestionar'));
create policy materials_viewers on materials for select to authenticated using (has_perm(production_id, 'materiales.ver'));
create policy materials_members on materials for select to authenticated
  using (audience_includes(production_id, auth.uid(), audiencia, grupos, personas));
revoke all on materials from anon;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('materiales', 'materiales', false, 52428800, array[
  'application/pdf', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/x-wav', 'audio/aac', 'audio/ogg',
  'image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'])
on conflict (id) do update set public = false, file_size_limit = 52428800, allowed_mime_types = excluded.allowed_mime_types;

create or replace function can_read_material_object(path text) returns boolean
language sql stable security definer set search_path = public as $$
  select has_perm(split_part(path, '/', 1), 'materiales.gestionar')
      or has_perm(split_part(path, '/', 1), 'materiales.ver')
      or exists (select 1 from materials m where m.archivo_path = path
                  and audience_includes(m.production_id, auth.uid(), m.audiencia, m.grupos, m.personas))
$$;
create policy materiales_read on storage.objects for select to authenticated
  using (bucket_id = 'materiales' and can_read_material_object(name));
create policy materiales_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'materiales' and has_perm(split_part(name, '/', 1), 'materiales.gestionar'));
create policy materiales_remove on storage.objects for delete to authenticated
  using (bucket_id = 'materiales' and has_perm(split_part(name, '/', 1), 'materiales.gestionar'));

-- ──────── Comunicados ────────
create table announcements (
  id uuid primary key default gen_random_uuid(),
  production_id text not null references productions(id) on delete cascade,
  titulo text not null check (length(btrim(titulo)) between 1 and 160),
  cuerpo text not null check (length(btrim(cuerpo)) between 1 and 5000),
  importante boolean not null default false,
  audiencia text not null default 'todos' check (audiencia in ('todos', 'grupos', 'personas')),
  grupos text[] not null default '{}',
  personas uuid[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (audiencia <> 'grupos' or cardinality(grupos) > 0),
  check (audiencia <> 'personas' or cardinality(personas) > 0)
);
create index idx_announcements_prod on announcements(production_id, created_at desc);

create table announcement_reads (
  announcement_id uuid not null references announcements(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

create or replace function announcement_production(aid uuid) returns text
language sql stable security definer set search_path = public as $$
  select production_id from announcements where id = aid
$$;

create or replace function announcement_for_me(aid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from announcements a where a.id = aid
                  and audience_includes(a.production_id, auth.uid(), a.audiencia, a.grupos, a.personas))
$$;

alter table announcements enable row level security;
alter table announcement_reads enable row level security;
create policy announcements_team on announcements for all to authenticated
  using (has_perm(production_id, 'comunicados.enviar')) with check (has_perm(production_id, 'comunicados.enviar'));
create policy announcements_members on announcements for select to authenticated
  using (audience_includes(production_id, auth.uid(), audiencia, grupos, personas));
create policy announcement_reads_own on announcement_reads for select to authenticated using (user_id = auth.uid());
create policy announcement_reads_mark on announcement_reads for insert to authenticated
  with check (user_id = auth.uid() and announcement_for_me(announcement_id));
create policy announcement_reads_team on announcement_reads for select to authenticated
  using (has_perm(announcement_production(announcement_id), 'comunicados.enviar'));
revoke all on announcements, announcement_reads from anon;

-- Quién lo recibe y si ya lo leyó (para quien envía).
create or replace function announcement_read_status(aid uuid)
returns table (user_id uuid, nombre text, leido_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare a announcements%rowtype;
begin
  select * into a from announcements where id = aid;
  if not found or not has_perm(a.production_id, 'comunicados.enviar') then raise exception 'No autorizado'; end if;
  return query
    select m.user_id,
           coalesce(nullif(btrim(pe.nombre), ''), nullif(btrim(pr.nombre), ''), split_part(u.email::text, '@', 1)),
           r.read_at
      from production_members m
      join auth.users u on u.id = m.user_id
      left join profiles pr on pr.id = m.user_id
      left join people pe on pe.profile_id = m.user_id
      left join announcement_reads r on r.announcement_id = aid and r.user_id = m.user_id
     where m.production_id = a.production_id and m.role_id = 'integrante'
       and audience_includes(a.production_id, m.user_id, a.audiencia, a.grupos, a.personas)
     order by r.read_at nulls first, 2;
end $$;

-- Avisos sin leer por obra (Mi cuenta).
create or replace function my_unread_announcements()
returns table (production_id text, sin_leer int)
language sql stable security definer set search_path = public as $$
  select a.production_id, count(*)::int
    from announcements a
   where audience_includes(a.production_id, auth.uid(), a.audiencia, a.grupos, a.personas)
     and not exists (select 1 from announcement_reads r where r.announcement_id = a.id and r.user_id = auth.uid())
   group by a.production_id
$$;

revoke execute on function is_active_member(text, uuid) from public, anon;
revoke execute on function audience_includes(text, uuid, text, text[], uuid[]) from public, anon;
revoke execute on function can_read_material_object(text) from public, anon;
revoke execute on function announcement_production(uuid) from public, anon;
revoke execute on function announcement_for_me(uuid) from public, anon;
revoke execute on function announcement_read_status(uuid) from public, anon;
revoke execute on function my_unread_announcements() from public, anon;
grant execute on function is_active_member(text, uuid), audience_includes(text, uuid, text, text[], uuid[]), can_read_material_object(text),
  announcement_production(uuid), announcement_for_me(uuid), announcement_read_status(uuid), my_unread_announcements() to authenticated;

create trigger audit_materials after insert or update or delete on materials for each row execute function audit_row();
create trigger audit_announcements after insert or update or delete on announcements for each row execute function audit_row();

commit;
