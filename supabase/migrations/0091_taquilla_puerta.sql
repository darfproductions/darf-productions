-- 0091: taquilla, puerta y órdenes (Bloque 4A, 2026-10-13).
--   1. Cortesía: una orden de taquilla (o ya aprobada) queda en $0 con motivo, y lo dice la bitácora.
--   2. Códigos de descuento también en taquilla: se aplican a la orden recién vendida.
--   3. Corte de caja: por cajero y por método de pago, en un rango de fechas y función; con lo
--      cancelado (devoluciones) aparte.
--   4. Puerta: contador "entraron X de Y", buscar por nombre o código (plan B si el QR no abre),
--      lista de la función para descargar, y deshacer una entrada marcada por error.
--   5. Funciones: cancelar una función con motivo (no se vende más; los apartados se cancelan; a
--      quien pagó se le avisa del reembolso) y avisar a los compradores si cambia la fecha.
-- Precede: 0090.

begin;

-- ════════ 1. Cortesía ════════
create or replace function order_cortesia(target_order_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare o orders%rowtype; m text := _texto_corto(p_motivo, 300);
begin
  if not has_perm(order_production(target_order_id), 'ventas.operar') then raise exception 'No autorizado'; end if;
  if m is null then raise exception 'Escribe el motivo de la cortesía (a quién y por qué).'; end if;
  select * into o from orders where id = target_order_id for update;
  if not found then raise exception 'La orden no existe'; end if;
  if o.status <> 'aprobado' then raise exception 'Solo una orden aprobada puede ser cortesía.'; end if;
  update tickets set unit_price = 0 where order_id = o.id and is_active;
  update orders set metodo_pago = 'cortesia', motivo = m, referencia = null where id = o.id;
  perform _audit_venta('cortesia', o.id, jsonb_build_object('motivo', m, 'antes', o.total));
end $$;

-- ════════ 2. Código de descuento en taquilla ════════
create or replace function order_aplicar_codigo(target_order_id uuid, p_codigo text)
returns json language plpgsql security definer set search_path = public as $$
declare o orders%rowtype; pid text; v_dc discount_codes; restringido boolean; desc_total numeric := 0;
begin
  pid := order_production(target_order_id);
  if not has_perm(pid, 'ventas.operar') then raise exception 'No autorizado'; end if;
  select * into o from orders where id = target_order_id for update;
  if not found then raise exception 'La orden no existe'; end if;
  if o.created_by_staff_id is null then raise exception 'El código en taquilla solo aplica a ventas de taquilla.'; end if;
  if o.discount_code_id is not null then raise exception 'Esta orden ya tiene un código de descuento.'; end if;
  if coalesce(o.metodo_pago, '') = 'cortesia' then raise exception 'Una cortesía no lleva descuento.'; end if;
  v_dc := _resolve_discount_code(o.performance_id, pid, p_codigo, true);
  if v_dc.max_tickets_per_order is not null
     and (select count(*) from tickets where order_id = o.id and is_active) > v_dc.max_tickets_per_order then
    raise exception 'Este código permite máximo % boletos por orden.', v_dc.max_tickets_per_order;
  end if;
  restringido := exists (select 1 from discount_code_categories where discount_code_id = v_dc.id);
  select coalesce(sum(round(t.unit_price * v_dc.percent / 100, 2)), 0) into desc_total
    from tickets t
   where t.order_id = o.id and t.is_active
     and (not restringido or exists (select 1 from discount_code_categories c where c.discount_code_id = v_dc.id and c.price_category_id = coalesce(t.price_category_id, (select s.price_category_id from seats s where s.id = t.seat_id))));
  if desc_total = 0 then raise exception 'El código no aplica a estos boletos.'; end if;
  update tickets t set unit_price = t.unit_price - round(t.unit_price * v_dc.percent / 100, 2)
   where t.order_id = o.id and t.is_active
     and (not restringido or exists (select 1 from discount_code_categories c where c.discount_code_id = v_dc.id and c.price_category_id = coalesce(t.price_category_id, (select s.price_category_id from seats s where s.id = t.seat_id))));
  update orders set discount_code_id = v_dc.id, discount_codigo = v_dc.codigo, discount_amount = desc_total where id = o.id;
  perform _audit_venta('codigo', o.id, jsonb_build_object('codigo', v_dc.codigo, 'descuento', desc_total));
  return json_build_object('codigo', v_dc.codigo, 'descuento', desc_total, 'total', (select total from orders where id = o.id));
end $$;

-- ════════ 3. Corte de caja ════════
-- Ventas aprobadas en el rango (por quién vendió o aprobó y el método) y boletos cancelados en el
-- rango (por quién canceló). Fechas inclusivas en hora de México.
create or replace function corte_caja(pid text, p_desde date, p_hasta date, p_funcion uuid default null)
returns json language plpgsql stable security definer set search_path = public as $$
declare ini timestamptz := (p_desde::timestamp at time zone 'America/Mexico_City');
        fin timestamptz := ((p_hasta + 1)::timestamp at time zone 'America/Mexico_City');
begin
  if not (has_perm(pid, 'ventas.ver') or has_perm(pid, 'reportes.ver')) then raise exception 'No autorizado'; end if;
  return json_build_object(
    'ventas', coalesce((
      select json_agg(x order by x.cajero, x.metodo) from (
        select coalesce(p.nombre, case when coalesce(o.created_by_staff_id, o.approved_by) is null then 'En línea' else 'Equipo' end) as cajero,
               coalesce(o.metodo_pago, 'sin_registrar') as metodo,
               count(distinct o.id) as ordenes,
               count(t.id) filter (where t.is_active) as boletos,
               coalesce(sum(t.unit_price) filter (where t.is_active), 0) as total
          from orders o
          join performances pf on pf.id = o.performance_id
          left join tickets t on t.order_id = o.id
          left join profiles p on p.id = coalesce(o.created_by_staff_id, o.approved_by)
         where pf.production_id = pid and o.status = 'aprobado'
           and o.approved_at >= ini and o.approved_at < fin
           and (p_funcion is null or o.performance_id = p_funcion)
         group by 1, 2) x), '[]'::json),
    'cancelados', coalesce((
      select json_agg(x order by x.cajero) from (
        select coalesce(p.nombre, 'Equipo') as cajero, count(*) as boletos, coalesce(sum(t.unit_price), 0) as monto
          from tickets t
          join performances pf on pf.id = t.performance_id
          left join profiles p on p.id = t.cancelled_by
         where pf.production_id = pid and t.cancelled_at >= ini and t.cancelled_at < fin
           and (p_funcion is null or t.performance_id = p_funcion)
         group by 1) x), '[]'::json)
  );
end $$;

-- ════════ 4. Puerta ════════
create or replace function _puede_puerta(pf uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_staff() or exists (select 1 from performances p where p.id = pf
    and (has_perm(p.production_id, 'puerta.validar') or has_perm(p.production_id, 'ventas.ver')))
$$;

create or replace function puerta_conteo(p_performance uuid) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not _puede_puerta(p_performance) then raise exception 'No autorizado'; end if;
  return (select json_build_object('vendidos', count(*), 'entraron', count(*) filter (where t.checked_in_at is not null))
            from tickets t join orders o on o.id = t.order_id
           where t.performance_id = p_performance and t.is_active and o.status = 'aprobado');
end $$;

-- Lista de la función (todas o las que coinciden con nombre, teléfono, código de orden o asiento).
create or replace function puerta_lista(p_performance uuid, p_q text default null)
returns table (ticket_id uuid, qr_token uuid, order_code text, buyer_nombre text, buyer_telefono text, lugar text, checked_in_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare q text := nullif(btrim(coalesce(p_q, '')), '');
begin
  if not _puede_puerta(p_performance) then raise exception 'No autorizado'; end if;
  return query
    select t.id, t.qr_token, o.order_code, o.buyer_nombre, o.buyer_telefono,
           coalesce(s.seat_label, 'General · ' || pc.nombre, 'General'), t.checked_in_at
      from tickets t
      join orders o on o.id = t.order_id
      left join seats s on s.id = t.seat_id
      left join price_categories pc on pc.id = t.price_category_id
     where t.performance_id = p_performance and t.is_active and o.status = 'aprobado'
       and (q is null
            or sin_acentos(o.buyer_nombre) ilike '%' || sin_acentos(q) || '%'
            or regexp_replace(o.buyer_telefono, '\D', '', 'g') like '%' || regexp_replace(q, '\D', '', 'g') || '%' and length(regexp_replace(q, '\D', '', 'g')) >= 4
            or o.order_code ilike '%' || q || '%'
            or s.seat_label ilike q)
     order by o.buyer_nombre, coalesce(s.seat_label, '');
end $$;

create or replace function puerta_deshacer(p_ticket uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t tickets%rowtype;
begin
  select * into t from tickets where id = p_ticket for update;
  if not found then raise exception 'El boleto no existe'; end if;
  if not _puede_puerta(t.performance_id) then raise exception 'No autorizado'; end if;
  if t.checked_in_at is null then raise exception 'Ese boleto no se había marcado.'; end if;
  update tickets set checked_in_at = null, checked_in_by = null where id = p_ticket;
  perform _audit_venta('deshacer_entrada', t.order_id, jsonb_build_object('marcado_at', t.checked_in_at));
end $$;

-- ════════ 5. Cancelar una función y avisar cambios de fecha ════════
alter table performances add column if not exists cancelada_at timestamptz;
alter table performances add column if not exists cancelada_motivo text check (length(cancelada_motivo) <= 300);

create or replace function funcion_cancelar(p_performance uuid, p_motivo text) returns json
language plpgsql security definer set search_path = public as $$
declare pf performances%rowtype; m text := _texto_corto(p_motivo, 300); pendientes int; pagadas uuid[]; cuando text; obra text;
begin
  select * into pf from performances where id = p_performance for update;
  if not found then raise exception 'La función no existe'; end if;
  if not has_perm(pf.production_id, 'funciones.gestionar') then raise exception 'No autorizado'; end if;
  if pf.cancelada_at is not null then raise exception 'Esta función ya estaba cancelada.'; end if;
  if m is null then raise exception 'Escribe el motivo (lo verá quien compró).'; end if;
  update performances set cancelada_at = now(), cancelada_motivo = m, on_sale = false where id = pf.id;
  cuando := cuando_mx(pf.starts_at); obra := production_name(pf.production_id);
  -- Apartados sin pagar: se cancelan (el aviso normal de "rechazada" lleva el motivo).
  update orders set status = 'rechazado', rejected_at = now(), rejected_by = auth.uid(), motivo = 'Se canceló la función: ' || m
   where performance_id = pf.id and status = 'pendiente';
  get diagnostics pendientes = row_count;
  select array_agg(distinct buyer_user_id) into pagadas from orders
   where performance_id = pf.id and status = 'aprobado' and buyer_user_id is not null;
  begin
    perform notify(coalesce(pagadas, '{}'), 'boletos', 'Se canceló tu función',
      concat_ws(' · ', obra, cuando, m, 'Te contactamos para tu reembolso completo en máximo 10 días hábiles.'), '/cuenta', pf.production_id);
  exception when others then null;
  end;
  insert into audit_log (tabla, accion, registro_id, production_id, despues)
  values ('performances', 'cancelar', pf.id::text, pf.production_id, jsonb_build_object('starts_at', pf.starts_at, 'motivo', m));
  return json_build_object('apartados_cancelados', pendientes,
    'pagadas', (select count(*) from orders where performance_id = pf.id and status = 'aprobado'));
end $$;

-- Ya no se vende (en línea ni en taquilla) una función cancelada.
create or replace function orders_funcion_activa() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from performances where id = new.performance_id and cancelada_at is not null) then
    raise exception 'Esta función se canceló.';
  end if;
  return new;
end $$;
drop trigger if exists orders_funcion_activa on orders;
create trigger orders_funcion_activa before insert on orders for each row execute function orders_funcion_activa();

create or replace function performances_no_reabrir() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.cancelada_at is not null and new.on_sale then raise exception 'Una función cancelada no se vuelve a vender.'; end if;
  return new;
end $$;
drop trigger if exists performances_no_reabrir on performances;
create trigger performances_no_reabrir before update of on_sale on performances for each row execute function performances_no_reabrir();

-- Si cambia la fecha u hora, se avisa a quien tiene boletos o apartados y el recordatorio se vuelve a mandar.
create or replace function notify_cambio_funcion() returns trigger
language plpgsql security definer set search_path = public as $$
declare uids uuid[];
begin
  if new.starts_at is not distinct from old.starts_at or new.cancelada_at is not null then return new; end if;
  update orders set aviso_funcion_at = null where performance_id = new.id and status in ('pendiente', 'aprobado');
  select array_agg(distinct buyer_user_id) into uids from orders
   where performance_id = new.id and status in ('pendiente', 'aprobado') and buyer_user_id is not null;
  begin
    perform notify(coalesce(uids, '{}'), 'boletos', 'Cambió la fecha de tu función',
      concat_ws(' · ', production_name(new.production_id), 'Antes: ' || cuando_mx(old.starts_at), 'Ahora: ' || cuando_mx(new.starts_at),
                'Tus boletos siguen siendo válidos.'), '/cuenta', new.production_id);
  exception when others then null;
  end;
  insert into audit_log (tabla, accion, registro_id, production_id, despues)
  values ('performances', 'cambiar_fecha', new.id::text, new.production_id, jsonb_build_object('antes', old.starts_at, 'ahora', new.starts_at));
  return new;
end $$;
drop trigger if exists notify_cambio_funcion on performances;
create trigger notify_cambio_funcion after update of starts_at on performances for each row execute function notify_cambio_funcion();

-- ════════ Permisos ════════
revoke execute on function order_cortesia(uuid, text), order_aplicar_codigo(uuid, text), corte_caja(text, date, date, uuid),
  puerta_conteo(uuid), puerta_lista(uuid, text), puerta_deshacer(uuid), funcion_cancelar(uuid, text) from public, anon;
grant execute on function order_cortesia(uuid, text), order_aplicar_codigo(uuid, text), corte_caja(text, date, date, uuid),
  puerta_conteo(uuid), puerta_lista(uuid, text), puerta_deshacer(uuid), funcion_cancelar(uuid, text) to authenticated;
revoke execute on function _puede_puerta(uuid), orders_funcion_activa(), performances_no_reabrir(), notify_cambio_funcion() from public, anon, authenticated;

commit;
