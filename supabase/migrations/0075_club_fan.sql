-- 0075: Club Fan y Fan Zone interactiva (Diego 2026-10-12, imagen de referencia de la Fan Zone).
--   fan_members: socios del Club Fan con número consecutivo (gratis; se unen de un toque en
--     /fan-zone). Fan fundador = socios #1 a #100.
--   La Fan Zone es del club: los contenidos se ven siendo socio (el equipo de la obra los sigue
--     viendo para trabajar). anuncio_club_ok (0074) ahora revisa el club.
--   fanzone_items: categoria (ensayo, making, fotos, otro) y disponible_desde (se desbloquea en
--     esa fecha; antes la base no entrega el archivo ni el video, solo título y fecha con
--     fanzone_proximos).
--   fan_encuentros / fan_encuentro_lugares: "Foto con el elenco" por función, con cupo. Apartar
--     pide ser socio y tener boleto aprobado de esa función.
-- Precede: 0074.

begin;

-- ──────── Club Fan ────────
create table fan_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  numero int generated always as identity unique,
  created_at timestamptz not null default now()
);
alter table fan_members enable row level security;
create policy fan_members_own on fan_members for select to authenticated using (user_id = auth.uid());
create policy fan_members_admin on fan_members for select to authenticated using (is_admin());

create or replace function is_fan_member() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (select 1 from fan_members where user_id = auth.uid())
$$;
revoke execute on function is_fan_member() from public, anon;
grant execute on function is_fan_member() to authenticated;

-- Unirse (idempotente). Devuelve la credencial.
create or replace function fan_join() returns json
language plpgsql security definer set search_path = public as $$
declare m fan_members;
begin
  if auth.uid() is null then raise exception 'Necesitas iniciar sesión.'; end if;
  insert into fan_members (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  select * into m from fan_members where user_id = auth.uid();
  return json_build_object('numero', m.numero, 'desde', m.created_at, 'fundador', m.numero <= 100);
end $$;
revoke execute on function fan_join() from public, anon;
grant execute on function fan_join() to authenticated;

-- Mi credencial (null si no soy socio).
create or replace function fan_me() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('numero', numero, 'desde', created_at, 'fundador', numero <= 100)
    from fan_members where user_id = auth.uid()
$$;
revoke execute on function fan_me() from public, anon;
grant execute on function fan_me() to authenticated;

-- Contenido "solo Club Fan" de los anuncios (0074).
create or replace function anuncio_club_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or is_fan_member()
$$;

-- ──────── Contenidos de la Fan Zone ────────
alter table fanzone_items
  add column categoria text not null default 'otro' check (categoria in ('ensayo', 'making', 'fotos', 'otro')),
  add column disponible_desde timestamptz;
update fanzone_items set categoria = case tipo when 'video' then 'ensayo' when 'foto' then 'fotos' else 'otro' end;

drop policy fanzone_items_fans on fanzone_items;
create policy fanzone_items_fans on fanzone_items for select to authenticated
  using (visible and production_is_visible(production_id) and is_fan_member()
         and (disponible_desde is null or disponible_desde <= now()));

-- Lo que viene (bloqueado por fecha): solo título, tipo, categoría y fecha.
create or replace function fanzone_proximos(pid text default null)
returns table (id uuid, production_id text, tipo text, categoria text, titulo text, disponible_desde timestamptz)
language sql stable security definer set search_path = public as $$
  select i.id, i.production_id, i.tipo, i.categoria, i.titulo, i.disponible_desde
    from fanzone_items i
   where is_fan_member() and i.visible and production_is_visible(i.production_id)
     and i.disponible_desde > now()
     and (pid is null or i.production_id = pid)
   order by i.disponible_desde
$$;
revoke execute on function fanzone_proximos(text) from public, anon;
grant execute on function fanzone_proximos(text) to authenticated;

-- ──────── Foto con el elenco ────────
create table fan_encuentros (
  id uuid primary key default gen_random_uuid(),
  production_id text not null references productions(id) on delete cascade,
  performance_id uuid not null references performances(id) on delete cascade,
  cupo int not null check (cupo between 1 and 500),
  abierto boolean not null default true,
  notas text check (length(notas) <= 300),
  created_at timestamptz not null default now(),
  unique (performance_id)
);
create table fan_encuentro_lugares (
  encuentro_id uuid not null references fan_encuentros(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (encuentro_id, user_id)
);
alter table fan_encuentros enable row level security;
alter table fan_encuentro_lugares enable row level security;
create policy fan_encuentros_editor on fan_encuentros for all to authenticated
  using (has_perm(production_id, 'fanzone.editar')) with check (has_perm(production_id, 'fanzone.editar'));
create policy fan_encuentro_lugares_own on fan_encuentro_lugares for select to authenticated using (user_id = auth.uid());
create policy fan_encuentro_lugares_editor on fan_encuentro_lugares for select to authenticated
  using (exists (select 1 from fan_encuentros e where e.id = encuentro_id and has_perm(e.production_id, 'fanzone.editar')));
create trigger audit_fan_encuentros after insert or update or delete on fan_encuentros for each row execute function audit_row();

-- Encuentros que ve un socio: funciones que aún no pasan, lugares libres, si ya apartó y si puede
-- (tiene boleto aprobado de esa función).
create or replace function fan_encuentros_lista(pid text default null)
returns table (id uuid, production_id text, performance_id uuid, starts_at timestamptz, venue text, cupo int, libres int,
               abierto boolean, notas text, apartado boolean, con_boleto boolean)
language sql stable security definer set search_path = public as $$
  select e.id, e.production_id, e.performance_id, pf.starts_at, coalesce(pf.venue, pr.venue), e.cupo,
         greatest(0, e.cupo - (select count(*) from fan_encuentro_lugares l where l.encuentro_id = e.id))::int,
         e.abierto, e.notas,
         exists (select 1 from fan_encuentro_lugares l where l.encuentro_id = e.id and l.user_id = auth.uid()),
         exists (select 1 from orders o where o.performance_id = e.performance_id and o.buyer_user_id = auth.uid() and o.status = 'aprobado')
    from fan_encuentros e
    join performances pf on pf.id = e.performance_id
    join productions pr on pr.id = e.production_id
   where is_fan_member() and production_is_visible(e.production_id)
     and pf.starts_at > now()
     and (pid is null or e.production_id = pid)
   order by pf.starts_at
$$;
revoke execute on function fan_encuentros_lista(text) from public, anon;
grant execute on function fan_encuentros_lista(text) to authenticated;

create or replace function fan_encuentro_apartar(eid uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare e fan_encuentros; t timestamptz; usados int;
begin
  if not is_fan_member() then raise exception 'Únete al Club Fan para apartar tu lugar.'; end if;
  select * into e from fan_encuentros where id = eid for update;
  if not found or not production_is_visible(e.production_id) then raise exception 'Este encuentro no existe.'; end if;
  if not p_on then
    delete from fan_encuentro_lugares where encuentro_id = eid and user_id = auth.uid();
    return;
  end if;
  select starts_at into t from performances where id = e.performance_id;
  if t is null or t <= now() then raise exception 'Esta función ya pasó.'; end if;
  if not e.abierto then raise exception 'El registro para este encuentro está cerrado.'; end if;
  if not exists (select 1 from orders o where o.performance_id = e.performance_id and o.buyer_user_id = auth.uid() and o.status = 'aprobado') then
    raise exception 'Necesitas un boleto aprobado para esta función.';
  end if;
  if exists (select 1 from fan_encuentro_lugares where encuentro_id = eid and user_id = auth.uid()) then return; end if;
  select count(*) into usados from fan_encuentro_lugares where encuentro_id = eid;
  if usados >= e.cupo then raise exception 'Ya no hay lugares para este encuentro.'; end if;
  insert into fan_encuentro_lugares (encuentro_id, user_id) values (eid, auth.uid());
end $$;
revoke execute on function fan_encuentro_apartar(uuid, boolean) from public, anon;
grant execute on function fan_encuentro_apartar(uuid, boolean) to authenticated;

-- Lista para el equipo: quién apartó (nombre y teléfono del perfil).
create or replace function fan_encuentro_personas(eid uuid)
returns table (user_id uuid, nombre text, telefono text, numero int, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select l.user_id, coalesce(p.nombre, ''), p.telefono, m.numero, l.created_at
    from fan_encuentro_lugares l
    join fan_encuentros e on e.id = l.encuentro_id
    left join profiles p on p.id = l.user_id
    left join fan_members m on m.user_id = l.user_id
   where l.encuentro_id = eid and has_perm(e.production_id, 'fanzone.editar')
   order by l.created_at
$$;
revoke execute on function fan_encuentro_personas(uuid) from public, anon;
grant execute on function fan_encuentro_personas(uuid) to authenticated;

-- Socios del club para el Director (cuántos y fundadores).
create or replace function fan_club_resumen() returns json
language sql stable security definer set search_path = public as $$
  select case when is_admin() then json_build_object('socios', count(*), 'fundadores', count(*) filter (where numero <= 100)) end
    from fan_members
$$;
revoke execute on function fan_club_resumen() from public, anon;
grant execute on function fan_club_resumen() to authenticated;

commit;
