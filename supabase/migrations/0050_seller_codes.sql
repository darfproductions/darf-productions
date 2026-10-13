-- 0050: códigos de vendedor (decisiones de Diego, 2026-10-12).
--   * Cada cuenta tiene un código fijo, generado solo (p. ej. ANA7K2Q).
--   * En cada obra el código funciona solo para su elenco (integrantes activos o créditos
--     activos ligados a la cuenta). Quien tiene vendedores.gestionar puede activar a
--     cualquier otra cuenta, desactivar a alguien del elenco o crear vendedores externos
--     sin cuenta (p. ej. una compañía).
--   * Al comprar, un código que no existe o no está activo en esa obra se rechaza con
--     aviso (el comprador lo corrige o lo borra). Lo valida la base al crear la orden.
--   * Se mide por vendedor: órdenes, boletos y monto aprobados (sin comisión).
--     "Mis ventas" en Mi cuenta; tabla por obra en el panel y en Reportes.
-- Precede: 0049. Cambia la lógica de compra solo en el código de vendedor (aprobado por Diego).

begin;

-- ──────── Permiso nuevo ────────
insert into permissions (id, grupo, descripcion, orden) values
  ('vendedores.gestionar', 'Boletería', 'Activar vendedores y crear vendedores externos', 35);
alter table role_permissions disable trigger role_permissions_protect;
insert into role_permissions (role_id, permission_id) values ('productor', 'vendedores.gestionar'), ('taquilla', 'vendedores.gestionar');
alter table role_permissions enable trigger role_permissions_protect;

-- ──────── Vendedores ────────
-- user_id: código de una cuenta (uno por cuenta). null = vendedor externo o de la 1.0.
alter table sellers
  add column user_id uuid unique references auth.users(id) on delete cascade,
  add column created_by uuid references auth.users(id) on delete set null default auth.uid();
alter table sellers add constraint sellers_codigo_formato check (codigo ~ '^[A-Z0-9]{3,16}$') not valid;

create table seller_productions (
  seller_id uuid not null references sellers(id) on delete cascade,
  production_id text not null references productions(id) on delete cascade,
  activo boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (seller_id, production_id)
);
create index idx_seller_productions_prod on seller_productions(production_id);

-- Código nuevo: 3 letras del nombre + 4 al azar (sin 0/O, 1/I/L para no confundir).
create or replace function gen_seller_code(nombre text) returns text
language plpgsql volatile set search_path = public as $$
declare
  pre text := upper(left(regexp_replace(unaccent_lower(coalesce(nombre, '')), '[^a-z]', '', 'g'), 3));
  abc text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  c text;
begin
  if length(pre) < 3 then pre := rpad(pre, 3, 'X'); end if;
  loop
    c := pre;
    for i in 1..4 loop c := c || substr(abc, 1 + floor(random() * length(abc))::int, 1); end loop;
    exit when not exists (select 1 from sellers where codigo = c);
  end loop;
  return c;
end $$;

-- Crea el código de una cuenta si no tiene.
create or replace function ensure_account_seller(uid uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid; n text;
begin
  select id into sid from sellers where user_id = uid;
  if found then return sid; end if;
  select coalesce(nullif(btrim(pr.nombre), ''), split_part(u.email::text, '@', 1)) into n
    from auth.users u left join profiles pr on pr.id = u.id where u.id = uid;
  if n is null then raise exception 'No existe esa cuenta.'; end if;
  insert into sellers (nombre, codigo, user_id, created_by) values (n, gen_seller_code(n), uid, null)
  on conflict (user_id) do nothing
  returning id into sid;
  if sid is null then select id into sid from sellers where user_id = uid; end if;
  return sid;
end $$;

-- Toda cuenta nueva recibe su código; las que ya existen, ahora.
create or replace function profiles_seller_code() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform ensure_account_seller(new.id);
  return new;
end $$;
create trigger profiles_seller_code after insert on profiles for each row execute function profiles_seller_code();
select ensure_account_seller(p.id) from profiles p join auth.users u on u.id = p.id;

-- ¿La cuenta es del elenco de la obra? (integrante activo o crédito activo ligado a su ficha)
create or replace function seller_in_cast(uid uuid, pid text) returns boolean
language sql stable security definer set search_path = public as $$
  select is_active_member(pid, uid)
      or exists (select 1 from production_credits c join people pe on pe.id = c.person_id
                  where c.production_id = pid and pe.profile_id = uid and c.activo)
$$;

-- ¿El código vende en esta obra? Lo que el equipo decidió manda; si no decidió nada,
-- vale solo para el elenco.
create or replace function seller_active_in(sid uuid, pid text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select s.active and coalesce(sp.activo, s.user_id is not null and seller_in_cast(s.user_id, pid))
      from sellers s
      left join seller_productions sp on sp.seller_id = s.id and sp.production_id = pid
     where s.id = sid), false)
$$;

-- Nombre corto para mostrar al comprador: "Ana P."
create or replace function seller_short_name(n text) returns text
language sql immutable as $$
  select btrim(split_part(btrim(n), ' ', 1) || coalesce(' ' || nullif(left(split_part(btrim(n), ' ', 2), 1), '') || '.', ''))
$$;

-- Validación al comprar (la usan la compra en línea y la taquilla).
create or replace function orders_check_seller() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.seller_id is not null
     and not seller_active_in(new.seller_id, (select production_id from performances where id = new.performance_id)) then
    raise exception 'El código de vendedor no está activo en esta obra. Corrígelo o déjalo vacío.';
  end if;
  return new;
end $$;
create trigger orders_check_seller before insert on orders for each row execute function orders_check_seller();

-- Vista previa para el comprador: nombre corto o el motivo.
create or replace function preview_seller_code(target_performance_id uuid, target_code text) returns text
language plpgsql stable security definer set search_path = public as $$
declare s sellers%rowtype; pid text;
begin
  select production_id into pid from performances where id = target_performance_id;
  select * into s from sellers where codigo = upper(btrim(coalesce(target_code, '')));
  if not found or not s.active then raise exception 'Ese código de vendedor no existe.'; end if;
  if not seller_active_in(s.id, pid) then raise exception 'Ese código de vendedor no está activo en esta obra.'; end if;
  return seller_short_name(coalesce((select nullif(btrim(nombre), '') from profiles where id = s.user_id), s.nombre));
end $$;

-- ──────── Panel: vendedores de una obra ────────
create or replace function seller_list(pid text)
returns table (seller_id uuid, nombre text, codigo text, tipo text, activo boolean, decidido boolean,
               ordenes int, boletos int, monto numeric, pendientes int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (has_perm(pid, 'ventas.ver') or has_perm(pid, 'vendedores.gestionar') or has_perm(pid, 'reportes.ver')) then
    raise exception 'No autorizado';
  end if;
  return query
    with elenco as (
      select distinct m.user_id as uid from production_members m where m.production_id = pid and m.role_id = 'integrante'
      union
      select pe.profile_id from production_credits c join people pe on pe.id = c.person_id
       where c.production_id = pid and pe.profile_id is not null
    ),
    ids as (
      select s.id from sellers s join elenco e on e.uid = s.user_id
      union select sp.seller_id from seller_productions sp where sp.production_id = pid
      union select o.seller_id from orders o join performances pf on pf.id = o.performance_id
             where pf.production_id = pid and o.seller_id is not null
    ),
    ventas as (
      select o.seller_id,
             count(*) filter (where o.status = 'aprobado')::int as ordenes,
             coalesce(sum((select count(*) from tickets t where t.order_id = o.id and t.is_active)) filter (where o.status = 'aprobado'), 0)::int as boletos,
             coalesce(sum(o.total) filter (where o.status = 'aprobado'), 0) as monto,
             count(*) filter (where o.status = 'pendiente')::int as pendientes
        from orders o join performances pf on pf.id = o.performance_id
       where pf.production_id = pid and o.seller_id is not null
       group by o.seller_id
    )
    select s.id, coalesce((select nullif(btrim(pr.nombre), '') from profiles pr where pr.id = s.user_id), s.nombre),
           s.codigo,
           case when s.user_id is null then 'externo'
                when s.user_id in (select uid from elenco) then 'elenco' else 'cuenta' end,
           seller_active_in(s.id, pid),
           exists (select 1 from seller_productions sp where sp.seller_id = s.id and sp.production_id = pid),
           coalesce(v.ordenes, 0), coalesce(v.boletos, 0), coalesce(v.monto, 0), coalesce(v.pendientes, 0)
      from ids join sellers s on s.id = ids.id
      left join ventas v on v.seller_id = s.id
     order by coalesce(v.monto, 0) desc, 2;
end $$;

create or replace function seller_set_active(pid text, sid uuid, on_ boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_perm(pid, 'vendedores.gestionar') then raise exception 'No autorizado'; end if;
  if not exists (select 1 from sellers where id = sid) then raise exception 'No existe ese vendedor.'; end if;
  insert into seller_productions (seller_id, production_id, activo) values (sid, pid, on_)
  on conflict (seller_id, production_id) do update set activo = excluded.activo, updated_by = auth.uid(), updated_at = now();
end $$;

-- Vuelve a la regla automática (vale si es del elenco).
create or replace function seller_reset(pid text, sid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_perm(pid, 'vendedores.gestionar') then raise exception 'No autorizado'; end if;
  delete from seller_productions where seller_id = sid and production_id = pid;
end $$;

create or replace function seller_add_account(pid text, mail text) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid; sid uuid;
begin
  if not has_perm(pid, 'vendedores.gestionar') then raise exception 'No autorizado'; end if;
  select id into uid from auth.users where lower(email) = lower(btrim(mail));
  if not found then raise exception 'No hay una cuenta con ese correo. Pídele que se registre primero.'; end if;
  sid := ensure_account_seller(uid);
  perform seller_set_active(pid, sid, true);
  return (select codigo from sellers where id = sid);
end $$;

create or replace function seller_add_external(pid text, nombre_ text) returns text
language plpgsql security definer set search_path = public as $$
declare sid uuid; c text;
begin
  if not has_perm(pid, 'vendedores.gestionar') then raise exception 'No autorizado'; end if;
  if length(btrim(coalesce(nombre_, ''))) not between 2 and 120 then raise exception 'Escribe el nombre del vendedor.'; end if;
  c := gen_seller_code(nombre_);
  insert into sellers (nombre, codigo) values (btrim(nombre_), c) returning id into sid;
  insert into seller_productions (seller_id, production_id, activo) values (sid, pid, true);
  return c;
end $$;

-- ──────── Mi cuenta: mi código y mis ventas ────────
create or replace function my_seller()
returns table (codigo text, production_id text, obra text, activo boolean, en_venta boolean,
               ordenes int, boletos int, monto numeric, pendientes int)
language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
  sid := ensure_account_seller(auth.uid());
  return query
    with obras as (
      select p.id from productions p where seller_active_in(sid, p.id) and p.estado = 'publicada'
      union
      select pf.production_id from orders o join performances pf on pf.id = o.performance_id where o.seller_id = sid
    )
    select s.codigo, p.id, p.nombre, seller_active_in(sid, p.id),
           (seller_active_in(sid, p.id) and not p.concluded and exists (select 1 from performances f where f.production_id = p.id and f.on_sale)),
           coalesce(count(o.id) filter (where o.status = 'aprobado'), 0)::int,
           coalesce(sum((select count(*) from tickets t where t.order_id = o.id and t.is_active)) filter (where o.status = 'aprobado'), 0)::int,
           coalesce(sum(o.total) filter (where o.status = 'aprobado'), 0),
           coalesce(count(o.id) filter (where o.status = 'pendiente'), 0)::int
      from obras join productions p on p.id = obras.id
      cross join sellers s
      left join performances pf on pf.production_id = p.id
      left join orders o on o.performance_id = pf.id and o.seller_id = sid
     where s.id = sid
     group by s.codigo, p.id, p.nombre, p.concluded, p.created_at
     order by p.created_at desc;
  -- Sin obras: igual devuelve el código.
  if not found then
    return query select s.codigo, null::text, null::text, false, false, 0, 0, 0::numeric, 0 from sellers s where s.id = sid;
  end if;
end $$;

-- ──────── RLS ────────
create policy sellers_own_read on sellers for select to authenticated using (user_id = auth.uid());
alter table seller_productions enable row level security;
create policy seller_productions_team on seller_productions for select to authenticated
  using (has_perm(production_id, 'ventas.ver') or has_perm(production_id, 'vendedores.gestionar'));
revoke all on seller_productions from anon;

revoke execute on function gen_seller_code(text) from public, anon, authenticated;
revoke execute on function ensure_account_seller(uuid) from public, anon, authenticated;
revoke execute on function profiles_seller_code() from public, anon, authenticated;
revoke execute on function orders_check_seller() from public, anon, authenticated;
revoke execute on function seller_in_cast(uuid, text) from public, anon;
revoke execute on function seller_active_in(uuid, text) from public, anon;
revoke execute on function preview_seller_code(uuid, text) from public, anon;
revoke execute on function seller_list(text) from public, anon;
revoke execute on function seller_set_active(text, uuid, boolean) from public, anon;
revoke execute on function seller_reset(text, uuid) from public, anon;
revoke execute on function seller_add_account(text, text) from public, anon;
revoke execute on function seller_add_external(text, text) from public, anon;
revoke execute on function my_seller() from public, anon;
grant execute on function seller_in_cast(uuid, text), seller_active_in(uuid, text), preview_seller_code(uuid, text),
  seller_list(text), seller_set_active(text, uuid, boolean), seller_reset(text, uuid), seller_add_account(text, text),
  seller_add_external(text, text), my_seller() to authenticated;

create trigger audit_seller_productions after insert or update or delete on seller_productions for each row execute function audit_row();

commit;
