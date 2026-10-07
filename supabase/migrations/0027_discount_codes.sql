-- 0027: códigos de descuento
-- Un código define: % de descuento, zonas donde aplica (ninguna = todas), funciones donde
-- aplica (ninguna = todas), vigencia, usos totales y máximo de boletos por orden.
-- "Uso" = una orden pendiente o aprobada con ese código (rechazada/expirada libera el uso).
-- El descuento se calcula SIEMPRE en el servidor (create_seated_ticket_order v3); el cliente
-- solo manda el texto del código. tickets.unit_price guarda el precio ya descontado.
-- Los códigos solo los ve un admin; el comprador valida el suyo con preview_discount_code.

begin;

-- ============================================================
-- 1. Tablas
-- ============================================================
create table discount_codes (
  id uuid primary key default gen_random_uuid(),
  production_id text not null references productions(id),
  codigo text not null check (codigo = upper(btrim(codigo)) and length(codigo) between 3 and 30),
  percent numeric(5,2) not null check (percent > 0 and percent <= 100),
  valid_from timestamptz,
  valid_until timestamptz,
  max_uses_total int check (max_uses_total is null or max_uses_total > 0),
  max_tickets_per_order int check (max_tickets_per_order is null or max_tickets_per_order > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (production_id, codigo),
  check (valid_from is null or valid_until is null or valid_from < valid_until)
);

create table discount_code_categories (
  discount_code_id uuid not null references discount_codes(id) on delete cascade,
  price_category_id uuid not null references price_categories(id) on delete cascade,
  primary key (discount_code_id, price_category_id)
);

create table discount_code_performances (
  discount_code_id uuid not null references discount_codes(id) on delete cascade,
  performance_id uuid not null references performances(id) on delete cascade,
  primary key (discount_code_id, performance_id)
);

alter table orders
  add column discount_code_id uuid references discount_codes(id),
  add column discount_codigo text,                       -- copia del texto, para que el comprador lo vea sin leer discount_codes
  add column discount_amount numeric(10,2) not null default 0;

create index idx_orders_discount_code on orders(discount_code_id) where discount_code_id is not null;

-- ============================================================
-- 2. RLS: solo admins leen/escriben las tablas de códigos
-- ============================================================
alter table discount_codes enable row level security;
alter table discount_code_categories enable row level security;
alter table discount_code_performances enable row level security;

create policy discount_codes_admin_all on discount_codes for all using (is_admin()) with check (is_admin());
create policy discount_code_categories_admin_all on discount_code_categories for all using (is_admin()) with check (is_admin());
create policy discount_code_performances_admin_all on discount_code_performances for all using (is_admin()) with check (is_admin());

-- ============================================================
-- 3. RPCs de administración
-- ============================================================
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
  if not is_admin() then raise exception 'Solo un admin puede gestionar códigos de descuento'; end if;
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
  if not is_admin() then raise exception 'Solo un admin puede gestionar códigos de descuento'; end if;
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
  if not is_admin() then raise exception 'Solo un admin puede gestionar códigos de descuento'; end if;
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

-- ============================================================
-- 4. Validación compartida (compra y vista previa)
--    Devuelve la fila del código (bloqueada FOR UPDATE si lock) o lanza el motivo.
-- ============================================================
create or replace function _resolve_discount_code(
  p_performance_id uuid, p_production_id text, p_code text, p_lock boolean
) returns discount_codes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dc discount_codes;
  v_codigo text := upper(btrim(coalesce(p_code, '')));
begin
  if p_lock then
    select * into v_dc from discount_codes where production_id = p_production_id and codigo = v_codigo for update;
  else
    select * into v_dc from discount_codes where production_id = p_production_id and codigo = v_codigo;
  end if;
  if not found then raise exception 'El código de descuento no existe'; end if;
  if not v_dc.is_active then raise exception 'El código de descuento no está activo'; end if;
  if v_dc.valid_from is not null and now() < v_dc.valid_from then
    raise exception 'El código de descuento aún no es válido'; end if;
  if v_dc.valid_until is not null and now() > v_dc.valid_until then
    raise exception 'El código de descuento ya venció'; end if;
  if exists (select 1 from discount_code_performances where discount_code_id = v_dc.id)
     and not exists (select 1 from discount_code_performances
                     where discount_code_id = v_dc.id and performance_id = p_performance_id) then
    raise exception 'El código de descuento no aplica a esta función'; end if;
  if v_dc.max_uses_total is not null
     and (select count(*) from orders o where o.discount_code_id = v_dc.id and o.status in ('pendiente','aprobado'))
         >= v_dc.max_uses_total then
    raise exception 'El código de descuento ya se agotó'; end if;
  return v_dc;
end;
$$;
revoke execute on function _resolve_discount_code(uuid, text, text, boolean) from public, anon, authenticated;

create or replace function preview_discount_code(target_performance_id uuid, target_code text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_production_id text;
  v_dc discount_codes;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión para usar un código'; end if;
  select pf.production_id into v_production_id from performances pf where pf.id = target_performance_id;
  if not found then raise exception 'La función no existe'; end if;
  v_dc := _resolve_discount_code(target_performance_id, v_production_id, target_code, false);
  return json_build_object(
    'codigo', v_dc.codigo, 'percent', v_dc.percent,
    'max_tickets_per_order', v_dc.max_tickets_per_order,
    'category_ids', (select json_agg(c.price_category_id) from discount_code_categories c where c.discount_code_id = v_dc.id)
  );
end;
$$;

-- ============================================================
-- 5. create_seated_ticket_order v3 (agrega target_discount_code)
-- ============================================================
drop function if exists create_seated_ticket_order(uuid, text, text, uuid[], text);

create or replace function create_seated_ticket_order(
  target_performance_id uuid,
  target_buyer_nombre text,
  target_buyer_telefono text,
  target_seat_ids uuid[],
  target_seller_codigo text default null,
  target_discount_code text default null
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
  v_gross numeric(10,2);
  v_total numeric(10,2);
  v_discount numeric(10,2) := 0;
  v_seller_id uuid;
  v_labels json;
  v_dc discount_codes;
  v_dc_restricted boolean := false;
  v_percent numeric := 0;
  v_dc_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para comprar';
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

  select pf.production_id into v_production_id
  from performances pf
  join productions pr on pr.id = pf.production_id
  where pf.id = target_performance_id
    and pf.on_sale
    and pf.starts_at is not null
    and not pr.concluded;
  if not found then
    raise exception 'La función no está disponible para venta';
  end if;

  if (select count(*) from orders o
      where o.buyer_user_id = auth.uid() and o.status = 'pendiente') >= 3 then
    raise exception 'Ya tienes 3 solicitudes pendientes de pago; espera a que se aprueben o se cancelen';
  end if;

  if target_seller_codigo is not null and btrim(target_seller_codigo) <> '' then
    select id into v_seller_id from sellers
    where codigo = upper(btrim(target_seller_codigo)) and active;
    if not found then raise exception 'El código de vendedor no existe'; end if;
  end if;

  -- Código de descuento: la fila queda bloqueada hasta el final de la transacción para que
  -- dos compras simultáneas no excedan max_uses_total.
  if target_discount_code is not null and btrim(target_discount_code) <> '' then
    v_dc := _resolve_discount_code(target_performance_id, v_production_id, target_discount_code, true);
    if v_dc.max_tickets_per_order is not null and cardinality(target_seat_ids) > v_dc.max_tickets_per_order then
      raise exception 'Este código permite máximo % boletos por compra', v_dc.max_tickets_per_order;
    end if;
    v_dc_id := v_dc.id;
    v_percent := v_dc.percent;
    v_dc_restricted := exists (select 1 from discount_code_categories where discount_code_id = v_dc.id);
  end if;

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
      raise exception 'No existe un precio configurado para uno de los asientos seleccionados';
    end if;
  end loop;

  -- Precio por asiento: el de la BD menos el descuento si el asiento es elegible
  -- (sin código, o el código no restringe zonas, o la zona del asiento está permitida).
  select coalesce(sum(ppc.price), 0),
         coalesce(sum(case when v_dc_id is not null
                            and (not v_dc_restricted or exists (select 1 from discount_code_categories dcc
                                 where dcc.discount_code_id = v_dc_id and dcc.price_category_id = s.price_category_id))
                           then round(ppc.price * v_percent / 100, 2) else 0 end), 0)
    into v_gross, v_discount
  from unnest(target_seat_ids) sid
  join seats s on s.id = sid
  join performance_price_categories ppc
    on ppc.performance_id = target_performance_id
   and ppc.price_category_id = s.price_category_id;
  v_total := v_gross - v_discount;

  if v_dc_id is not null and v_discount = 0 then
    raise exception 'El código de descuento no aplica a los asientos seleccionados';
  end if;

  insert into orders (performance_id, status, buyer_nombre, buyer_telefono,
                      buyer_user_id, total, seller_id,
                      discount_code_id, discount_codigo, discount_amount)
  values (target_performance_id, 'pendiente', btrim(target_buyer_nombre),
          btrim(target_buyer_telefono), auth.uid(), v_total, v_seller_id,
          v_dc_id, case when v_dc_id is not null then v_dc.codigo end, v_discount)
  returning id, order_code into v_order_id, v_order_code;

  insert into tickets (order_id, performance_id, seat_id, unit_price, is_active)
  select v_order_id, target_performance_id, s.id,
         ppc.price - case when v_dc_id is not null
                           and (not v_dc_restricted or exists (select 1 from discount_code_categories dcc
                                where dcc.discount_code_id = v_dc_id and dcc.price_category_id = s.price_category_id))
                          then round(ppc.price * v_percent / 100, 2) else 0 end,
         true
  from unnest(target_seat_ids) sid
  join seats s on s.id = sid
  join performance_price_categories ppc
    on ppc.performance_id = target_performance_id
   and ppc.price_category_id = s.price_category_id;

  select json_agg(s.seat_label order by s.seat_label) into v_labels
  from seats s where s.id = any(target_seat_ids);

  return json_build_object('order_id', v_order_id, 'order_code', v_order_code,
                           'status', 'pendiente', 'quantity', cardinality(target_seat_ids),
                           'total', v_total, 'discount_amount', v_discount,
                           'discount_codigo', case when v_dc_id is not null then v_dc.codigo end,
                           'seats', v_labels);
end;
$$;

-- ============================================================
-- 6. Permisos
-- ============================================================
revoke execute on function create_seated_ticket_order(uuid, text, text, uuid[], text, text) from public, anon;
grant execute on function create_seated_ticket_order(uuid, text, text, uuid[], text, text) to authenticated;

revoke execute on function preview_discount_code(uuid, text) from public, anon;
grant execute on function preview_discount_code(uuid, text) to authenticated;

revoke execute on function admin_save_discount_code(uuid, text, text, numeric, timestamptz, timestamptz, int, int, boolean, uuid[], uuid[]) from public, anon;
grant execute on function admin_save_discount_code(uuid, text, text, numeric, timestamptz, timestamptz, int, int, boolean, uuid[], uuid[]) to authenticated;
revoke execute on function admin_delete_discount_code(uuid) from public, anon;
grant execute on function admin_delete_discount_code(uuid) to authenticated;
revoke execute on function admin_list_discount_codes(text) from public, anon;
grant execute on function admin_list_discount_codes(text) to authenticated;

-- ============================================================
-- 7. Comprobaciones
-- ============================================================
do $$
begin
  if (select count(*) from pg_proc where proname = 'create_seated_ticket_order') <> 1 then
    raise exception 'Debe existir una sola create_seated_ticket_order';
  end if;
  if (select count(*) from pg_policies where tablename like 'discount_code%') <> 3 then
    raise exception 'Faltan políticas de discount_code*';
  end if;
end $$;

commit;
