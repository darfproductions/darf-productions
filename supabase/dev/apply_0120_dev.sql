-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV" (la base de darfproductions.com).
-- 0120: cómo se vende cada obra (funciones publicadas; venta solo por la página, híbrida o por WhatsApp; precios y total visibles).
-- Además deja Showman como pidió Diego: funciones OCULTAS (se publican desde el panel), venta híbrida
-- ("Aparta tu lugar" → WhatsApp) y sin precios ni total en la página ni al elegir lugares.
-- Taquilla: correo del comprador para que sus boletos aparezcan en su cuenta (o al crearla).
-- Se puede correr más de una vez. Si la base no es DEV, aborta.
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
  if to_regclass('public.obra_borradores') is null then
    raise exception 'ABORTADO: primero corre el script de 0118 y 0119.';
  end if;
end $$;
begin;

alter table productions add column if not exists funciones_publicadas boolean not null default true;
alter table productions add column if not exists modo_venta text not null default 'web';
alter table productions add column if not exists mostrar_precios boolean not null default true;
alter table productions add column if not exists mostrar_total boolean not null default true;
alter table productions drop constraint if exists productions_modo_venta_check;
alter table productions add constraint productions_modo_venta_check check (modo_venta in ('web', 'hibrido', 'whatsapp'));

-- ¿El público puede ver las funciones de esta obra? (obra visible y funciones publicadas)
create or replace function funciones_visibles(pid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from productions p where p.id = pid and p.funciones_publicadas and p.estado in ('publicada', 'archivada'))
$$;
grant execute on function funciones_visibles(text) to anon, authenticated;

-- Funciones: el público solo las de obras con funciones publicadas; el equipo, el elenco y quien tiene una orden, siempre.
create or replace function funcion_legible(pid text, pfid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select funciones_visibles(pid)
      or (auth.uid() is not null and (
            is_staff() or in_production_team(pid) or is_production_member(pid)
            or exists (select 1 from orders o where o.performance_id = pfid and o.buyer_user_id = auth.uid())))
$$;
grant execute on function funcion_legible(text, uuid) to anon, authenticated;
drop policy if exists performances_public_read on performances;
create policy performances_public_read on performances for select using (funcion_legible(production_id, id));

-- La compra en línea se revisa aquí (ya la llaman las dos compras; la taquilla no pasa por aquí).
create or replace function preventa_revisar(pfid uuid) returns void
language plpgsql stable security definer set search_path = public as $$
declare desde timestamptz; hasta timestamptz; publicadas boolean; modo text;
begin
  select pf.preventa_desde, pf.preventa_hasta, p.funciones_publicadas, p.modo_venta into desde, hasta, publicadas, modo
    from performances pf join productions p on p.id = pf.production_id where pf.id = pfid;
  if publicadas is not true then raise exception 'Esta función no está a la venta en línea.'; end if;
  if modo = 'whatsapp' then raise exception 'Los boletos de esta obra se piden por WhatsApp.'; end if;
  if desde is not null and desde > now() then
    raise exception 'La venta de esta función abre el %.', cuando_mx(desde);
  end if;
  if hasta is not null and hasta > now() and not is_fan_member() then
    raise exception 'Esta función está en preventa para el Club Fan hasta el %. Únete gratis en la Fan Zone para comprar ahora.', cuando_mx(hasta);
  end if;
end $$;

drop function if exists obra_venta_ajustes(text, boolean, text, boolean);
create or replace function obra_venta_ajustes(pid text, p_funciones_publicadas boolean, p_modo_venta text, p_mostrar_precios boolean, p_mostrar_total boolean) returns void
language plpgsql security definer set search_path = public as $$
declare antes productions;
begin
  if not (has_perm(pid, 'funciones.gestionar') or has_perm(pid, 'obra.publicar')) then raise exception 'No autorizado'; end if;
  if p_modo_venta not in ('web', 'hibrido', 'whatsapp') then raise exception 'Modo de venta no válido.'; end if;
  select * into antes from productions where id = pid for update;
  if not found then raise exception 'No se encontró la obra.'; end if;
  update productions set funciones_publicadas = coalesce(p_funciones_publicadas, funciones_publicadas),
         modo_venta = p_modo_venta, mostrar_precios = coalesce(p_mostrar_precios, mostrar_precios),
         mostrar_total = coalesce(p_mostrar_total, mostrar_total), updated_at = now()
   where id = pid;
  insert into audit_log (tabla, accion, production_id, antes, despues)
    values ('productions', 'venta_ajustes', pid,
            jsonb_build_object('funciones_publicadas', antes.funciones_publicadas, 'modo_venta', antes.modo_venta, 'mostrar_precios', antes.mostrar_precios, 'mostrar_total', antes.mostrar_total),
            jsonb_build_object('funciones_publicadas', p_funciones_publicadas, 'modo_venta', p_modo_venta, 'mostrar_precios', p_mostrar_precios, 'mostrar_total', p_mostrar_total));
end $$;
revoke all on function obra_venta_ajustes(text, boolean, text, boolean, boolean) from public, anon;
grant execute on function obra_venta_ajustes(text, boolean, text, boolean, boolean) to authenticated;

-- "Desde $…" del inicio y la cartelera: sin obras con funciones ocultas ni con precios apagados.
create or replace function productions_desde()
returns table(production_id text, desde numeric)
language sql stable security definer set search_path = public as $$
  select pf.production_id, min(ppc.price)
    from performances pf
    join performance_price_categories ppc on ppc.performance_id = pf.id
    join price_categories pc on pc.id = ppc.price_category_id and pc.is_active
    join productions p on p.id = pf.production_id and p.funciones_publicadas and p.mostrar_precios
   where pf.starts_at > now() and ppc.price > 0 and production_is_visible(pf.production_id)
   group by pf.production_id
$$;

-- ──────── Taquilla: boletos a la cuenta del comprador por su correo ────────
-- Al vender en taquilla se puede poner el correo de la cuenta del comprador: sus boletos aparecen en su Mi cuenta.
-- Si ese correo aún no tiene cuenta, la orden queda guardada con el correo y se le pasa sola cuando cree su
-- cuenta y confirme el correo (mismo momento en que se reclaman las invitaciones del equipo, 0094).
alter table orders add column if not exists correo_pendiente text;
create index if not exists orders_correo_pendiente_idx on orders (lower(correo_pendiente)) where correo_pendiente is not null;

create or replace function order_asignar_correo(target_order_id uuid, p_correo text) returns text
language plpgsql security definer set search_path = public as $$
declare o orders; v_pid text; v_correo text := lower(btrim(coalesce(p_correo, ''))); v_uid uuid;
begin
  select * into o from orders where id = target_order_id for update;
  if not found then raise exception 'No se encontró la orden.'; end if;
  select production_id into v_pid from performances where id = o.performance_id;
  if not has_perm(v_pid, 'ventas.operar') then raise exception 'No autorizado'; end if;
  if v_correo !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Revisa el correo.'; end if;
  if o.buyer_user_id is not null then raise exception 'Esta orden ya está en una cuenta.'; end if;
  select id into v_uid from auth.users where lower(email) = v_correo and email_confirmed_at is not null limit 1;
  if v_uid is not null then
    update orders set buyer_user_id = v_uid, correo_pendiente = null where id = o.id;
    begin
      perform notify(array[v_uid], 'boletos', left('Tienes boletos de ' || production_name(v_pid), 200),
                     'Ya están en tu cuenta, con su QR para entrar.', '/cuenta', v_pid);
    exception when others then null;
    end;
  else
    update orders set correo_pendiente = v_correo where id = o.id;
  end if;
  insert into audit_log (tabla, accion, production_id, despues)
    values ('orders', 'taquilla_correo', v_pid, jsonb_build_object('orden', o.order_code, 'cuenta', v_uid is not null));
  return case when v_uid is not null then 'cuenta' else 'pendiente' end;
end $$;
revoke all on function order_asignar_correo(uuid, text) from public, anon;
grant execute on function order_asignar_correo(uuid, text) to authenticated;

create or replace function vincular_ordenes_correo() returns trigger
language plpgsql security definer set search_path = public as $$
declare uids uuid[]; n int;
begin
  if new.email_confirmed_at is null then return new; end if;
  if tg_op = 'UPDATE' and old.email_confirmed_at is not null and old.email is not distinct from new.email then return new; end if;
  begin
    update orders set buyer_user_id = new.id, correo_pendiente = null
     where buyer_user_id is null and correo_pendiente = lower(new.email);
    get diagnostics n = row_count;
    if n > 0 then
      perform notify(array[new.id], 'boletos', 'Tienes boletos en tu cuenta', 'Los boletos que compraste en taquilla ya están aquí, con su QR para entrar.', '/cuenta', null);
    end if;
  exception when others then null; -- nunca impide crear o confirmar la cuenta
  end;
  return new;
end $$;
revoke all on function vincular_ordenes_correo() from public, anon, authenticated;
drop trigger if exists vincular_ordenes_correo on auth.users;
create trigger vincular_ordenes_correo after insert or update of email_confirmed_at, email on auth.users
  for each row execute function vincular_ordenes_correo();

-- Showman: funciones ocultas hasta que se publiquen; híbrido y sin precios ni total.
update productions set funciones_publicadas = false, modo_venta = 'hibrido', mostrar_precios = false, mostrar_total = false where id = 'showman';

commit;

select 'Listo 0120. Showman: ' || (select case when not funciones_publicadas and modo_venta = 'hibrido' and not mostrar_precios and not mostrar_total
  then 'funciones ocultas, híbrido y sin precios.' else 'REVISAR' end from productions where id = 'showman') as resultado;
