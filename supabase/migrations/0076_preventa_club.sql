-- 0076: preventa del Club Fan (Diego 2026-10-12).
--   performances.preventa_hasta: mientras la función esté en venta y no llegue esa fecha, solo
--   los socios del Club Fan (0075) pueden apartar. La regla vive en las funciones de compra
--   (create_seated_ticket_order y _create_general_order se redefinen con su mismo cuerpo más
--   la revisión); taquilla no se bloquea.
--   preventa_recordatorios: el socio pide que le avisemos por obra; cuando una función de esa obra
--   abre en preventa, recibe un aviso (web y teléfono, tipo 'fanzone') una sola vez.
-- Precede: 0075.

begin;

alter table performances add column preventa_hasta timestamptz;

create or replace function preventa_revisar(pfid uuid) returns void
language plpgsql stable security definer set search_path = public as $$
declare hasta timestamptz;
begin
  select preventa_hasta into hasta from performances where id = pfid;
  if hasta is not null and hasta > now() and not is_fan_member() then
    raise exception 'Esta función está en preventa para el Club Fan hasta el %. Únete gratis en la Fan Zone para comprar ahora.', cuando_mx(hasta);
  end if;
end $$;
revoke execute on function preventa_revisar(uuid) from public, anon;
grant execute on function preventa_revisar(uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.create_seated_ticket_order(target_performance_id uuid, target_buyer_nombre text, target_buyer_telefono text, target_seat_ids uuid[], target_seller_codigo text DEFAULT NULL::text, target_discount_code text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- 0076: en preventa, solo socios del Club Fan.
  perform preventa_revisar(target_performance_id);

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
$function$;

CREATE OR REPLACE FUNCTION public._create_general_order(p_performance_id uuid, p_nombre text, p_telefono text, p_zone uuid, p_cantidad integer, p_seller text, p_discount text, p_staff boolean, p_max integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pid text; v_price numeric(10,2); v_cupo int; v_ocupados int;
  v_seller uuid; v_dc discount_codes; v_dc_id uuid; v_percent numeric := 0;
  v_unit numeric(10,2); v_desc numeric(10,2) := 0; v_total numeric(10,2);
  v_order uuid; v_code text; v_zone_nombre text;
begin
  if p_nombre is null or btrim(p_nombre) = '' then raise exception 'El nombre del comprador es obligatorio'; end if;
  if p_telefono is null or btrim(p_telefono) = '' then raise exception 'El teléfono del comprador es obligatorio'; end if;
  if p_cantidad is null or p_cantidad < 1 then raise exception 'Elige cuántos boletos'; end if;
  if p_cantidad > p_max then raise exception 'Máximo % boletos de entrada general por compra', p_max; end if;

  select pf.production_id into v_pid from performances pf join productions pr on pr.id = pf.production_id
   where pf.id = p_performance_id and (p_staff or (pf.on_sale and pf.starts_at is not null and not pr.concluded));
  if not found then raise exception 'La función no está disponible para venta'; end if;
  -- 0076: en preventa, solo socios del Club Fan (taquilla no se bloquea).
  if not p_staff then perform preventa_revisar(p_performance_id); end if;

  -- Bloqueo de la zona: dos compras al mismo tiempo se forman en fila (sin sobreventa).
  select pc.nombre into v_zone_nombre from price_categories pc
   where pc.id = p_zone and pc.production_id = v_pid and pc.cupo is not null and pc.is_active for update;
  if not found then raise exception 'Esa zona de entrada general no existe en esta obra'; end if;
  select ppc.price, coalesce(ppc.cupo, (select cupo from price_categories where id = p_zone)) into v_price, v_cupo
    from performance_price_categories ppc where ppc.performance_id = p_performance_id and ppc.price_category_id = p_zone;
  if not found then raise exception 'Esa zona no tiene precio en esta función'; end if;
  select count(*) into v_ocupados from tickets t
   where t.performance_id = p_performance_id and t.price_category_id = p_zone and t.seat_id is null and t.is_active;
  if v_ocupados + p_cantidad > v_cupo then
    if v_cupo - v_ocupados <= 0 then raise exception 'La zona % ya está llena', v_zone_nombre; end if;
    if v_cupo - v_ocupados = 1 then raise exception 'Solo queda 1 lugar en %', v_zone_nombre; end if;
    raise exception 'Solo quedan % lugares en %', v_cupo - v_ocupados, v_zone_nombre;
  end if;

  if not p_staff and (select count(*) from orders o where o.buyer_user_id = auth.uid() and o.status = 'pendiente') >= 3 then
    raise exception 'Ya tienes 3 solicitudes pendientes de pago; espera a que se aprueben o se cancelen';
  end if;

  if p_seller is not null and btrim(p_seller) <> '' then
    select id into v_seller from sellers where codigo = upper(btrim(p_seller)) and active;
    if not found then raise exception 'El código de vendedor no existe'; end if;
  end if;

  if not p_staff and p_discount is not null and btrim(p_discount) <> '' then
    v_dc := _resolve_discount_code(p_performance_id, v_pid, p_discount, true);
    if v_dc.max_tickets_per_order is not null and p_cantidad > v_dc.max_tickets_per_order then
      raise exception 'Este código permite máximo % boletos por compra', v_dc.max_tickets_per_order;
    end if;
    if exists (select 1 from discount_code_categories where discount_code_id = v_dc.id)
       and not exists (select 1 from discount_code_categories where discount_code_id = v_dc.id and price_category_id = p_zone) then
      raise exception 'El código de descuento no aplica a esta zona';
    end if;
    v_dc_id := v_dc.id;
    v_percent := v_dc.percent;
  end if;

  v_unit := v_price - round(v_price * v_percent / 100, 2);
  v_desc := (v_price - v_unit) * p_cantidad;
  v_total := v_unit * p_cantidad;

  insert into orders (performance_id, status, buyer_nombre, buyer_telefono, buyer_user_id, total, seller_id,
                      created_by_staff_id, approved_by, approved_at, discount_code_id, discount_codigo, discount_amount)
  values (p_performance_id, case when p_staff then 'aprobado'::order_status else 'pendiente'::order_status end,
          btrim(p_nombre), btrim(p_telefono), case when p_staff then null else auth.uid() end, v_total, v_seller,
          case when p_staff then auth.uid() end, case when p_staff then auth.uid() end, case when p_staff then now() end,
          v_dc_id, case when v_dc_id is not null then v_dc.codigo end, v_desc)
  returning id, order_code into v_order, v_code;

  insert into tickets (order_id, performance_id, seat_id, price_category_id, unit_price, is_active)
  select v_order, p_performance_id, null, p_zone, v_unit, true from generate_series(1, p_cantidad);

  return json_build_object('order_id', v_order, 'order_code', v_code, 'status', case when p_staff then 'aprobado' else 'pendiente' end,
                           'quantity', p_cantidad, 'total', v_total, 'discount_amount', v_desc,
                           'discount_codigo', case when v_dc_id is not null then v_dc.codigo end,
                           'seats', (select json_agg('General · ' || v_zone_nombre) from generate_series(1, p_cantidad)),
                           'tickets', (select json_agg(json_build_object('seat_label', 'General · ' || v_zone_nombre, 'qr_token', t.qr_token))
                                         from tickets t where t.order_id = v_order));
end $function$;


-- ──────── Recordatorio de preventa ────────
create table preventa_recordatorios (
  production_id text not null references productions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (production_id, user_id)
);
alter table preventa_recordatorios enable row level security;
create policy preventa_recordatorios_own on preventa_recordatorios for select to authenticated using (user_id = auth.uid());

create or replace function preventa_recordar(pid text, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_fan_member() then raise exception 'Únete al Club Fan para activar el recordatorio.'; end if;
  if not production_is_visible(pid) then raise exception 'Esta obra no existe.'; end if;
  if p_on then
    insert into preventa_recordatorios (production_id, user_id) values (pid, auth.uid()) on conflict do nothing;
  else
    delete from preventa_recordatorios where production_id = pid and user_id = auth.uid();
  end if;
end $$;
revoke execute on function preventa_recordar(text, boolean) from public, anon;
grant execute on function preventa_recordar(text, boolean) to authenticated;

-- Al abrir una función en preventa, se avisa a quienes lo pidieron (y se borra su recordatorio).
create or replace function notify_preventa() returns trigger
language plpgsql security definer set search_path = public as $$
declare uids uuid[];
begin
  if new.on_sale and new.preventa_hasta is not null and new.preventa_hasta > now()
     and (tg_op = 'INSERT' or not old.on_sale or old.preventa_hasta is distinct from new.preventa_hasta) then
    select coalesce(array_agg(user_id), '{}') into uids from preventa_recordatorios where production_id = new.production_id;
    if cardinality(uids) > 0 then
      begin
        perform notify(uids, 'fanzone', left('¡Abrió la preventa de ' || production_name(new.production_id) || '!', 200),
                       'Como socio del Club Fan compras antes que nadie, hasta el ' || cuando_mx(new.preventa_hasta) || '.',
                       '/producciones/' || new.production_id || '#funciones', new.production_id);
      exception when others then null;
      end;
      delete from preventa_recordatorios where production_id = new.production_id;
    end if;
  end if;
  return new;
end $$;
revoke execute on function notify_preventa() from public, anon, authenticated;
create trigger performances_notify_preventa after insert or update of on_sale, preventa_hasta on performances
  for each row execute function notify_preventa();

commit;
