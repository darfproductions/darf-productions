-- 0034: boletería por obra (Fase 3, etapa 3C de DARF 2.0) — aprobado por Johann 2026-10-11.
-- Las REGLAS de venta no cambian (precios, asientos, doble venta, aprobación, QR).
-- Cambia solo QUIÉN puede usarlas: de roles globales a permisos en la obra (has_perm).
--   ventas.ver           → ver órdenes y boletos de la obra
--   ventas.operar        → aprobar/rechazar, vender en taquilla, cancelar boletos
--   funciones.gestionar  → (nuevo) funciones, zonas, precios y asientos bloqueados
--   descuentos.gestionar → códigos de descuento
--   puerta.validar       → validar QR de las funciones de la obra
-- El Director (admin) sigue pudiendo todo. Staff global queda IGUAL QUE HOY: ver
-- obra, ver ventas y validar QR (corrige la compatibilidad de 0031 que además le
-- daba ventas.operar).
-- Las funciones se recrean copiando su cuerpo exacto; solo cambia la línea del
-- permiso (generado con un script y revisado). Sin "drop".

begin;

-- ──────── Permiso nuevo: funciones.gestionar ────────
insert into permissions (id, grupo, descripcion, orden) values
  ('funciones.gestionar', 'Boletería', 'Crear funciones, zonas, precios y bloquear asientos', 29);
alter table role_permissions disable trigger role_permissions_protect;
insert into role_permissions (role_id, permission_id) values ('productor', 'funciones.gestionar'), ('taquilla', 'funciones.gestionar');
alter table role_permissions enable trigger role_permissions_protect;

-- ──────── Staff global: igual que hoy (sin ventas.operar) ────────
create or replace function has_perm(pid text, perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    exists (select 1 from profiles where id = auth.uid() and rol = 'admin')
    or exists (
      select 1 from production_members m
      join role_permissions rp on rp.role_id = m.role_id
      where m.user_id = auth.uid() and m.production_id = pid and rp.permission_id = perm
    )
    or (perm in ('obra.ver', 'ventas.ver', 'puerta.validar')
        and exists (select 1 from profiles where id = auth.uid() and rol = 'staff'))
  )
$$;

create or replace function my_panel_access()
returns table (production_id text, permission_id text)
language sql stable security definer set search_path = public as $$
  select m.production_id, rp.permission_id
    from production_members m join role_permissions rp on rp.role_id = m.role_id
   where m.user_id = auth.uid()
  union
  select p.id, x.perm
    from productions p
    cross join unnest(array['obra.ver', 'ventas.ver', 'puerta.validar']) as x(perm)
   where exists (select 1 from profiles where id = auth.uid() and rol = 'staff')
  union
  select p.id, pe.id
    from productions p cross join permissions pe
   where exists (select 1 from profiles where id = auth.uid() and rol = 'admin')
$$;

-- ──────── Funciones de boletería: misma lógica, permiso por obra ────────
create or replace function approve_order(
  target_order_id uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order orders%rowtype;
begin

  if not has_perm((select pf.production_id from orders o join performances pf on pf.id = o.performance_id where o.id = target_order_id), 'ventas.operar') then
    raise exception 'No autorizado';
  end if;

  select *
  into v_order
  from orders
  where id = target_order_id
  for update;

  if not found then
    raise exception 'La orden no existe';
  end if;

  if v_order.status <> 'pendiente' then
    raise exception 'Solo se pueden aprobar órdenes pendientes';
  end if;

  update orders
  set
    status = 'aprobado',
    approved_by = auth.uid(),
    approved_at = now()
  where id = target_order_id;

  return json_build_object(
    'order_id', target_order_id,
    'status', 'aprobado'
  );

end;
$$;

create or replace function reject_order(
  target_order_id uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order orders%rowtype;
begin

  if not has_perm((select pf.production_id from orders o join performances pf on pf.id = o.performance_id where o.id = target_order_id), 'ventas.operar') then
    raise exception 'No autorizado';
  end if;

  select *
  into v_order
  from orders
  where id = target_order_id
  for update;

  if not found then
    raise exception 'La orden no existe';
  end if;

  if v_order.status <> 'pendiente' then
    raise exception 'Solo se pueden cancelar órdenes pendientes';
  end if;

  update orders
  set
    status = 'rechazado',
    rejected_by = auth.uid(),
    rejected_at = now()
  where id = target_order_id;

  update tickets
  set is_active = false
  where order_id = target_order_id
    and is_active = true;

  return json_build_object(
    'order_id', target_order_id,
    'status', 'rechazado'
  );

end;
$$;

create or replace function admin_create_seated_order(
  target_performance_id uuid,
  target_buyer_nombre text,
  target_buyer_telefono text,
  target_seat_ids uuid[],
  target_seller_codigo text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_production_id text;
  v_seat_id uuid;
  v_price_category_id uuid;
  v_order_id uuid;
  v_order_code text;
  v_total numeric(10,2);
  v_seller_id uuid;
  v_tickets json;
begin
  if not has_perm((select production_id from performances where id = target_performance_id), 'ventas.operar') then
    raise exception 'No autorizado';
  end if;

  if target_performance_id is null then raise exception 'La función es obligatoria'; end if;
  if target_buyer_nombre is null or btrim(target_buyer_nombre) = '' then
    raise exception 'El nombre del comprador es obligatorio'; end if;
  if target_buyer_telefono is null or btrim(target_buyer_telefono) = '' then
    raise exception 'El teléfono del comprador es obligatorio'; end if;
  if target_seat_ids is null or cardinality(target_seat_ids) < 1 then
    raise exception 'Debes seleccionar al menos un asiento'; end if;
  if cardinality(target_seat_ids) > 20 then
    raise exception 'No puedes seleccionar más de 20 asientos'; end if;
  if (select count(*) from unnest(target_seat_ids) s)
     <> (select count(distinct s) from unnest(target_seat_ids) s) then
    raise exception 'No puedes seleccionar el mismo asiento más de una vez'; end if;

  -- Performance must exist. on_sale is NOT required (admin sells at the box office).
  select pf.production_id into v_production_id
  from performances pf where pf.id = target_performance_id;
  if not found then raise exception 'La función no existe'; end if;

  -- Optional seller
  if target_seller_codigo is not null and btrim(target_seller_codigo) <> '' then
    select id into v_seller_id from sellers
    where codigo = upper(btrim(target_seller_codigo));
    if not found then raise exception 'El código de vendedor no existe'; end if;
  end if;

  -- Lock + validate every seat
  for v_seat_id in select unnest(target_seat_ids) loop
    perform 1 from seats where id = v_seat_id for update;
    if not found then raise exception 'Uno de los asientos seleccionados no existe'; end if;

    if not exists (select 1 from seats s where s.id = v_seat_id and s.production_id = v_production_id) then
      raise exception 'Uno de los asientos no pertenece a esta producción'; end if;
    if not exists (select 1 from seats s where s.id = v_seat_id and s.is_active) then
      raise exception 'Uno de los asientos seleccionados no está disponible'; end if;
    if exists (select 1 from blocked_seats bs where bs.performance_id = target_performance_id and bs.seat_id = v_seat_id) then
      raise exception 'Uno de los asientos seleccionados está bloqueado'; end if;
    if exists (select 1 from tickets t where t.performance_id = target_performance_id and t.seat_id = v_seat_id and t.is_active) then
      raise exception 'Uno de los asientos seleccionados ya no está disponible'; end if;

    select s.price_category_id into v_price_category_id from seats s where s.id = v_seat_id;
    if v_price_category_id is null then
      raise exception 'Uno de los asientos no tiene categoría de precio configurada'; end if;
    if not exists (
      select 1 from performance_price_categories ppc
      join price_categories pc on pc.id = ppc.price_category_id
      where ppc.performance_id = target_performance_id
        and ppc.price_category_id = v_price_category_id and pc.is_active
    ) then
      raise exception 'No existe un precio configurado para uno de los asientos seleccionados'; end if;
  end loop;

  select coalesce(sum(ppc.price), 0) into v_total
  from unnest(target_seat_ids) sid
  join seats s on s.id = sid
  join performance_price_categories ppc
    on ppc.performance_id = target_performance_id
   and ppc.price_category_id = s.price_category_id;

  insert into orders (performance_id, status, buyer_nombre, buyer_telefono,
                      buyer_user_id, total, seller_id, created_by_staff_id,
                      approved_by, approved_at)
  values (target_performance_id, 'aprobado', btrim(target_buyer_nombre),
          btrim(target_buyer_telefono), null, v_total, v_seller_id,
          auth.uid(), auth.uid(), now())
  returning id, order_code into v_order_id, v_order_code;

  insert into tickets (order_id, performance_id, seat_id, unit_price, is_active)
  select v_order_id, target_performance_id, s.id, ppc.price, true
  from unnest(target_seat_ids) sid
  join seats s on s.id = sid
  join performance_price_categories ppc
    on ppc.performance_id = target_performance_id
   and ppc.price_category_id = s.price_category_id;

  select json_agg(json_build_object(
           'ticket_id', t.id, 'seat_id', t.seat_id,
           'seat_label', s.seat_label, 'qr_token', t.qr_token)
         order by s.seat_label)
  into v_tickets
  from tickets t join seats s on s.id = t.seat_id
  where t.order_id = v_order_id;

  return json_build_object('order_id', v_order_id, 'order_code', v_order_code,
                           'total', v_total, 'tickets', v_tickets);
end;
$$;

create or replace function admin_cancel_ticket(target_ticket_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seat_id uuid;
begin
  if not has_perm((select pf.production_id from tickets t join performances pf on pf.id = t.performance_id where t.id = target_ticket_id), 'ventas.operar') then raise exception 'No autorizado'; end if;

  update tickets set is_active = false
  where id = target_ticket_id and is_active
  returning seat_id into v_seat_id;

  if not found then
    raise exception 'El boleto no existe o ya está cancelado';
  end if;

  return json_build_object('ticket_id', target_ticket_id, 'seat_id', v_seat_id, 'cancelled', true);
end;
$$;

create or replace function check_in_ticket(target_qr_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid;
  v_ticket record;
  v_updated integer;
begin
  -- Si el QR existe, hace falta puerta.validar en SU obra; si no existe, basta con
  -- ser puerta en alguna obra para recibir el mensaje normal de "QR inválido".
  if not (
    is_staff()
    or exists (
      select 1 from tickets t join performances pf on pf.id = t.performance_id
       where t.qr_token::text = lower(btrim(coalesce(target_qr_token, ''))) and has_perm(pf.production_id, 'puerta.validar'))
    or (not exists (select 1 from tickets t where t.qr_token::text = lower(btrim(coalesce(target_qr_token, ''))))
        and exists (select 1 from production_members m join role_permissions rp on rp.role_id = m.role_id
                     where m.user_id = auth.uid() and rp.permission_id = 'puerta.validar'))
  ) then raise exception 'No autorizado'; end if;

  begin
    v_token := btrim(target_qr_token)::uuid;
  exception when others then
    return json_build_object('result', 'no_encontrado');
  end;

  select t.id, t.is_active, t.checked_in_at, s.seat_label, pc.nombre as category,
         pf.starts_at, o.buyer_nombre
  into v_ticket
  from tickets t
  join orders o on o.id = t.order_id
  join performances pf on pf.id = t.performance_id
  left join seats s on s.id = t.seat_id
  left join price_categories pc on pc.id = s.price_category_id
  where t.qr_token = v_token;

  if not found then return json_build_object('result', 'no_encontrado'); end if;

  if not v_ticket.is_active then
    return json_build_object('result', 'cancelado', 'seat_label', v_ticket.seat_label,
                             'buyer_nombre', v_ticket.buyer_nombre);
  end if;

  update tickets set checked_in_at = now(), checked_in_by = auth.uid()
  where id = v_ticket.id and is_active and checked_in_at is null;
  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    return json_build_object('result', 'ya_usado', 'seat_label', v_ticket.seat_label,
                             'buyer_nombre', v_ticket.buyer_nombre,
                             'checked_in_at', v_ticket.checked_in_at);
  end if;

  return json_build_object('result', 'ok', 'seat_label', v_ticket.seat_label,
                           'category', v_ticket.category,
                           'performance_starts_at', v_ticket.starts_at,
                           'buyer_nombre', v_ticket.buyer_nombre);
end;
$$;

create or replace function admin_delete_performance(target_performance_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_orders integer;
begin
  if not has_perm((select production_id from performances where id = target_performance_id), 'funciones.gestionar') then
    raise exception 'No autorizado';
  end if;

  if not exists (select 1 from performances where id = target_performance_id) then
    raise exception 'La función no existe';
  end if;

  if exists (select 1 from tickets
             where performance_id = target_performance_id and is_active) then
    raise exception 'La función tiene boletos activos; cancélalos todos antes de eliminarla';
  end if;

  -- Orders of this function (tickets go with them: tickets.order_id cascades).
  delete from orders where performance_id = target_performance_id;
  get diagnostics v_deleted_orders = row_count;

  delete from performances where id = target_performance_id;

  return json_build_object('deleted', true, 'orders_removed', v_deleted_orders);
end;
$$;

create or replace function admin_save_discount_code(
  target_id uuid,
  target_production_id text,
  target_codigo text,
  target_percent numeric,
  target_valid_from timestamptz,
  target_valid_until timestamptz,
  target_max_uses_total int,
  target_max_tickets_per_order int,
  target_is_active boolean,
  target_category_ids uuid[],
  target_performance_ids uuid[]
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_codigo text := upper(btrim(coalesce(target_codigo, '')));
begin
  if not (has_perm(target_production_id, 'descuentos.gestionar') and (target_id is null or not exists (select 1 from discount_codes where id = target_id) or has_perm((select production_id from discount_codes where id = target_id), 'descuentos.gestionar'))) then raise exception 'No tienes permiso para gestionar descuentos de esta obra'; end if;
  if not exists (select 1 from productions where id = target_production_id) then
    raise exception 'La producción no existe'; end if;
  if v_codigo !~ '^[A-Z0-9_-]{3,30}$' then
    raise exception 'El código debe tener 3–30 caracteres: letras, números, guion o guion bajo'; end if;
  if target_percent is null or target_percent <= 0 or target_percent > 100 then
    raise exception 'El porcentaje debe ser mayor que 0 y máximo 100'; end if;
  if target_valid_from is not null and target_valid_until is not null and target_valid_from >= target_valid_until then
    raise exception 'La fecha de inicio debe ser anterior a la fecha de fin'; end if;

  target_category_ids := coalesce(target_category_ids, '{}');
  target_performance_ids := coalesce(target_performance_ids, '{}');
  if exists (select 1 from unnest(target_category_ids) c
             where not exists (select 1 from price_categories pc where pc.id = c and pc.production_id = target_production_id)) then
    raise exception 'Alguna zona no pertenece a la producción'; end if;
  if exists (select 1 from unnest(target_performance_ids) p
             where not exists (select 1 from performances pf where pf.id = p and pf.production_id = target_production_id)) then
    raise exception 'Alguna función no pertenece a la producción'; end if;

  if target_id is null then
    insert into discount_codes (production_id, codigo, percent, valid_from, valid_until,
                                max_uses_total, max_tickets_per_order, is_active)
    values (target_production_id, v_codigo, target_percent, target_valid_from, target_valid_until,
            target_max_uses_total, target_max_tickets_per_order, coalesce(target_is_active, true))
    returning id into v_id;
  else
    update discount_codes
       set codigo = v_codigo, percent = target_percent, valid_from = target_valid_from,
           valid_until = target_valid_until, max_uses_total = target_max_uses_total,
           max_tickets_per_order = target_max_tickets_per_order,
           is_active = coalesce(target_is_active, true), updated_at = now()
     where id = target_id and production_id = target_production_id
    returning id into v_id;
    if v_id is null then raise exception 'El código no existe'; end if;
  end if;

  delete from discount_code_categories where discount_code_id = v_id;
  insert into discount_code_categories (discount_code_id, price_category_id)
    select distinct v_id, c from unnest(target_category_ids) c;
  delete from discount_code_performances where discount_code_id = v_id;
  insert into discount_code_performances (discount_code_id, performance_id)
    select distinct v_id, p from unnest(target_performance_ids) p;

  return v_id;
exception when unique_violation then
  raise exception 'Ya existe un código "%" en esta producción', v_codigo;
end;
$$;

create or replace function admin_delete_discount_code(target_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not has_perm((select production_id from discount_codes where id = target_id), 'descuentos.gestionar') then raise exception 'No tienes permiso para gestionar descuentos de esta obra'; end if;
  if exists (select 1 from orders where discount_code_id = target_id) then
    update discount_codes set is_active = false, updated_at = now() where id = target_id;
    return json_build_object('deleted', false, 'deactivated', true);
  end if;
  delete from discount_codes where id = target_id;
  return json_build_object('deleted', true, 'deactivated', false);
end;
$$;

create or replace function admin_list_discount_codes(target_production_id text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not has_perm(target_production_id, 'descuentos.gestionar') then raise exception 'No tienes permiso para gestionar descuentos de esta obra'; end if;
  return coalesce((
    select json_agg(json_build_object(
      'id', d.id, 'codigo', d.codigo, 'percent', d.percent,
      'valid_from', d.valid_from, 'valid_until', d.valid_until,
      'max_uses_total', d.max_uses_total, 'max_tickets_per_order', d.max_tickets_per_order,
      'is_active', d.is_active,
      'uses', (select count(*) from orders o where o.discount_code_id = d.id and o.status in ('pendiente','aprobado')),
      'category_ids', coalesce((select json_agg(c.price_category_id) from discount_code_categories c where c.discount_code_id = d.id), '[]'::json),
      'performance_ids', coalesce((select json_agg(p.performance_id) from discount_code_performances p where p.discount_code_id = d.id), '[]'::json)
    ) order by d.created_at)
    from discount_codes d where d.production_id = target_production_id
  ), '[]'::json);
end;
$$;


-- ──────── Lectura y escritura de tablas por obra ────────
create or replace function performance_production(perf uuid) returns text
language sql stable security definer set search_path = public as $$
  select production_id from performances where id = perf
$$;
revoke execute on function performance_production(uuid) from public, anon;
grant execute on function performance_production(uuid) to authenticated;

create policy orders_team_read on orders for select to authenticated
  using (has_perm(performance_production(performance_id), 'ventas.ver'));
create policy tickets_team_read on tickets for select to authenticated
  using (has_perm(performance_production(performance_id), 'ventas.ver'));
create policy blocked_seats_team_read on blocked_seats for select to authenticated
  using (has_perm(performance_production(performance_id), 'ventas.ver') or has_perm(performance_production(performance_id), 'funciones.gestionar'));
create policy blocked_seats_team_write on blocked_seats for all to authenticated
  using (has_perm(performance_production(performance_id), 'funciones.gestionar'))
  with check (has_perm(performance_production(performance_id), 'funciones.gestionar'));

-- Funciones: crear y editar (borrar sigue siendo por admin_delete_performance, que revisa boletos).
create policy performances_team_insert on performances for insert to authenticated
  with check (has_perm(production_id, 'funciones.gestionar'));
create policy performances_team_update on performances for update to authenticated
  using (has_perm(production_id, 'funciones.gestionar')) with check (has_perm(production_id, 'funciones.gestionar'));

create policy price_categories_team_write on price_categories for all to authenticated
  using (has_perm(production_id, 'funciones.gestionar')) with check (has_perm(production_id, 'funciones.gestionar'));
create policy performance_prices_team_read on performance_price_categories for select to authenticated
  using (has_perm(performance_production(performance_id), 'ventas.ver') or has_perm(performance_production(performance_id), 'funciones.gestionar'));
create policy performance_prices_team_write on performance_price_categories for all to authenticated
  using (has_perm(performance_production(performance_id), 'funciones.gestionar'))
  with check (has_perm(performance_production(performance_id), 'funciones.gestionar'));

-- ──────── Verificación ────────
do $$
begin
  if (select count(*) from role_permissions where role_id = 'productor') <> (select count(*) from permissions) then
    raise exception 'Producción debe tener todos los permisos';
  end if;
end $$;

commit;
