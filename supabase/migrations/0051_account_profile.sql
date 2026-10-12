-- 0051: Mi cuenta completa (pedido de Diego, 2026-10-12; visión §9.1).
--   * Perfil: nombre(s) y apellidos por separado (profiles.nombre sigue siendo el nombre
--     completo que se muestra en todo el sitio; se arma solo), fecha de nacimiento y foto
--     personal (privada, distinta del retrato profesional de los créditos).
--   * Fecha de nacimiento ÚNICA: la de la cuenta y la del expediente (person_files) se
--     copian entre sí; se captura una sola vez.
--   * Cumpleaños: el Director ve todos (con edad); el equipo de una obra y su elenco activo
--     ven día y mes de quienes están en esa obra.
--   * Correo y contraseña se cambian con Supabase Auth (verificación por correo); no hay
--     cambios de base para eso.
-- Precede: 0050.

begin;

alter table profiles
  add column nombres text check (length(nombres) <= 80),
  add column apellidos text check (length(apellidos) <= 80),
  add column fecha_nacimiento date check (fecha_nacimiento between date '1900-01-01' and current_date),
  add column foto_path text check (foto_path is null or foto_path like id::text || '/%');

-- Lo que ya había en "nombre" pasa a "nombres"; la persona separa sus apellidos después.
update profiles set nombres = left(btrim(nombre), 80) where nombres is null and coalesce(btrim(nombre), '') <> '';

-- nombre = nombres + apellidos (o lo que llegue al registrarse).
create or replace function profiles_compose_name() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.nombres is null and coalesce(btrim(new.nombre), '') <> '' then
    new.nombres := left(btrim(new.nombre), 80);
  end if;
  if tg_op = 'INSERT' or new.nombres is distinct from old.nombres or new.apellidos is distinct from old.apellidos then
    if coalesce(btrim(new.nombres), '') <> '' then
      new.nombre := btrim(btrim(new.nombres) || ' ' || coalesce(btrim(new.apellidos), ''));
    end if;
  end if;
  return new;
end $$;
create trigger profiles_compose_name before insert or update on profiles for each row execute function profiles_compose_name();

-- ──────── Fecha de nacimiento única ────────
update profiles p set fecha_nacimiento = f.fecha_nacimiento
  from person_files f where f.user_id = p.id and p.fecha_nacimiento is null and f.fecha_nacimiento is not null;

create or replace function profiles_sync_birth() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update person_files set fecha_nacimiento = new.fecha_nacimiento
   where user_id = new.id and fecha_nacimiento is distinct from new.fecha_nacimiento;
  return new;
end $$;
create trigger profiles_sync_birth after update of fecha_nacimiento on profiles
  for each row when (new.fecha_nacimiento is distinct from old.fecha_nacimiento) execute function profiles_sync_birth();

create or replace function person_files_sync_birth() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update profiles set fecha_nacimiento = new.fecha_nacimiento
   where id = new.user_id and fecha_nacimiento is distinct from new.fecha_nacimiento;
  return new;
end $$;
create trigger person_files_sync_birth after insert or update of fecha_nacimiento on person_files
  for each row execute function person_files_sync_birth();

-- ──────── Foto personal (bucket privado) ────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatares', 'avatares', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = excluded.allowed_mime_types;

-- La ven: la persona, el Director y el equipo (obra.ver) de una obra donde está.
create or replace function can_see_avatar(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    uid = auth.uid() or is_admin()
    or exists (select 1 from production_members m where m.user_id = uid and has_perm(m.production_id, 'obra.ver')))
$$;
create or replace function avatar_owner(path text) returns uuid
language sql immutable as $$
  select case when split_part(path, '/', 1) ~ '^[0-9a-f-]{36}$' then split_part(path, '/', 1)::uuid end
$$;

create policy avatares_read on storage.objects for select to authenticated
  using (bucket_id = 'avatares' and can_see_avatar(avatar_owner(name)));
create policy avatares_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'avatares' and avatar_owner(name) = auth.uid());
create policy avatares_remove on storage.objects for delete to authenticated
  using (bucket_id = 'avatares' and avatar_owner(name) = auth.uid());

-- ──────── Cumpleaños ────────
-- pid null: todas las cuentas (solo el Director, con año). pid: quienes están en esa obra
-- (equipo e integrantes activos), solo día y mes; la ve su equipo y su elenco activo.
create or replace function birthdays(pid text default null)
returns table (user_id uuid, nombre text, dia int, mes int, nacimiento date, foto_path text)
language plpgsql stable security definer set search_path = public as $$
begin
  if pid is null then
    if not is_admin() then raise exception 'Solo el Director.'; end if;
    return query
      select p.id, coalesce(nullif(btrim(p.nombre), ''), split_part(u.email::text, '@', 1)),
             extract(day from p.fecha_nacimiento)::int, extract(month from p.fecha_nacimiento)::int, p.fecha_nacimiento, p.foto_path
        from profiles p join auth.users u on u.id = p.id
       where p.fecha_nacimiento is not null
       order by 4, 3, 2;
  else
    if not (has_perm(pid, 'obra.ver') or is_active_member(pid, auth.uid())) then raise exception 'No autorizado'; end if;
    return query
      with gente as (
        select m.user_id as uid from production_members m
         where m.production_id = pid and (m.role_id <> 'integrante' or is_active_member(pid, m.user_id))
        union
        select pe.profile_id from production_credits c join people pe on pe.id = c.person_id
         where c.production_id = pid and c.activo and pe.profile_id is not null
      )
      select p.id, p.nombre, extract(day from p.fecha_nacimiento)::int, extract(month from p.fecha_nacimiento)::int,
             case when is_admin() then p.fecha_nacimiento end,
             case when has_perm(pid, 'obra.ver') then p.foto_path end
        from gente g join profiles p on p.id = g.uid
       where p.fecha_nacimiento is not null and coalesce(btrim(p.nombre), '') <> ''
       order by 4, 3, 2;
  end if;
end $$;

revoke execute on function profiles_compose_name() from public, anon, authenticated;
revoke execute on function profiles_sync_birth() from public, anon, authenticated;
revoke execute on function person_files_sync_birth() from public, anon, authenticated;
revoke execute on function can_see_avatar(uuid) from public, anon;
revoke execute on function birthdays(text) from public, anon;
grant execute on function can_see_avatar(uuid), birthdays(text) to authenticated;

commit;
