-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV" (la base de darfproductions.com).
-- 0117: zonas — orden, precio de la zona para todas las funciones y borrar zonas.
-- Se puede correr más de una vez. Si la base no es DEV, aborta.
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
  if to_regclass('public.mapas_diseno') is null then
    raise exception 'ABORTADO: primero corre los scripts anteriores (0113–0116).';
  end if;
end $$;
begin;

alter table price_categories add column if not exists orden int not null default 0;
alter table price_categories add column if not exists precio_base numeric(10, 2) check (precio_base is null or precio_base >= 0);

-- Orden inicial (una sola vez): la más cara primero, luego por nombre.
do $$ begin
  if not exists (select 1 from price_categories where orden <> 0) then
    update price_categories pc set orden = q.n
      from (select pc2.id, row_number() over (partition by pc2.production_id
                     order by (select max(price) from performance_price_categories x where x.price_category_id = pc2.id) desc nulls last, pc2.nombre) as n
              from price_categories pc2) q
     where pc.id = q.id;
  end if;
end $$;

-- Las zonas nuevas van al final.
create or replace function price_categories_orden_nuevo() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.orden = 0 then
    select coalesce(max(orden), 0) + 1 into new.orden from price_categories where production_id = new.production_id;
  end if;
  return new;
end $$;
drop trigger if exists price_categories_orden_nuevo on price_categories;
create trigger price_categories_orden_nuevo before insert on price_categories for each row execute function price_categories_orden_nuevo();

-- Subir o bajar una zona.
create or replace function zona_mover(zid uuid, arriba boolean) returns void
language plpgsql security definer set search_path = public as $$
declare z price_categories; vecina price_categories;
begin
  select * into z from price_categories where id = zid;
  if not found then raise exception 'No se encontró la zona.'; end if;
  if not has_perm(z.production_id, 'funciones.gestionar') then raise exception 'No autorizado'; end if;
  -- Por si quedaron empates, se renumera la obra antes de mover.
  update price_categories pc set orden = q.n
    from (select id, row_number() over (order by orden, nombre) as n from price_categories where production_id = z.production_id) q
   where pc.id = q.id and pc.orden is distinct from q.n;
  select * into z from price_categories where id = zid;
  if arriba then
    select * into vecina from price_categories where production_id = z.production_id and orden < z.orden order by orden desc limit 1;
  else
    select * into vecina from price_categories where production_id = z.production_id and orden > z.orden order by orden limit 1;
  end if;
  if vecina.id is null then return; end if;
  update price_categories set orden = vecina.orden, updated_at = now() where id = z.id;
  update price_categories set orden = z.orden, updated_at = now() where id = vecina.id;
end $$;
revoke all on function zona_mover(uuid, boolean) from public, anon;
grant execute on function zona_mover(uuid, boolean) to authenticated;

-- Precio de la zona en todas las funciones que aún no pasan (y en las nuevas).
create or replace function zona_precio(zid uuid, p_precio numeric) returns int
language plpgsql security definer set search_path = public as $$
declare z price_categories; n int;
begin
  select * into z from price_categories where id = zid;
  if not found then raise exception 'No se encontró la zona.'; end if;
  if not has_perm(z.production_id, 'funciones.gestionar') then raise exception 'No autorizado'; end if;
  if p_precio is null or p_precio < 0 or p_precio > 1000000 then raise exception 'Precio no válido.'; end if;
  update price_categories set precio_base = p_precio, updated_at = now() where id = zid;
  insert into performance_price_categories (performance_id, price_category_id, price)
  select pf.id, zid, p_precio from performances pf
   where pf.production_id = z.production_id and pf.cancelada_at is null and pf.starts_at > now()
  on conflict (performance_id, price_category_id) do update set price = excluded.price, updated_at = now();
  get diagnostics n = row_count;
  insert into audit_log (tabla, accion, production_id, despues)
    values ('price_categories', 'precio_zona', z.production_id, jsonb_build_object('zona', z.nombre, 'precio', p_precio, 'funciones', n));
  return n;
end $$;
revoke all on function zona_precio(uuid, numeric) from public, anon;
grant execute on function zona_precio(uuid, numeric) to authenticated;

-- Borrar una zona: sus asientos pasan a "destino"; con boletos vendidos no se puede.
create or replace function zona_borrar(zid uuid, destino uuid) returns int
language plpgsql security definer set search_path = public as $$
declare z price_categories; d price_categories; n int := 0;
begin
  select * into z from price_categories where id = zid for update;
  if not found then raise exception 'No se encontró la zona.'; end if;
  if not has_perm(z.production_id, 'funciones.gestionar') then raise exception 'No autorizado'; end if;
  if exists (select 1 from tickets where price_category_id = zid) then
    raise exception 'Esta zona ya tiene boletos vendidos: no se puede borrar. Mejor desactívala o cámbiale el nombre.';
  end if;
  if exists (select 1 from seats where price_category_id = zid) then
    if destino is null then raise exception 'Esta zona tiene asientos: elige a qué zona pasan.'; end if;
    select * into d from price_categories where id = destino;
    if not found or d.production_id <> z.production_id or d.id = zid then raise exception 'Zona de destino no válida.'; end if;
    if d.cupo is not null then raise exception 'Los asientos solo pueden pasar a una zona con asientos.'; end if;
    update seats set price_category_id = destino where price_category_id = zid;
    get diagnostics n = row_count;
  end if;
  delete from price_categories where id = zid;
  insert into audit_log (tabla, accion, production_id, antes)
    values ('price_categories', 'borrar_zona', z.production_id, jsonb_build_object('zona', z.nombre, 'asientos_movidos', n));
  return n;
end $$;
revoke all on function zona_borrar(uuid, uuid) from public, anon;
grant execute on function zona_borrar(uuid, uuid) to authenticated;

-- Las funciones nuevas toman el precio de la zona (o el de la función más reciente, como antes).
create or replace function copy_prices_to_new_performance() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_src uuid;
begin
  select p.id into v_src from performances p
   where p.production_id = new.production_id and p.id <> new.id
     and exists (select 1 from performance_price_categories x where x.performance_id = p.id)
   order by p.created_at desc limit 1;
  insert into performance_price_categories (performance_id, price_category_id, price)
  select new.id, pc.id, coalesce(pc.precio_base, src.price)
    from price_categories pc
    left join performance_price_categories src on src.performance_id = v_src and src.price_category_id = pc.id
   where pc.production_id = new.production_id and coalesce(pc.precio_base, src.price) is not null
  on conflict (performance_id, price_category_id) do nothing;
  return new;
end $$;

-- Compra y taquilla de entrada general: en el orden de las zonas.
create or replace function general_availability(target_performance_id uuid)
returns table(price_category_id uuid, nombre text, descripcion text, precio numeric, cupo integer, ocupados integer, libres integer)
language sql stable security definer set search_path = public as $$
  select pc.id, pc.nombre, pc.descripcion, ppc.price, coalesce(ppc.cupo, pc.cupo),
         (select count(*)::int from tickets t where t.performance_id = target_performance_id and t.price_category_id = pc.id and t.seat_id is null and t.is_active),
         greatest(0, coalesce(ppc.cupo, pc.cupo) - (select count(*)::int from tickets t
           where t.performance_id = target_performance_id and t.price_category_id = pc.id and t.seat_id is null and t.is_active))
    from performance_price_categories ppc
    join price_categories pc on pc.id = ppc.price_category_id
   where ppc.performance_id = target_performance_id and pc.cupo is not null and pc.is_active
   order by pc.orden, ppc.price desc, pc.nombre
$$;

commit;

select 'Listo 0117. Zonas con orden, precio y borrar.' as resultado;
