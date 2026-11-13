-- 0144 (Diego 2026-11-13): Casa DARF con cargo propio y orden manual.
--   El puesto (Dirección artística, Administración y finanzas…) sigue siendo el área y lo que puede hacer la persona.
--   Además, cada persona tiene su cargo específico (Director de contenidos, Director de producciones…) y un lugar en la
--   lista que se acomoda a mano (jerarquía). El cargo sale en el gafete, en Conoce al equipo y en el directorio; el
--   orden manda en Ajustes → Casa DARF y en Conoce al equipo.
-- Precede: 0143.
begin;

create table if not exists casa_cargos (
  user_id uuid primary key references profiles(id) on delete cascade,
  cargo text check (cargo is null or length(btrim(cargo)) between 1 and 60),
  orden int not null default 1000,
  updated_at timestamptz not null default now()
);
alter table casa_cargos enable row level security;
drop policy if exists casa_cargos_read on casa_cargos;
create policy casa_cargos_read on casa_cargos for select to authenticated using (user_id = auth.uid() or is_admin());
drop policy if exists casa_cargos_admin on casa_cargos;
create policy casa_cargos_admin on casa_cargos for all to authenticated using (is_admin()) with check (is_admin());
revoke all on casa_cargos from anon;
drop trigger if exists audit_casa_cargos on casa_cargos;
create trigger audit_casa_cargos after insert or update or delete on casa_cargos for each row execute function audit_row();

-- El pase de Wallet se actualiza al cambiar el cargo (y al entrar o salir de Casa DARF, que antes no avisaba).
create or replace function wallet_trg_cuenta() returns trigger
language plpgsql security definer set search_path = public as $$
declare j jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end; u uuid[];
begin
  u := case tg_table_name
         when 'fan_members' then array[(j->>'user_id')::uuid]
         when 'badges' then array[(j->>'user_id')::uuid]
         when 'production_members' then array[(j->>'user_id')::uuid]
         when 'casa_members' then array[(j->>'user_id')::uuid]
         when 'casa_cargos' then array[(j->>'user_id')::uuid]
         when 'profiles' then array[(j->>'id')::uuid]
         else array(select profile_id from people
                     where id = (j->>'person_id')::uuid and profile_id is not null)
       end;
  perform wallet_marcar_cuentas(u);
  return null;
end $$;
drop trigger if exists wallet_casa_cargo on casa_cargos;
create trigger wallet_casa_cargo after insert or update or delete on casa_cargos for each row execute function wallet_trg_cuenta();

-- Quien sale de Casa DARF deja de tener cargo y lugar.
create or replace function casa_cargos_limpiar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from casa_members where user_id = old.user_id) then
    delete from casa_cargos where user_id = old.user_id;
  end if;
  return null;
end $$;
drop trigger if exists casa_cargos_limpiar on casa_members;
create trigger casa_cargos_limpiar after delete on casa_members for each row execute function casa_cargos_limpiar();

-- Lista para Ajustes: en el orden manual (quien no tiene lugar, al final, por el orden de su puesto y su nombre).
drop function if exists casa_lista();
create function casa_lista()
returns table (user_id uuid, nombre text, email text, roles text[], desde date, cargo text, orden int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'No autorizado'; end if;
  return query
    select m.user_id, coalesce(nullif(btrim(p.nombre), ''), split_part(u.email::text, '@', 1)), u.email::text,
           array_agg(m.role_id order by r.orden), min(m.desde), c.cargo, coalesce(c.orden, 1000)
      from casa_members m join profiles p on p.id = m.user_id join auth.users u on u.id = m.user_id
      join panel_roles r on r.id = m.role_id
      left join casa_cargos c on c.user_id = m.user_id
     group by m.user_id, p.nombre, u.email, c.cargo, c.orden
     order by coalesce(c.orden, 1000), min(r.orden), 2;
end $$;
revoke all on function casa_lista() from public, anon;
grant execute on function casa_lista() to authenticated;

-- Cargo específico de una persona (vacío = se usa el nombre de su puesto).
create or replace function casa_cargo_guardar(uid uuid, p_cargo text) returns void
language plpgsql security definer set search_path = public as $$
declare v text := nullif(btrim(coalesce(p_cargo, '')), '');
begin
  if not is_admin() then raise exception 'Solo el Director cambia los cargos de Casa DARF.'; end if;
  if not exists (select 1 from casa_members where user_id = uid) then raise exception 'Esa persona no es de Casa DARF.'; end if;
  if length(v) > 60 then raise exception 'El cargo es muy largo (máximo 60 letras).'; end if;
  insert into casa_cargos (user_id, cargo) values (uid, v)
  on conflict (user_id) do update set cargo = excluded.cargo, updated_at = now();
end $$;
revoke all on function casa_cargo_guardar(uuid, text) from public, anon;
grant execute on function casa_cargo_guardar(uuid, text) to authenticated;

-- Mover a alguien en la lista: 'arriba', 'abajo', 'primero' o 'ultimo'. Numera a todos 10, 20, 30… en el orden actual.
create or replace function casa_mover(uid uuid, p_dir text) returns void
language plpgsql security definer set search_path = public as $$
declare ids uuid[]; i int; n int; j int;
begin
  if not is_admin() then raise exception 'Solo el Director acomoda Casa DARF.'; end if;
  if p_dir not in ('arriba', 'abajo', 'primero', 'ultimo') then raise exception 'Movimiento no válido.'; end if;
  select array_agg(x.user_id order by x.o, x.ro, x.nombre) into ids from (
    select m.user_id, coalesce(c.orden, 1000) o, min(r.orden) ro, min(coalesce(nullif(btrim(p.nombre), ''), '')) nombre
      from casa_members m join panel_roles r on r.id = m.role_id join profiles p on p.id = m.user_id
      left join casa_cargos c on c.user_id = m.user_id
     group by m.user_id, c.orden) x;
  i := array_position(ids, uid);
  if i is null then raise exception 'Esa persona no es de Casa DARF.'; end if;
  n := cardinality(ids);
  j := case p_dir when 'arriba' then greatest(i - 1, 1) when 'abajo' then least(i + 1, n) when 'primero' then 1 else n end;
  if j <> i then
    ids := array_remove(ids, uid);
    ids := ids[1:j - 1] || uid || ids[j:n];
  end if;
  insert into casa_cargos (user_id, orden)
  select ids[k], k * 10 from generate_subscripts(ids, 1) k
  on conflict (user_id) do update set orden = excluded.orden, updated_at = now();
end $$;
revoke all on function casa_mover(uuid, text) from public, anon;
grant execute on function casa_mover(uuid, text) to authenticated;

-- Conoce al equipo: su cargo (o sus puestos) y en el orden manual.
create or replace function team_public()
returns table (id uuid, nombre text, cargo text, slug text, retrato_path text, semblanza text)
language sql stable security definer set search_path = public as $$
  select m.user_id,
         coalesce(nullif(btrim(pe.nombre), ''), nullif(btrim(pr.nombre), ''), 'Equipo DARF'),
         coalesce(c.cargo, string_agg(r.nombre, ' · ' order by r.orden)),
         case when pe.id is not null and pro_is_public(pe.id) then max(pp.slug) end,
         case when pe.id is not null and pro_is_public(pe.id) then max(pp.retrato_path) end,
         case when pe.id is not null and pro_is_public(pe.id) then left(max(pp.semblanza), 280) end
    from casa_members m
    join panel_roles r on r.id = m.role_id
    join profiles pr on pr.id = m.user_id
    left join casa_cargos c on c.user_id = m.user_id
    left join people pe on pe.profile_id = m.user_id
    left join pro_profiles pp on pp.person_id = pe.id
   where m.en_nosotros
   group by m.user_id, pe.id, pe.nombre, pr.nombre, c.cargo, c.orden
   order by coalesce(c.orden, 1000), min(r.orden), 2
$$;
grant execute on function team_public() to anon, authenticated;

-- Gafete: en Casa DARF sale su cargo específico; si no tiene, el nombre de su puesto (como antes).
CREATE OR REPLACE FUNCTION public.badge_papel(uid uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare rol_app text; v_cargo text; v_nivel int; v_papel text; v_casa text; v_desde int;
begin
  select rol into rol_app from profiles where id = uid;
  -- Casa DARF: su cargo (0144) o su puesto (CEO, CFO…); si no tiene, su cargo en Nosotros (el admin: Dirección DARF).
  if rol_app = 'admin' or exists (select 1 from casa_members where user_id = uid) then
    select tm.cargo into v_cargo
      from team_members tm join people pe on pe.id = tm.person_id
     where pe.profile_id = uid order by tm.orden, tm.created_at limit 1;
    select coalesce((select c.cargo from casa_cargos c where c.user_id = uid),
                    (select r.nombre from casa_members m join panel_roles r on r.id = m.role_id where m.user_id = uid order by r.orden limit 1))
      into v_casa;
    select extract(year from coalesce(min(m.desde), (select created_at from profiles where id = uid)::date))::int into v_desde
      from casa_members m where m.user_id = uid;
    return json_build_object('franja', 'casa', 'papel', coalesce(v_casa, v_cargo, 'Dirección DARF'), 'casa_desde', v_desde);
  end if;

  -- Niveles: 1 dirección general · 2 producción · 3 dirección · 4 elenco · 5 crew · 6 staff.
  select x.nivel, x.papel into v_nivel, v_papel from (
    select case when m.role_id = 'integrante' then 4
                else case r.categoria when 'direccion_general' then 1 when 'produccion' then 2 when 'direccion' then 3 when 'crew' then 5 else 6 end end as nivel,
           case when m.role_id = 'integrante' then 'Elenco' else r.nombre end as papel,
           r.orden as sub, p.concluded, p.created_at
      from production_members m
      join panel_roles r on r.id = m.role_id
      join productions p on p.id = m.production_id
     where m.user_id = uid
    union all
    select case c.tipo when 'produccion' then 2 when 'creativo' then 3 when 'reparto' then 4 when 'ensamble' then 4 when 'staff' then 6 else 5 end,
           case when c.tipo in ('reparto', 'ensamble') then 'Elenco' when c.tipo = 'staff' then 'Staff' else coalesce(nullif(btrim(c.papel), ''), 'Equipo') end,
           c.orden, p.concluded, p.created_at
      from production_credits c
      join people pe on pe.id = c.person_id
      join productions p on p.id = c.production_id
     where pe.profile_id = uid and c.activo
  ) x
  order by x.nivel, x.concluded, x.created_at desc, x.sub
  limit 1;

  -- Staff general de DARF: al menos Staff.
  if rol_app = 'staff' and (v_nivel is null or v_nivel > 6) then
    return json_build_object('franja', 'staff', 'papel', 'Staff DARF');
  end if;
  if v_nivel is null then return null; end if;
  return json_build_object('franja', case v_nivel when 1 then 'direccion_general' when 2 then 'produccion' when 3 then 'direccion' when 6 then 'staff' else 'crew' end, 'papel', v_papel);
end $function$;

commit;
