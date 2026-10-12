-- 0047: interconexión de personas (pedido de Diego, 2026-10-12).
--   * Ficha de cualquier persona del elenco, tenga o no cuenta (las de la 1.0 se
--     capturaron a mano): obras y papeles. Si tiene cuenta, la web abre su ficha completa.
--   * Sugerencias para ligar fichas sin cuenta con cuentas existentes: mismo nombre (sin
--     acentos ni mayúsculas) en su perfil o en una audición hecha con esa cuenta. El
--     Director revisa y liga (people_link_account, 0042).
--   * Compras y funciones a las que asistió cada cuenta (público y elenco). Solo el Director.
-- Precede: 0046. Sin cambios a tablas.

begin;

-- ¿Puede ver la ficha de esta persona (sin cuenta)? Director o quien edita créditos de
-- una obra donde aparece.
create or replace function can_view_person(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    is_admin()
    or exists (select 1 from production_credits c where c.person_id = pid
                and (has_perm(c.production_id, 'elenco.gestionar') or has_perm(c.production_id, 'obra.editar'))))
$$;

create or replace function person_history(pid uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  if not can_view_person(pid) then raise exception 'No autorizado'; end if;
  select jsonb_build_object(
    'id', pe.id, 'nombre', pe.nombre, 'profile_id', pe.profile_id,
    'obras', coalesce((select jsonb_agg(jsonb_build_object('production_id', c.production_id, 'obra', p.nombre, 'tipo', c.tipo,
                                                            'papel', c.papel, 'activo', c.activo) order by p.created_at desc)
                         from production_credits c join productions p on p.id = c.production_id where c.person_id = pe.id), '[]'))
    into out
    from people pe where pe.id = pid;
  if out is null then raise exception 'No se encontró la ficha.'; end if;
  return out;
end $$;

-- Sugerencias de liga: fichas sin cuenta cuyo nombre coincide con una cuenta sin ficha.
create or replace function people_link_suggestions()
returns table (person_id uuid, persona text, user_id uuid, email text, cuenta text, motivo text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo el Director.'; end if;
  return query
    with cuentas as (
      select pr.id as uid, pr.nombre as nombre, 'Mismo nombre en su perfil' as motivo
        from profiles pr where coalesce(btrim(pr.nombre), '') <> ''
      union
      select a.user_id, a.nombre, 'Mismo nombre en una audición' from audition_applications a where a.user_id is not null
    )
    select distinct on (pe.id, c.uid) pe.id, pe.nombre, c.uid, u.email::text, c.nombre, c.motivo
      from people pe
      join cuentas c on unaccent_lower(btrim(c.nombre)) = unaccent_lower(btrim(pe.nombre))
      join auth.users u on u.id = c.uid
     where pe.profile_id is null
       and not exists (select 1 from people x where x.profile_id = c.uid)
     order by pe.id, c.uid, c.motivo
     limit 200;
end $$;

-- Compras y asistencia a funciones de una cuenta (Director).
create or replace function talent_purchases(uid uuid)
returns table (order_code text, obra text, funcion timestamptz, estado text, total numeric, boletos int, asistio int, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo el Director.'; end if;
  return query
    select o.order_code, p.nombre, pf.starts_at, o.status::text, o.total,
           (select count(*)::int from tickets t where t.order_id = o.id),
           (select count(*)::int from tickets t where t.order_id = o.id and t.checked_in_at is not null),
           o.created_at
      from orders o
      join performances pf on pf.id = o.performance_id
      join productions p on p.id = pf.production_id
     where o.buyer_user_id = uid
     order by pf.starts_at desc;
end $$;

revoke execute on function can_view_person(uuid) from public, anon;
revoke execute on function person_history(uuid) from public, anon;
revoke execute on function people_link_suggestions() from public, anon;
revoke execute on function talent_purchases(uuid) from public, anon;
grant execute on function can_view_person(uuid), person_history(uuid), people_link_suggestions(), talent_purchases(uuid) to authenticated;

commit;
