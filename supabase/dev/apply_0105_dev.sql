-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV" (la base de darfproductions.com).
-- 0105: buscar personas por nombre, Nosotros desde Casa DARF y portal del equipo general con Casa DARF.
-- Requiere 0104. Si la base no es DEV, aborta. Se corre completa en Supabase → SQL Editor.
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
  if to_regprocedure('public.fan_visitas(uuid)') is null then
    raise exception 'ABORTADO: primero corre apply_0104_dev.sql.';
  end if;
end $$;
begin;

-- ════════ Buscar cuentas ════════
create or replace function puede_buscar_cuentas() returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin()
      or exists (select 1 from casa_members where user_id = auth.uid())
      or exists (select 1 from production_members m join role_permissions rp on rp.role_id = m.role_id
                  where m.user_id = auth.uid())
      or exists (select 1 from audition_members where user_id = auth.uid())
      or exists (select 1 from evento_equipo where user_id = auth.uid())
$$;

create or replace function buscar_cuentas(q text)
returns table (id uuid, nombre text, correo text, con_ficha boolean)
language plpgsql stable security definer set search_path = public as $$
declare t text := unaccent_lower(btrim(coalesce(q, '')));
begin
  if not puede_buscar_cuentas() then raise exception 'No autorizado'; end if;
  if char_length(t) < 2 then return; end if;
  return query
    select u.id,
           coalesce(nullif(btrim(pe.nombre), ''), nullif(btrim(pr.nombre), ''), split_part(u.email::text, '@', 1)),
           case when char_length(split_part(u.email::text, '@', 1)) > 5
                then left(split_part(u.email::text, '@', 1), 3) || '***' || right(split_part(u.email::text, '@', 1), 2)
                else left(split_part(u.email::text, '@', 1), 1) || '***' end || '@' || split_part(u.email::text, '@', 2),
           pe.id is not null
      from auth.users u
      join profiles pr on pr.id = u.id
      left join people pe on pe.profile_id = u.id
     where unaccent_lower(coalesce(pe.nombre, '')) like '%' || t || '%'
        or unaccent_lower(coalesce(pr.nombre, '')) like '%' || t || '%'
        or lower(u.email::text) like t || '%'
     order by coalesce(pe.nombre, pr.nombre, u.email::text)
     limit 8;
end $$;

-- El correo de UNA cuenta elegida en el buscador (para invitarla, agregarla o ligarla).
create or replace function cuenta_correo(uid uuid) returns text
language plpgsql stable security definer set search_path = public as $$
begin
  if not puede_buscar_cuentas() then raise exception 'No autorizado'; end if;
  return (select email::text from auth.users where id = uid);
end $$;

revoke all on function puede_buscar_cuentas(), buscar_cuentas(text), cuenta_correo(uuid) from public, anon;
grant execute on function buscar_cuentas(text), cuenta_correo(uuid) to authenticated;

-- ════════ Nosotros desde Casa DARF ════════
alter table casa_members add column if not exists en_nosotros boolean not null default true;

create or replace function team_public()
returns table (id uuid, nombre text, cargo text, slug text, retrato_path text, semblanza text)
language sql stable security definer set search_path = public as $$
  select m.user_id,
         coalesce(nullif(btrim(pe.nombre), ''), nullif(btrim(pr.nombre), ''), 'Equipo DARF'),
         string_agg(r.nombre, ' · ' order by r.orden),
         case when pe.id is not null and pro_is_public(pe.id) then max(pp.slug) end,
         case when pe.id is not null and pro_is_public(pe.id) then max(pp.retrato_path) end,
         case when pe.id is not null and pro_is_public(pe.id) then left(max(pp.semblanza), 280) end
    from casa_members m
    join panel_roles r on r.id = m.role_id
    join profiles pr on pr.id = m.user_id
    left join people pe on pe.profile_id = m.user_id
    left join pro_profiles pp on pp.person_id = pe.id
   where m.en_nosotros
   group by m.user_id, pe.id, pe.nombre, pr.nombre
   order by min(r.orden), 2
$$;
grant execute on function team_public() to anon, authenticated;

-- ════════ Portal del equipo general: también Casa DARF ════════
CREATE OR REPLACE FUNCTION public.is_team(pid text, uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select cardinality(team_member_roles(pid, uid)) > 0
      or (pid is null and (exists (select 1 from profiles where id = uid and rol in ('staff', 'admin'))
                         or exists (select 1 from casa_members where user_id = uid)))
$function$;

CREATE OR REPLACE FUNCTION public.team_recipients(pid text, aud text, roles text[], personas uuid[])
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(array_agg(distinct x), '{}') from (
    select m.user_id as x from production_members m join productions p on p.id = m.production_id
     where m.role_id <> 'integrante' and (m.production_id = pid or (pid is null and p.estado <> 'archivada'))
       and team_audience_includes(pid, m.user_id, aud, roles, personas)
    union
    select pr.id from profiles pr where pid is null and (pr.rol in ('staff', 'admin') or exists (select 1 from casa_members cm where cm.user_id = pr.id))
       and team_audience_includes(pid, pr.id, aud, roles, personas)
    union
    select unnest(case when pid is null then admin_ids() else users_with_perm(pid, 'equipo.gestionar') end)
  ) s
$function$;

CREATE OR REPLACE FUNCTION public.team_roster(pid text)
 RETURNS TABLE(user_id uuid, nombre text, roles text[], role_ids text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not team_can_manage(pid) then raise exception 'No autorizado'; end if;
  return query
    with gente as (
      select distinct m.user_id as uid from production_members m join productions p on p.id = m.production_id
       where m.role_id <> 'integrante' and (m.production_id = pid or (pid is null and p.estado <> 'archivada'))
      union
      select pr.id from profiles pr where pid is null and (pr.rol in ('staff', 'admin') or exists (select 1 from casa_members cm where cm.user_id = pr.id))
    )
    select g.uid,
           coalesce(nullif(btrim(pr.nombre), ''), split_part(u.email::text, '@', 1)),
           array(select r.nombre from panel_roles r where r.id = any(team_member_roles(pid, g.uid)) order by r.orden),
           team_member_roles(pid, g.uid)
      from gente g join auth.users u on u.id = g.uid left join profiles pr on pr.id = g.uid
     order by 2;
end $function$;

commit;
select 'Listo 0105. Personas en Nosotros (desde Casa DARF): ' || count(*) as resultado from team_public();
