-- 0145 (Diego 2026-11-13): Casa DARF con "cabezas" de la empresa y descripción del cargo.
--   * casa_cargos.directivo: las cabezas de la empresa salen aparte y primero (Ajustes y Conoce al equipo).
--     El orden manual (0144) se acomoda dentro de cada grupo.
--   * casa_cargos.descripcion: qué hace la persona en DARF, en una o dos líneas (sale en Conoce al equipo).
-- Precede: 0144.
begin;

alter table casa_cargos add column if not exists directivo boolean not null default false;
alter table casa_cargos add column if not exists descripcion text;
alter table casa_cargos drop constraint if exists casa_cargos_descripcion_largo;
alter table casa_cargos add constraint casa_cargos_descripcion_largo check (descripcion is null or length(btrim(descripcion)) between 1 and 240);

drop function if exists casa_lista();
create function casa_lista()
returns table (user_id uuid, nombre text, email text, roles text[], desde date, cargo text, orden int, directivo boolean, descripcion text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'No autorizado'; end if;
  return query
    select m.user_id, coalesce(nullif(btrim(p.nombre), ''), split_part(u.email::text, '@', 1)), u.email::text,
           array_agg(m.role_id order by r.orden), min(m.desde), c.cargo, coalesce(c.orden, 1000), coalesce(c.directivo, false), c.descripcion
      from casa_members m join profiles p on p.id = m.user_id join auth.users u on u.id = m.user_id
      join panel_roles r on r.id = m.role_id
      left join casa_cargos c on c.user_id = m.user_id
     group by m.user_id, p.nombre, u.email, c.cargo, c.orden, c.directivo, c.descripcion
     order by coalesce(c.directivo, false) desc, coalesce(c.orden, 1000), min(r.orden), 2;
end $$;
revoke all on function casa_lista() from public, anon;
grant execute on function casa_lista() to authenticated;

-- Cargo, descripción y si es cabeza de la empresa, en un solo guardado. Al cambiar de grupo, pasa al final del nuevo.
create or replace function casa_perfil_guardar(uid uuid, p_cargo text, p_descripcion text, p_directivo boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_cargo text := nullif(btrim(coalesce(p_cargo, '')), ''); v_desc text := nullif(btrim(coalesce(p_descripcion, '')), '');
        antes boolean; ultimo int;
begin
  if not is_admin() then raise exception 'Solo el Director cambia los cargos de Casa DARF.'; end if;
  if not exists (select 1 from casa_members where user_id = uid) then raise exception 'Esa persona no es de Casa DARF.'; end if;
  if length(v_cargo) > 60 then raise exception 'El cargo es muy largo (máximo 60 letras).'; end if;
  if length(v_desc) > 240 then raise exception 'La descripción es muy larga (máximo 240 letras).'; end if;
  select directivo into antes from casa_cargos where user_id = uid;
  insert into casa_cargos (user_id, cargo, descripcion, directivo) values (uid, v_cargo, v_desc, coalesce(p_directivo, false))
  on conflict (user_id) do update set cargo = excluded.cargo, descripcion = excluded.descripcion, directivo = excluded.directivo, updated_at = now();
  if coalesce(antes, false) is distinct from coalesce(p_directivo, false) then
    select coalesce(max(c.orden), 0) into ultimo from casa_cargos c join casa_members m on m.user_id = c.user_id
     where c.directivo = coalesce(p_directivo, false) and c.user_id <> uid and c.orden < 1000;
    update casa_cargos set orden = ultimo + 10 where user_id = uid;
  end if;
end $$;
revoke all on function casa_perfil_guardar(uuid, text, text, boolean) from public, anon;
grant execute on function casa_perfil_guardar(uuid, text, text, boolean) to authenticated;

-- Mover dentro de su grupo (cabezas o el resto). Numera 10, 20, 30… en el orden de la lista completa.
create or replace function casa_mover(uid uuid, p_dir text) returns void
language plpgsql security definer set search_path = public as $$
declare ids uuid[]; grupo uuid[]; g boolean; i int; n int; j int;
begin
  if not is_admin() then raise exception 'Solo el Director acomoda Casa DARF.'; end if;
  if p_dir not in ('arriba', 'abajo', 'primero', 'ultimo') then raise exception 'Movimiento no válido.'; end if;
  if not exists (select 1 from casa_members where user_id = uid) then raise exception 'Esa persona no es de Casa DARF.'; end if;
  select coalesce((select directivo from casa_cargos where user_id = uid), false) into g;
  select array_agg(x.user_id order by x.d desc, x.o, x.ro, x.nombre), array_agg(x.user_id order by x.d desc, x.o, x.ro, x.nombre) filter (where x.d = g)
    into ids, grupo from (
    select m.user_id, coalesce(c.directivo, false) d, coalesce(c.orden, 1000) o, min(r.orden) ro, min(coalesce(nullif(btrim(p.nombre), ''), '')) nombre
      from casa_members m join panel_roles r on r.id = m.role_id join profiles p on p.id = m.user_id
      left join casa_cargos c on c.user_id = m.user_id
     group by m.user_id, c.directivo, c.orden) x;
  i := array_position(grupo, uid);
  n := cardinality(grupo);
  j := case p_dir when 'arriba' then greatest(i - 1, 1) when 'abajo' then least(i + 1, n) when 'primero' then 1 else n end;
  if j <> i then
    grupo := array_remove(grupo, uid);
    grupo := grupo[1:j - 1] || uid || grupo[j:n];
  end if;
  -- La lista completa: las cabezas primero y luego el resto, cada grupo en su nuevo orden.
  ids := case when g then grupo || array(select x from unnest(ids) x where x <> all(grupo))
              else array(select x from unnest(ids) x where x <> all(grupo)) || grupo end;
  insert into casa_cargos (user_id, orden)
  select ids[k], k * 10 from generate_subscripts(ids, 1) k
  on conflict (user_id) do update set orden = excluded.orden, updated_at = now();
end $$;
revoke all on function casa_mover(uuid, text) from public, anon;
grant execute on function casa_mover(uuid, text) to authenticated;

-- Conoce al equipo: con si es cabeza y la descripción de su cargo.
drop function if exists team_public();
create function team_public()
returns table (id uuid, nombre text, cargo text, slug text, retrato_path text, semblanza text, directivo boolean, descripcion text)
language sql stable security definer set search_path = public as $$
  select m.user_id,
         coalesce(nullif(btrim(pe.nombre), ''), nullif(btrim(pr.nombre), ''), 'Equipo DARF'),
         coalesce(c.cargo, string_agg(r.nombre, ' · ' order by r.orden)),
         case when pe.id is not null and pro_is_public(pe.id) then max(pp.slug) end,
         case when pe.id is not null and pro_is_public(pe.id) then max(pp.retrato_path) end,
         case when pe.id is not null and pro_is_public(pe.id) then left(max(pp.semblanza), 280) end,
         coalesce(c.directivo, false), c.descripcion
    from casa_members m
    join panel_roles r on r.id = m.role_id
    join profiles pr on pr.id = m.user_id
    left join casa_cargos c on c.user_id = m.user_id
    left join people pe on pe.profile_id = m.user_id
    left join pro_profiles pp on pp.person_id = pe.id
   where m.en_nosotros
   group by m.user_id, pe.id, pe.nombre, pr.nombre, c.cargo, c.orden, c.directivo, c.descripcion
   order by coalesce(c.directivo, false) desc, coalesce(c.orden, 1000), min(r.orden), 2
$$;
revoke all on function team_public() from public;
grant execute on function team_public() to anon, authenticated;

commit;
