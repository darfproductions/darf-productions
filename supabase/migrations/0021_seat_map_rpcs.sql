-- 0021: seat map for staff Boletaje
-- 1) seats.lado: which block of the row a seat belongs to (left/center/right)
-- 2) admin_create_seated_order: admin-only sale that works regardless of on_sale
-- 3) admin_cancel_ticket: admin-only, frees a sold seat (history is kept)
-- 4) check_in_ticket: staff/admin QR validation (atomic)

-- ============================================================
-- 1. seats.lado
-- ============================================================
alter table seats
  add column if not exists lado text
  check (lado in ('izquierda','central','derecha'));

-- Cuts per row: (fin_izq, fin_centro). Seats > fin_centro are 'derecha'.
-- Source: supabase/seeds/gen_showman_seats.py
with cuts(seat_row, fin_izq, fin_centro) as (values
  ('X',12,12),('W',12,24),('V',11,22),('U',11,23),('T',11,22),('S',12,24),
  ('R',12,23),('Q',11,23),('P',11,22),('O',11,23),('N',12,23),('M',12,24),
  ('L',11,22),('K',11,23),('J',0,11),
  ('I',11,23),('H',10,21),('G',9,21),('F',10,21),('E',9,21),('D',9,20),
  ('C',8,19),('B',8,19),('A',8,19)
)
update seats s
set lado = case
  when s.seat_number <= c.fin_izq then 'izquierda'
  when s.seat_number <= c.fin_centro then 'central'
  else 'derecha' end
from cuts c
where s.production_id = 'showman'
  and s.seat_row = c.seat_row
  and s.section <> 'Zona Marrón';

-- Discapacitados (J1-J3 left, J4-J6 right), their own price category
update seats s
set lado = case when s.seat_number <= 3 then 'izquierda' else 'derecha' end
where s.production_id = 'showman' and s.section = 'Zona Marrón';

do $$
declare n integer;
begin
  select count(*) into n from seats where production_id = 'showman' and lado is null;
  if n <> 0 then raise exception '0021: % asientos de Showman sin lado', n; end if;
end $$;

-- ============================================================
-- 2. admin_create_seated_order
-- ============================================================
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
  if not is_admin() then
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

-- ============================================================
-- 3. admin_cancel_ticket
-- ============================================================
create or replace function admin_cancel_ticket(target_ticket_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seat_id uuid;
begin
  if not is_admin() then raise exception 'No autorizado'; end if;

  update tickets set is_active = false
  where id = target_ticket_id and is_active
  returning seat_id into v_seat_id;

  if not found then
    raise exception 'El boleto no existe o ya está cancelado';
  end if;

  return json_build_object('ticket_id', target_ticket_id, 'seat_id', v_seat_id, 'cancelled', true);
end;
$$;

-- ============================================================
-- 4. check_in_ticket
-- ============================================================
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
  if not is_staff() then raise exception 'No autorizado'; end if;

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

-- ============================================================
-- 5. PRIVILEGES (lesson of 0016: revoke from anon explicitly)
-- ============================================================
revoke execute on function admin_create_seated_order(uuid, text, text, uuid[], text) from public, anon;
revoke execute on function admin_cancel_ticket(uuid) from public, anon;
revoke execute on function check_in_ticket(text) from public, anon;
grant execute on function admin_create_seated_order(uuid, text, text, uuid[], text) to authenticated;
grant execute on function admin_cancel_ticket(uuid) to authenticated;
grant execute on function check_in_ticket(text) to authenticated;
