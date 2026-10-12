-- 0068: pendientes del test maestro antes de publicar (2026-10-12, aprobado por Diego).
--   1. Puerta: check_in_ticket recibe la función que se está validando. Un boleto de OTRA
--      función se rechaza ('otra_funcion') y NO se marca usado. Todas las respuestas traen
--      la fecha de la función y el nombre de la obra.
--   2. Abuso: contacto con límite (5 por correo por hora, 300 por hora en total) y largos
--      máximos, aplicado en la base (también frena inserts directos a la API). push_* sin
--      acceso anónimo; push_test solo para el panel y máximo 5 por hora.
--   3. Vencimiento automático: si pg_cron está activo, expire_due_orders() corre cada minuto.
--   4. Totales de venta en SQL (production_sales_summary): ya no dependen de cuántas
--      órdenes muestre la lista.
-- Precede: 0067.

begin;

-- ════════ 1. Puerta ════════
drop function if exists check_in_ticket(text);
create or replace function check_in_ticket(target_qr_token text, p_performance uuid default null)
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

  select t.id, t.is_active, t.checked_in_at, t.performance_id,
         coalesce(s.seat_label, 'General · ' || pc.nombre) as seat_label, pc.nombre as category,
         pf.starts_at, p.nombre as production, o.buyer_nombre, o.status as order_status
  into v_ticket
  from tickets t
  join orders o on o.id = t.order_id
  join performances pf on pf.id = t.performance_id
  join productions p on p.id = pf.production_id
  left join seats s on s.id = t.seat_id
  left join price_categories pc on pc.id = coalesce(s.price_category_id, t.price_category_id)
  where t.qr_token = v_token;

  if not found then return json_build_object('result', 'no_encontrado'); end if;

  if p_performance is not null and v_ticket.performance_id <> p_performance then
    return json_build_object('result', 'otra_funcion', 'seat_label', v_ticket.seat_label,
                             'buyer_nombre', v_ticket.buyer_nombre, 'production', v_ticket.production,
                             'performance_starts_at', v_ticket.starts_at);
  end if;

  if not v_ticket.is_active then
    return json_build_object('result', 'cancelado', 'seat_label', v_ticket.seat_label, 'buyer_nombre', v_ticket.buyer_nombre,
                             'production', v_ticket.production, 'performance_starts_at', v_ticket.starts_at);
  end if;

  if v_ticket.order_status <> 'aprobado' then
    return json_build_object('result', 'no_aprobado', 'seat_label', v_ticket.seat_label, 'buyer_nombre', v_ticket.buyer_nombre,
                             'production', v_ticket.production, 'performance_starts_at', v_ticket.starts_at);
  end if;

  update tickets set checked_in_at = now(), checked_in_by = auth.uid()
  where id = v_ticket.id and is_active and checked_in_at is null;
  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    return json_build_object('result', 'ya_usado', 'seat_label', v_ticket.seat_label, 'buyer_nombre', v_ticket.buyer_nombre,
                             'checked_in_at', v_ticket.checked_in_at, 'production', v_ticket.production,
                             'performance_starts_at', v_ticket.starts_at);
  end if;

  return json_build_object('result', 'ok', 'seat_label', v_ticket.seat_label, 'category', v_ticket.category,
                           'performance_starts_at', v_ticket.starts_at, 'production', v_ticket.production,
                           'buyer_nombre', v_ticket.buyer_nombre);
end;
$$;
revoke execute on function check_in_ticket(text, uuid) from public, anon;
grant execute on function check_in_ticket(text, uuid) to authenticated;

-- ════════ 2. Abuso ════════
alter table contact_messages
  add constraint contact_messages_largos check (
    length(nombre) <= 120 and length(correo) <= 200 and length(coalesce(telefono, '')) <= 40
    and length(coalesce(asunto, '')) <= 200 and length(mensaje) <= 4000) not valid;

create or replace function contact_rate_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from contact_messages where lower(correo) = lower(new.correo) and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Ya recibimos varios mensajes de este correo. Intenta de nuevo en una hora.' using errcode = 'P0001';
  end if;
  if (select count(*) from contact_messages where created_at > now() - interval '1 hour') >= 300 then
    raise exception 'Estamos recibiendo muchos mensajes. Intenta de nuevo en un rato.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger contact_rate_limit before insert on contact_messages for each row execute function contact_rate_limit();

revoke execute on function push_subscribe(text, text, text, text) from anon;
revoke execute on function push_set_off(text[]) from anon;
revoke execute on function push_test() from anon;

create or replace function push_test() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Necesitas iniciar sesión'; end if;
  if not (is_staff() or exists (select 1 from production_members where user_id = auth.uid() and role_id <> 'integrante')) then
    raise exception 'Solo para el equipo';
  end if;
  if (select count(*) from notifications where user_id = auth.uid() and tipo = 'prueba' and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Ya mandaste varias pruebas. Intenta en una hora.';
  end if;
  insert into notifications (user_id, tipo, titulo, detalle, href)
  values (auth.uid(), 'prueba', 'Prueba de notificación', 'Si ves esto en tu teléfono, ya quedó.', '/panel/notificaciones');
end $$;
revoke execute on function push_test() from public, anon;
grant execute on function push_test() to authenticated;

-- ════════ 3. Vencimiento automático ════════
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'darf_expire_orders';
    perform cron.schedule('darf_expire_orders', '* * * * *', 'select public.expire_due_orders()');
  end if;
end $$;

-- ════════ 4. Totales de venta ════════
create or replace function production_sales_summary(pid text, p_funcion uuid default null) returns json
language plpgsql stable security definer set search_path = public as $$
declare r json;
begin
  if not (has_perm(pid, 'ventas.ver') or has_perm(pid, 'reportes.ver')) then raise exception 'No autorizado'; end if;
  with o as (
    select o.id, o.performance_id, o.status, o.total,
           (select count(*) from tickets t where t.order_id = o.id and t.is_active) as activos,
           (select count(*) from tickets t where t.order_id = o.id and t.is_active and t.checked_in_at is not null) as validados
      from orders o join performances pf on pf.id = o.performance_id
     where pf.production_id = pid and (p_funcion is null or o.performance_id = p_funcion)
  ), f as (
    select performance_id,
           coalesce(sum(activos) filter (where status = 'aprobado'), 0) as vendidos,
           coalesce(sum(activos) filter (where status = 'pendiente'), 0) as apartados,
           coalesce(sum(total) filter (where status = 'aprobado'), 0) as ingresos,
           coalesce(sum(validados) filter (where status = 'aprobado'), 0) as validados
      from o group by performance_id
  )
  select json_build_object(
    'ingresos', coalesce((select sum(total) from o where status = 'aprobado'), 0),
    'pendiente', coalesce((select sum(total) from o where status = 'pendiente'), 0),
    'vendidos', coalesce((select sum(activos) from o where status = 'aprobado'), 0),
    'apartados', coalesce((select sum(activos) from o where status = 'pendiente'), 0),
    'validados', coalesce((select sum(validados) from o where status = 'aprobado'), 0),
    'ordenesPendientes', (select count(*) from o where status = 'pendiente'),
    'ordenes', (select count(*) from o),
    'porFuncion', coalesce((select json_object_agg(performance_id, json_build_object('vendidos', vendidos, 'apartados', apartados, 'ingresos', ingresos, 'validados', validados)) from f), '{}'::json)
  ) into r;
  return r;
end $$;
revoke execute on function production_sales_summary(text, uuid) from public, anon;
grant execute on function production_sales_summary(text, uuid) to authenticated;

-- ════════ 5. Mi cuenta: asientos de mis órdenes pendientes (sin QR) ════════
-- El comprador no ve sus boletos hasta que se aprueba la orden (0011); aquí solo la etiqueta.
create or replace function my_pending_order_items() returns table(order_id uuid, etiqueta text)
language sql stable security definer set search_path = public as $$
  select t.order_id, coalesce(s.seat_label, 'General · ' || pc.nombre)
    from tickets t
    join orders o on o.id = t.order_id
    left join seats s on s.id = t.seat_id
    left join price_categories pc on pc.id = coalesce(s.price_category_id, t.price_category_id)
   where o.buyer_user_id = auth.uid() and o.status = 'pendiente' and t.is_active
   order by 2
$$;
revoke execute on function my_pending_order_items() from public, anon;
grant execute on function my_pending_order_items() to authenticated;

commit;
