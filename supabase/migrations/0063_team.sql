-- 0063: Equipo DARF (Bloque 5, plan del 2026-10-12; decisión de Diego: solo los directivos).
--   * team_members: qué fichas (people) forman el equipo directivo, con su cargo y orden.
--     Solo el Director agrega, edita o quita.
--   * La página pública /nosotros lee team_public(): nombre y cargo de los visibles; la foto y
--     el enlace al perfil solo si la persona hizo PÚBLICO su perfil profesional (0057).
--   * Las obras no cambian: sus equipos siguen como hoy.
-- Precede: 0062.

begin;

create table team_members (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null unique references people(id) on delete cascade,
  cargo text not null check (length(btrim(cargo)) between 1 and 80),
  orden int not null default 0,
  visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table team_members enable row level security;
create policy team_members_admin on team_members for all to authenticated
  using (is_admin()) with check (is_admin());
revoke all on team_members from anon;

create or replace function team_touch() returns trigger
language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
create trigger team_members_touch before update on team_members for each row execute function team_touch();

-- Lo que ve el público: solo los visibles; foto y perfil solo si el perfil es público.
create or replace function team_public()
returns table (id uuid, nombre text, cargo text, slug text, retrato_path text, semblanza text)
language sql stable security definer set search_path = public as $$
  select t.id, pe.nombre, t.cargo,
         case when pro_is_public(pe.id) then pp.slug end,
         case when pro_is_public(pe.id) then pp.retrato_path end,
         case when pro_is_public(pe.id) then left(pp.semblanza, 280) end
    from team_members t
    join people pe on pe.id = t.person_id
    left join pro_profiles pp on pp.person_id = pe.id
   where t.visible
   order by t.orden, pe.nombre
$$;

revoke execute on function team_touch() from public, anon, authenticated;
revoke execute on function team_public() from public;
grant execute on function team_public() to anon, authenticated;

create trigger audit_team_members after insert or update or delete on team_members for each row execute function audit_row();

commit;
