-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV".
-- 0088: dinero, venta y privacidad (funciones pasadas, cancelaciones con motivo, dar más tiempo, eventos cancelables, retrato privado, "Desde $"). Requiere 0087.
-- Si la base no es DEV, aborta. Se corre completa en Supabase → SQL Editor.
begin;
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
end $$;



alter table orders
  add column motivo text check (length(motivo) <= 300),
  add column metodo_pago text check (metodo_pago in ('efectivo', 'transferencia', 'tarjeta', 'deposito', 'cortesia', 'otro')),
  add column referencia text check (length(referencia) <= 80),
  add column cancelada_por_comprador_at timestamptz;

alter table tickets
  add column cancelled_at timestamptz,
  add column cancelled_by uuid references auth.users(id) on delete set null,
  add column cancel_motivo text check (length(cancel_motivo) <= 300);

alter table fan_encuentros
  add column cancelado_at timestamptz,
  add column cancelado_motivo text check (length(cancelado_motivo) <= 300);

create or replace function order_production(oid uuid) returns text
language sql stable security definer set search_path = public as $$
  select pf.production_id from orders o join performances pf on pf.id = o.performance_id where o.id = oid
$$;

create or replace function _audit_venta(p_accion text, oid uuid, extra jsonb default '{}') returns void
language sql security definer set search_path = public as $$
  insert into audit_log (tabla, accion, registro_id, production_id, despues)
  select 'orders', p_accion, o.id::text, pf.production_id,
         jsonb_build_object('order_code', o.order_code, 'status', o.status, 'total', o.total) || coalesce(extra, '{}')
    from orders o join performances pf on pf.id = o.performance_id where o.id = oid
$$;

create or replace function _texto_corto(t text, n int default 300) returns text
language sql immutable set search_path = public as $$
  select nullif(left(btrim(coalesce(t, '')), n), '')
$$;

drop function approve_order(uuid);
create function approve_order(target_order_id uuid, p_metodo text default null, p_referencia text default null)
returns json language plpgsql security definer set search_path = public as $$
declare v_order orders%rowtype;
begin
  if not has_perm(order_production(target_order_id), 'ventas.operar') then raise exception 'No autorizado'; end if;
  select * into v_order from orders where id = target_order_id for update;
  if not found then raise exception 'La orden no existe'; end if;
  if v_order.status <> 'pendiente' then raise exception 'Solo se pueden aprobar órdenes pendientes'; end if;
  if p_metodo is not null and p_metodo not in ('efectivo', 'transferencia', 'tarjeta', 'deposito', 'cortesia', 'otro') then
    raise exception 'Método de pago no válido'; end if;
  update orders set status = 'aprobado', approved_by = auth.uid(), approved_at = now(),
         metodo_pago = coalesce(p_metodo, metodo_pago), referencia = coalesce(_texto_corto(p_referencia, 80), referencia)
   where id = target_order_id;
  perform _audit_venta('aprobar', target_order_id, jsonb_strip_nulls(jsonb_build_object('metodo_pago', p_metodo)));
  return json_build_object('order_id', target_order_id, 'status', 'aprobado');
end $$;

drop function reject_order(uuid);
create function reject_order(target_order_id uuid, p_motivo text default null)
returns json language plpgsql security definer set search_path = public as $$
declare v_order orders%rowtype;
begin
  if not has_perm(order_production(target_order_id), 'ventas.operar') then raise exception 'No autorizado'; end if;
  select * into v_order from orders where id = target_order_id for update;
  if not found then raise exception 'La orden no existe'; end if;
  if v_order.status <> 'pendiente' then raise exception 'Solo se pueden rechazar órdenes pendientes'; end if;
  update orders set status = 'rechazado', rejected_by = auth.uid(), rejected_at = now(), motivo = _texto_corto(p_motivo)
   where id = target_order_id;
  update tickets set is_active = false where order_id = target_order_id and is_active;
  perform _audit_venta('rechazar', target_order_id, jsonb_strip_nulls(jsonb_build_object('motivo', _texto_corto(p_motivo))));
  return json_build_object('order_id', target_order_id, 'status', 'rechazado');
end $$;

drop function admin_cancel_ticket(uuid);
create function admin_cancel_ticket(target_ticket_id uuid, p_motivo text default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  t tickets%rowtype;
  o orders%rowtype;
  v_motivo text := _texto_corto(p_motivo);
  quedan int;
  lugar text;
begin
  select * into t from tickets where id = target_ticket_id for update;
  if not found then raise exception 'El boleto no existe'; end if;
  if not has_perm(order_production(t.order_id), 'ventas.operar') then raise exception 'No autorizado'; end if;
  if not t.is_active then raise exception 'Este boleto ya está cancelado'; end if;
  select * into o from orders where id = t.order_id for update;

  update tickets set is_active = false, cancelled_at = now(), cancelled_by = auth.uid(), cancel_motivo = v_motivo
   where id = target_ticket_id;
  select count(*) into quedan from tickets where order_id = t.order_id and is_active;
  select coalesce(s.seat_label, pc.nombre) into lugar
    from tickets x left join seats s on s.id = x.seat_id left join price_categories pc on pc.id = x.price_category_id
   where x.id = target_ticket_id;

  perform _audit_venta('cancelar_boleto', t.order_id,
    jsonb_strip_nulls(jsonb_build_object('lugar', lugar, 'monto', t.unit_price, 'motivo', v_motivo)));

  if quedan = 0 then
    -- Sin boletos: la orden queda cancelada (avisa notify_buyer).
    update orders set status = 'rechazado', rejected_by = auth.uid(), rejected_at = now(),
           motivo = coalesce(v_motivo, 'Se cancelaron todos sus boletos')
     where id = t.order_id and status <> 'rechazado';
  elsif o.buyer_user_id is not null and o.created_by_staff_id is null then
    begin
      perform notify(array[o.buyer_user_id], 'boletos', 'Se canceló un boleto de tu orden',
        concat_ws(' · ', production_name(order_production(o.id)), o.order_code, lugar, v_motivo),
        '/cuenta#boletos', order_production(o.id));
    exception when others then null;
    end;
  end if;
  return json_build_object('ticket_id', target_ticket_id, 'seat_id', t.seat_id, 'cancelled', true, 'quedan', quedan);
end $$;

create or replace function admin_cancel_order(target_order_id uuid, p_motivo text default null)
returns json language plpgsql security definer set search_path = public as $$
declare o orders%rowtype; v_motivo text := _texto_corto(p_motivo); antes numeric;
begin
  if not has_perm(order_production(target_order_id), 'ventas.operar') then raise exception 'No autorizado'; end if;
  select * into o from orders where id = target_order_id for update;
  if not found then raise exception 'La orden no existe'; end if;
  if o.status = 'rechazado' then raise exception 'Esta orden ya está cancelada'; end if;
  antes := o.total;
  update tickets set is_active = false, cancelled_at = now(), cancelled_by = auth.uid(), cancel_motivo = v_motivo
   where order_id = target_order_id and is_active;
  update orders set status = 'rechazado', rejected_by = auth.uid(), rejected_at = now(), motivo = v_motivo
   where id = target_order_id;
  perform _audit_venta('cancelar', target_order_id,
    jsonb_strip_nulls(jsonb_build_object('monto', antes, 'motivo', v_motivo, 'estaba', o.status)));
  return json_build_object('order_id', target_order_id, 'status', 'rechazado', 'monto', antes);
end $$;

create or replace function extend_order(target_order_id uuid, p_horas int default 24)
returns json language plpgsql security definer set search_path = public as $$
declare
  o orders%rowtype;
  inicio timestamptz;
  v_hasta timestamptz;
  z record;
  v_cupo int;
  v_ocupados int;
begin
  if not has_perm(order_production(target_order_id), 'ventas.operar') then raise exception 'No autorizado'; end if;
  if p_horas is null or p_horas not between 1 and 72 then raise exception 'Elige entre 1 y 72 horas'; end if;
  select * into o from orders where id = target_order_id for update;
  if not found then raise exception 'La orden no existe'; end if;
  select starts_at into inicio from performances where id = o.performance_id;
  if inicio is not null and inicio <= now() then raise exception 'La función ya empezó; haz una venta nueva en taquilla.'; end if;
  v_hasta := least(now() + make_interval(hours => p_horas), coalesce(inicio, now() + make_interval(hours => p_horas)));

  if o.status = 'pendiente' then
    update orders set expires_at = v_hasta, aviso_vence_at = null where id = target_order_id;
  elsif o.status = 'rechazado' and o.vencida_at is not null and o.cancelada_por_comprador_at is null then
    -- Lugares numerados: que nadie los haya tomado ni bloqueado.
    if exists (select 1 from tickets t
                where t.order_id = o.id and not t.is_active and t.cancelled_at is null and t.seat_id is not null
                  and (exists (select 1 from tickets x where x.performance_id = t.performance_id and x.seat_id = t.seat_id and x.is_active)
                       or exists (select 1 from blocked_seats b where b.performance_id = t.performance_id and b.seat_id = t.seat_id))) then
      raise exception 'Uno de sus asientos ya se vendió o se bloqueó: haz una venta nueva en taquilla.';
    end if;
    -- Entrada general: que siga habiendo cupo en cada zona.
    for z in select t.price_category_id as zona, count(*)::int as n from tickets t
              where t.order_id = o.id and not t.is_active and t.cancelled_at is null and t.seat_id is null
              group by t.price_category_id loop
      perform 1 from price_categories where id = z.zona for update;
      select coalesce(ppc.cupo, pc.cupo) into v_cupo
        from price_categories pc left join performance_price_categories ppc
          on ppc.price_category_id = pc.id and ppc.performance_id = o.performance_id
       where pc.id = z.zona;
      select count(*) into v_ocupados from tickets x where x.performance_id = o.performance_id and x.price_category_id = z.zona
         and x.seat_id is null and x.is_active;
      if v_cupo is not null and v_ocupados + z.n > v_cupo then
        raise exception 'Ya no hay cupo suficiente en la zona: haz una venta nueva en taquilla.';
      end if;
    end loop;
    begin
      update tickets set is_active = true where order_id = o.id and not is_active and cancelled_at is null;
    exception when unique_violation then
      raise exception 'Uno de sus asientos ya se vendió: haz una venta nueva en taquilla.';
    end;
    update orders set status = 'pendiente', vencida_at = null, rejected_at = null, rejected_by = null, motivo = null,
           expires_at = v_hasta, aviso_vence_at = null
     where id = target_order_id;
  else
    raise exception 'Solo se puede dar más tiempo a un apartado pendiente o vencido';
  end if;

  perform _audit_venta('extender', target_order_id, jsonb_build_object('hasta', v_hasta));
  if o.buyer_user_id is not null then
    begin
      perform notify(array[o.buyer_user_id], 'boletos', 'Tienes más tiempo para pagar',
        concat_ws(' · ', production_name(order_production(o.id)), o.order_code, 'Tu apartado sigue hasta ' || cuando_mx(v_hasta)),
        '/cuenta#boletos', order_production(o.id));
    exception when others then null;
    end;
  end if;
  return json_build_object('order_id', target_order_id, 'status', 'pendiente', 'expires_at', v_hasta);
end $$;

create or replace function cancel_my_order(target_order_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare o orders%rowtype;
begin
  if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
  select * into o from orders where id = target_order_id and buyer_user_id = auth.uid() for update;
  if not found then raise exception 'No encontramos esta orden en tu cuenta.'; end if;
  if o.status <> 'pendiente' then raise exception 'Solo puedes cancelar un apartado que aún no se paga. Si ya pagaste, escríbenos.'; end if;
  update orders set status = 'rechazado', rejected_at = now(), cancelada_por_comprador_at = now(), motivo = 'La cancelaste tú'
   where id = target_order_id;
  update tickets set is_active = false where order_id = target_order_id and is_active;
  perform _audit_venta('cancelar_comprador', target_order_id);
  return json_build_object('order_id', target_order_id, 'status', 'rechazado');
end $$;

create or replace function order_set_pago(target_order_id uuid, p_metodo text, p_referencia text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_perm(order_production(target_order_id), 'ventas.operar') then raise exception 'No autorizado'; end if;
  if p_metodo is not null and p_metodo not in ('efectivo', 'transferencia', 'tarjeta', 'deposito', 'cortesia', 'otro') then
    raise exception 'Método de pago no válido'; end if;
  update orders set metodo_pago = p_metodo, referencia = _texto_corto(p_referencia, 80) where id = target_order_id;
  if not found then raise exception 'La orden no existe'; end if;
  perform _audit_venta('pago', target_order_id, jsonb_strip_nulls(jsonb_build_object('metodo_pago', p_metodo)));
end $$;

create or replace function notify_buyer() returns trigger
language plpgsql security definer set search_path = public as $$
declare pid text; inicio timestamptz; obra text;
begin
  begin
    if new.buyer_user_id is null or new.created_by_staff_id is not null or new.status = old.status
       or new.cancelada_por_comprador_at is not null then return new; end if;
    select production_id, starts_at into pid, inicio from performances where id = new.performance_id;
    obra := production_name(pid);
    if new.status = 'aprobado' then
      perform notify(array[new.buyer_user_id], 'boletos', '¡Tus boletos están listos!',
        concat_ws(' · ', obra, case when inicio is not null then 'Función ' || cuando_mx(inicio) end, new.order_code, 'Muestra tu código QR en la entrada'),
        '/cuenta#boletos', pid);
    elsif new.status = 'rechazado' and new.vencida_at is not null and old.status = 'pendiente' then
      perform notify(array[new.buyer_user_id], 'boletos', 'Tu apartado venció',
        concat_ws(' · ', obra, new.order_code, 'No recibimos tu pago a tiempo y los asientos se liberaron. Puedes volver a comprar.'),
        '/producciones/' || pid, pid);
    elsif new.status = 'rechazado' then
      perform notify(array[new.buyer_user_id], 'boletos', 'Tu orden fue cancelada',
        concat_ws(' · ', obra, new.order_code, coalesce('Motivo: ' || new.motivo, 'Si crees que es un error, escríbenos.')),
        '/cuenta#boletos', pid);
    end if;
  exception when others then null;
  end;
  return new;
end $$;

create or replace function audit_precio() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.price is distinct from old.price or new.cupo is distinct from old.cupo then
    insert into audit_log (tabla, accion, registro_id, production_id, antes, despues)
    select 'precios', 'precio', new.performance_id::text, pf.production_id,
           jsonb_build_object('zona', pc.nombre, 'precio', old.price, 'cupo', old.cupo),
           jsonb_build_object('zona', pc.nombre, 'precio', new.price, 'cupo', new.cupo, 'funcion', pf.starts_at)
      from performances pf, price_categories pc
     where pf.id = new.performance_id and pc.id = new.price_category_id;
  end if;
  return null;
end $$;
create trigger audit_precio after update on performance_price_categories
  for each row execute function audit_precio();
create trigger audit_discount_codes after insert or update or delete on discount_codes
  for each row execute function audit_row();

create or replace function fan_encuentros_delete_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from evento_ordenes where encuentro_id = old.id and status in ('pendiente', 'aprobado')) then
    raise exception 'Este evento tiene pagos o apartados: cancélalo en lugar de borrarlo.';
  end if;
  return old;
end $$;
create trigger fan_encuentros_delete_guard before delete on fan_encuentros
  for each row execute function fan_encuentros_delete_guard();

create or replace function evento_cancelar(eid uuid, p_motivo text default null)
returns json language plpgsql security definer set search_path = public as $$
declare e fan_encuentros%rowtype; v_motivo text := _texto_corto(p_motivo); avisados uuid[]; pagados uuid[];
begin
  if not evento_puede(eid, 'editar') then raise exception 'No tienes permiso en este evento.'; end if;
  select * into e from fan_encuentros where id = eid for update;
  if not found then raise exception 'Este evento no existe.'; end if;
  if e.cancelado_at is not null then raise exception 'Este evento ya está cancelado.'; end if;
  update fan_encuentros set cancelado_at = now(), cancelado_motivo = v_motivo, abierto = false where id = eid;
  -- Apartados sin pagar: se cancelan. Los pagados se quedan para el reembolso.
  update evento_ordenes set status = 'rechazado', rechazada_por = auth.uid(), rechazada_at = now()
   where encuentro_id = eid and status = 'pendiente';
  select array_agg(user_id) into pagados from evento_ordenes where encuentro_id = eid and status = 'aprobado';
  select array_agg(distinct u) into avisados from (
    select user_id u from fan_encuentro_lugares where encuentro_id = eid
    union select user_id from evento_ordenes where encuentro_id = eid
    union select user_id from evento_recordatorios where encuentro_id = eid) x
   where u <> all(coalesce(pagados, '{}'));
  begin
    if avisados is not null then
      perform notify(avisados, 'eventos', 'Se canceló un evento',
        concat_ws(' · ', evento_nombre(e), cuando_mx(evento_cuando(e)), v_motivo), '/cuenta/eventos', e.production_id);
    end if;
    if pagados is not null then
      perform notify(pagados, 'eventos', 'Se canceló un evento que pagaste',
        concat_ws(' · ', evento_nombre(e), v_motivo, 'Te contactaremos para tu reembolso.'), '/cuenta/eventos', e.production_id);
    end if;
  exception when others then null;
  end;
  return json_build_object('id', eid, 'avisados', coalesce(cardinality(avisados), 0), 'por_reembolsar', coalesce(cardinality(pagados), 0));
end $$;

create or replace function evento_editar(eid uuid, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare e fan_encuentros%rowtype; v_cupo int; usados int;
begin
  if not evento_puede(eid, 'editar') then raise exception 'No tienes permiso en este evento.'; end if;
  select * into e from fan_encuentros where id = eid for update;
  if not found then raise exception 'Este evento no existe.'; end if;
  if e.cancelado_at is not null then raise exception 'Este evento está cancelado.'; end if;
  v_cupo := case when p ? 'cupo' then nullif(p->>'cupo', '')::int else e.cupo end;
  if v_cupo is not null then
    select count(*) into usados from fan_encuentro_lugares where encuentro_id = eid;
    if v_cupo < usados then raise exception 'Ya hay % personas registradas: el cupo no puede ser menor.', usados; end if;
  end if;
  update fan_encuentros set
    titulo = case when p ? 'titulo' then _texto_corto(p->>'titulo', 120) else titulo end,
    descripcion = case when p ? 'descripcion' then _texto_corto(p->>'descripcion', 2000) else descripcion end,
    lugar = case when p ? 'lugar' then _texto_corto(p->>'lugar', 200) else lugar end,
    inicia = case when p ? 'inicia' then nullif(p->>'inicia', '')::timestamptz else inicia end,
    termina = case when p ? 'termina' then nullif(p->>'termina', '')::timestamptz else termina end,
    liga = case when p ? 'liga' then _texto_corto(p->>'liga', 500) else liga end,
    notas = case when p ? 'notas' then _texto_corto(p->>'notas', 500) else notas end,
    cupo = v_cupo,
    precio = case when p ? 'precio' then nullif(p->>'precio', '')::numeric else precio end,
    precio_socio = case when p ? 'precio_socio' then nullif(p->>'precio_socio', '')::numeric else precio_socio end
   where id = eid;
end $$;

create or replace function evento_abrir(eid uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not evento_puede(eid, 'editar') then raise exception 'No tienes permiso en este evento.'; end if;
  if p_on and exists (select 1 from fan_encuentros where id = eid and cancelado_at is not null) then
    raise exception 'Este evento está cancelado.'; end if;
  update fan_encuentros set abierto = p_on where id = eid;
end $$;

create or replace function production_pro_info(pid text)
returns table (person_id uuid, retrato_path text, slug text)
language sql stable security definer set search_path = public as $$
  select distinct c.person_id,
         case when pro_is_public(c.person_id) then p.retrato_path end,
         case when pro_is_public(c.person_id) then p.slug end
    from production_credits c join pro_profiles p on p.person_id = c.person_id
   where c.production_id = pid and production_is_visible(pid)
$$;

create or replace function productions_desde()
returns table (production_id text, desde numeric)
language sql stable security definer set search_path = public as $$
  select pf.production_id, min(ppc.price)
    from performances pf
    join performance_price_categories ppc on ppc.performance_id = pf.id
    join price_categories pc on pc.id = ppc.price_category_id and pc.is_active
   where pf.starts_at > now() and ppc.price > 0 and production_is_visible(pf.production_id)
   group by pf.production_id
$$;

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
    and pf.starts_at > now()
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
   where pf.id = p_performance_id and not pr.concluded and case when p_staff then pf.starts_at is null or pf.starts_at > now() - interval '3 hours'
                                    else pf.on_sale and pf.starts_at > now() end;
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

CREATE OR REPLACE FUNCTION public.admin_create_seated_order(target_performance_id uuid, target_buyer_nombre text, target_buyer_telefono text, target_seat_ids uuid[], target_seller_codigo text DEFAULT NULL::text)
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

  -- Taquilla: no necesita venta abierta, pero no vende funciones de hace más de 3 horas
  -- ni de obras concluidas (0088).
  select pf.production_id into v_production_id
  from performances pf where pf.id = target_performance_id;
  if not found then raise exception 'La función no existe'; end if;
  if exists (select 1 from performances pf join productions pr on pr.id = pf.production_id
              where pf.id = target_performance_id and (pr.concluded or pf.starts_at <= now() - interval '3 hours')) then
    raise exception 'Esta función ya pasó o la obra ya concluyó; no se puede vender.';
  end if;

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
$function$;

CREATE OR REPLACE FUNCTION public.fan_encuentros_lista(pid text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, production_id text, obra text, performance_id uuid, tipo text, categoria text, titulo text, descripcion text, lugar text, starts_at timestamp with time zone, termina timestamp with time zone, venue text, cupo integer, libres integer, abierto boolean, notas text, requiere_registro boolean, requiere_boleto boolean, acceso text, apartado boolean, con_boleto boolean, recordar boolean, en_vivo boolean, liga text, precio numeric, precio_socio numeric, mi_precio numeric, orden_codigo text, orden_status text, orden_monto numeric, orden_expira timestamp with time zone, pagado boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select e.id, e.production_id, pr.nombre, e.performance_id, e.tipo, e.categoria, evento_nombre(e), e.descripcion,
         e.lugar, evento_cuando(e), evento_fin(e), coalesce(e.lugar, pf.venue, pr.venue), e.cupo,
         case when e.cupo is null then null else greatest(0, e.cupo - (select count(*) from fan_encuentro_lugares l where l.encuentro_id = e.id))::int end,
         e.abierto, e.notas, e.requiere_registro, e.requiere_boleto, e.acceso,
         exists (select 1 from fan_encuentro_lugares l where l.encuentro_id = e.id and l.user_id = auth.uid()),
         not e.requiere_boleto or e.performance_id is null
           or exists (select 1 from orders o where o.performance_id = e.performance_id and o.buyer_user_id = auth.uid() and o.status = 'aprobado'),
         exists (select 1 from evento_recordatorios r where r.encuentro_id = e.id and r.user_id = auth.uid()),
         now() between evento_cuando(e) - interval '15 minutes' and evento_fin(e),
         case when e.tipo = 'en_linea' and now() between evento_cuando(e) - interval '15 minutes' and evento_fin(e)
                   and (not e.requiere_registro or exists (select 1 from fan_encuentro_lugares l where l.encuentro_id = e.id and l.user_id = auth.uid()))
                   and (e.precio is null or evento_pagado(e.id, auth.uid()))
              then e.liga end,
         e.precio, e.precio_socio, case when auth.uid() is null then e.precio else nullif(evento_precio(e, auth.uid()), 0) end,
         o.codigo, o.status, o.monto, o.expires_at,
         e.precio is null or o.status = 'aprobado'
    from fan_encuentros e
    left join performances pf on pf.id = e.performance_id
    left join productions pr on pr.id = e.production_id
    left join lateral (select * from evento_ordenes x where x.encuentro_id = e.id and x.user_id = auth.uid() and x.status in ('pendiente', 'aprobado')
                       order by x.created_at desc limit 1) o on true
   where evento_puede_ver(e)
     and evento_fin(e) > now()
     and e.cancelado_at is null
     and (pid is null or e.production_id = pid)
   order by evento_cuando(e)
$function$;

CREATE OR REPLACE FUNCTION public.eventos_cartelera(p_limite integer DEFAULT 6)
 RETURNS TABLE(id uuid, production_id text, obra text, tipo text, categoria text, titulo text, lugar text, starts_at timestamp with time zone, termina timestamp with time zone, acceso text, requiere_registro boolean, en_vivo boolean, precio numeric, precio_socio numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select e.id, e.production_id, pr.nombre, e.tipo, e.categoria, evento_nombre(e),
         case when e.tipo = 'en_linea' then null else coalesce(e.lugar, pf.venue, pr.venue) end,
         evento_cuando(e), evento_fin(e), e.acceso, e.requiere_registro,
         now() between evento_cuando(e) - interval '15 minutes' and evento_fin(e),
         e.precio, e.precio_socio
    from fan_encuentros e
    left join performances pf on pf.id = e.performance_id
    left join productions pr on pr.id = e.production_id
   where (e.production_id is null or production_is_visible(e.production_id))
     and evento_fin(e) > now()
     and e.cancelado_at is null
   order by evento_cuando(e)
   limit greatest(1, least(coalesce(p_limite, 6), 50))
$function$;

drop function mis_eventos();
CREATE FUNCTION public.mis_eventos()
 RETURNS TABLE(id uuid, titulo text, tipo text, obra text, starts_at timestamp with time zone, lugar text, orden_codigo text, orden_status text, orden_monto numeric, orden_expira timestamp with time zone, vencida boolean, llegada_at timestamp with time zone, cancelado boolean, cancelado_motivo text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select e.id, evento_nombre(e), e.tipo, pr.nombre, evento_cuando(e), case when e.tipo = 'en_linea' then 'En línea' else e.lugar end,
         o.codigo, o.status, o.monto, o.expires_at, o.vencida_at is not null, l.llegada_at, e.cancelado_at is not null, e.cancelado_motivo
    from fan_encuentros e
    left join productions pr on pr.id = e.production_id
    left join fan_encuentro_lugares l on l.encuentro_id = e.id and l.user_id = auth.uid()
    left join lateral (select * from evento_ordenes x where x.encuentro_id = e.id and x.user_id = auth.uid() order by x.created_at desc limit 1) o on true
   where auth.uid() is not null and (l.user_id is not null or o.id is not null)
   order by evento_cuando(e) desc
$function$;


create or replace function ventas_actores(pid text)
returns table (id uuid, nombre text)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(nullif(btrim(p.nombre), ''), 'Equipo DARF')
    from profiles p
   where has_perm(pid, 'ventas.ver')
     and p.id in (
       select unnest(array[o.approved_by, o.rejected_by, o.created_by_staff_id])
         from orders o join performances pf on pf.id = o.performance_id where pf.production_id = pid
       union
       select t.cancelled_by from tickets t join performances pf on pf.id = t.performance_id
        where pf.production_id = pid and t.cancelled_by is not null)
$$;

revoke execute on function _audit_venta(text, uuid, jsonb), order_production(uuid), audit_precio(),
  fan_encuentros_delete_guard(), notify_buyer() from public, anon, authenticated;
revoke execute on function approve_order(uuid, text, text), reject_order(uuid, text), admin_cancel_ticket(uuid, text),
  admin_cancel_order(uuid, text), extend_order(uuid, int), cancel_my_order(uuid), order_set_pago(uuid, text, text),
  evento_cancelar(uuid, text), evento_editar(uuid, jsonb), mis_eventos(), ventas_actores(text) from public, anon;
grant execute on function approve_order(uuid, text, text), reject_order(uuid, text), admin_cancel_ticket(uuid, text),
  admin_cancel_order(uuid, text), extend_order(uuid, int), cancel_my_order(uuid), order_set_pago(uuid, text, text),
  evento_cancelar(uuid, text), evento_editar(uuid, jsonb), mis_eventos(), ventas_actores(text) to authenticated;
grant execute on function productions_desde() to anon, authenticated;

commit;
