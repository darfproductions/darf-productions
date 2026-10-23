-- 0125 (Diego 2026-10-22): entregas de beneficios con momento, fecha límite, lista por persona y avisos.
--   Lo que se paga se tiene que entregar: cada beneficio dice CUÁNDO se entrega y la plataforma lleva el registro de
--   qué falta, qué ya se entregó (quién, cuándo y una nota) y qué ya se venció.
--   Momentos: antes del día de la función (hasta N días antes), el día antes de la función, el día al terminar la
--   función y después del día de la función (plazo de N días). Fecha límite en hora de México.
--   Se marca en la puerta (QR) o desde la lista de Entregas del panel. Avisos: bandeja "Por hacer" y cierre.
-- Precede: 0124.

begin;

-- ──────── Momento de entrega ────────
alter table zona_beneficios
  add column if not exists entrega text,
  add column if not exists entrega_dias int;
update zona_beneficios set entrega = case when tipo = 'acceso' then 'dia_antes' else 'dia_despues' end where entrega is null;
alter table zona_beneficios alter column entrega set not null;
alter table zona_beneficios drop constraint if exists zona_beneficios_entrega;
alter table zona_beneficios add constraint zona_beneficios_entrega check (
  entrega in ('antes', 'dia_antes', 'dia_despues', 'despues')
  and case when entrega = 'antes' then coalesce(entrega_dias between 1 and 60, false)
           when entrega = 'despues' then coalesce(entrega_dias between 1 and 90, false)
           else entrega_dias is null end);

-- Sin momento al crear: el acceso es antes de la función; lo demás, al terminar.
create or replace function zona_beneficio_entrega_omision() returns trigger
language plpgsql as $$
begin
  if new.entrega is null then new.entrega := case when new.tipo = 'acceso' then 'dia_antes' else 'dia_despues' end; end if;
  if new.entrega in ('dia_antes', 'dia_despues') then new.entrega_dias := null; end if;
  return new;
end $$;
drop trigger if exists zona_beneficio_entrega_omision on zona_beneficios;
create trigger zona_beneficio_entrega_omision before insert or update on zona_beneficios
  for each row execute function zona_beneficio_entrega_omision();

alter table beneficio_entregas add column if not exists nota text;
alter table beneficio_entregas drop constraint if exists beneficio_entregas_nota;
alter table beneficio_entregas add constraint beneficio_entregas_nota check (nota is null or char_length(nota) <= 200);

-- Desde cuándo se puede entregar y hasta cuándo (fecha límite), en hora de México.
create or replace function beneficio_limite(p_inicio timestamptz, p_entrega text, p_dias int, out desde timestamptz, out limite timestamptz)
language plpgsql stable as $$
declare d date := (p_inicio at time zone 'America/Mexico_City')::date;
begin
  if p_entrega = 'antes' then
    desde := (d - coalesce(p_dias, 1))::timestamp at time zone 'America/Mexico_City'; limite := p_inicio;
  elsif p_entrega = 'dia_antes' then
    desde := d::timestamp at time zone 'America/Mexico_City'; limite := p_inicio;
  elsif p_entrega = 'dia_despues' then
    desde := p_inicio; limite := (d + 1)::timestamp at time zone 'America/Mexico_City';
  else
    desde := (d + 1)::timestamp at time zone 'America/Mexico_City'; limite := (d + 1 + coalesce(p_dias, 1))::timestamp at time zone 'America/Mexico_City';
  end if;
end $$;

-- ──────── Beneficios de un boleto (interna): ahora con momento, límite, nota y estado ────────
-- estado: entregado | por_pagar (orden sin aprobar) | sin_cupo | vencido | hoy (ya se puede entregar) | pendiente.
drop function if exists beneficios_de_ticket(uuid);
create function beneficios_de_ticket(p_ticket uuid)
returns table (beneficio_id uuid, tipo text, nombre text, detalle text, minutos_antes int, cupo int,
               alcanza boolean, entregado_at timestamptz, zona text,
               entrega text, entrega_dias int, desde timestamptz, limite timestamptz, nota text, estado text)
language sql stable security definer set search_path = public as $$
  with b as (
    select t.id as tid, t.performance_id as pf, t.created_at as t_at, o.status, coalesce(o.approved_at, o.created_at) as pagado,
           coalesce(t.price_category_id, s.price_category_id) as zona, p.starts_at
    from tickets t join orders o on o.id = t.order_id left join seats s on s.id = t.seat_id
         join performances p on p.id = t.performance_id
    where t.id = p_ticket and t.is_active
  ), x as (
    select zb.id, zb.tipo, zb.nombre, zb.detalle, zb.minutos_antes, zb.cupo, zb.orden, zb.created_at,
           case when zb.cupo is null then (case when b.status = 'aprobado' then true else null end)
                when b.status <> 'aprobado' then null
                else (select count(*) from tickets t2 join orders o2 on o2.id = t2.order_id left join seats s2 on s2.id = t2.seat_id
                       where t2.performance_id = b.pf and t2.is_active and o2.status = 'aprobado'
                         and coalesce(t2.price_category_id, s2.price_category_id) in
                             (select z2.price_category_id from zona_beneficio_zonas z2 where z2.beneficio_id = zb.id)
                         and (coalesce(o2.approved_at, o2.created_at), t2.created_at, t2.id) < (b.pagado, b.t_at, b.tid)) < zb.cupo
           end as alcanza,
           e.entregado_at, pc.nombre as zona, zb.entrega, zb.entrega_dias, l.desde, l.limite, e.nota
    from b
    join zona_beneficio_zonas z on z.price_category_id = b.zona
    join zona_beneficios zb on zb.id = z.beneficio_id and zb.activo and (zb.funciones is null or b.pf = any(zb.funciones))
    join price_categories pc on pc.id = b.zona
    cross join lateral beneficio_limite(b.starts_at, zb.entrega, zb.entrega_dias) l
    left join beneficio_entregas e on e.ticket_id = b.tid and e.beneficio_id = zb.id
  )
  select id, tipo, nombre, detalle, minutos_antes, cupo,
         -- Sin cupo y sin aprobar: se muestra como "sí incluye" (como en 0122); el estado dice que falta el pago.
         case when cupo is null then true else alcanza end,
         entregado_at, zona, entrega, entrega_dias, desde, limite, nota,
         case when entregado_at is not null then 'entregado'
              when alcanza is null then 'por_pagar'
              when not alcanza then 'sin_cupo'
              when now() >= limite then 'vencido'
              when now() >= desde then 'hoy'
              else 'pendiente' end
  from x
  order by orden, created_at
$$;
revoke all on function beneficios_de_ticket(uuid) from public, anon, authenticated;

-- ──────── Marcar entregas (puerta por QR o lista por boleto) ────────
create or replace function beneficio_marcar(tid uuid, pid text, p_beneficio uuid, p_entregado boolean, p_nota text)
returns void language plpgsql security definer set search_path = public as $$
declare v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
begin
  if not exists (select 1 from beneficios_de_ticket(tid) x where x.beneficio_id = p_beneficio) then
    raise exception 'Este boleto no tiene ese beneficio.';
  end if;
  if v_nota is not null and char_length(v_nota) > 200 then raise exception 'La nota es de máximo 200 caracteres.'; end if;
  if p_entregado then
    if exists (select 1 from beneficios_de_ticket(tid) x where x.beneficio_id = p_beneficio and x.estado = 'por_pagar') then
      raise exception 'La orden de este boleto todavía no está pagada.';
    end if;
    insert into beneficio_entregas (ticket_id, beneficio_id, entregado_por, nota) values (tid, p_beneficio, auth.uid(), v_nota)
    on conflict (ticket_id, beneficio_id) do update set nota = coalesce(excluded.nota, beneficio_entregas.nota);
  else
    delete from beneficio_entregas where ticket_id = tid and beneficio_id = p_beneficio;
  end if;
  insert into audit_log (tabla, accion, registro_id, production_id, despues)
  values ('beneficio_entregas', case when p_entregado then 'entregar' else 'desmarcar' end, tid::text, pid,
          json_build_object('beneficio_id', p_beneficio, 'nota', v_nota)::jsonb);
end $$;
revoke all on function beneficio_marcar(uuid, text, uuid, boolean, text) from public, anon, authenticated;

drop function if exists beneficio_entregar(text, uuid, boolean);
create or replace function beneficio_entregar(p_token text, p_beneficio uuid, p_entregado boolean default true, p_nota text default null) returns json
language plpgsql security definer set search_path = public as $$
declare tid uuid; pid text;
begin
  select t.id, pf.production_id into tid, pid from tickets t join performances pf on pf.id = t.performance_id
  where t.qr_token::text = lower(btrim(coalesce(p_token, '')));
  if tid is null then raise exception 'Boleto no encontrado.'; end if;
  if not (is_staff() or has_perm(pid, 'puerta.validar')) then raise exception 'No autorizado'; end if;
  perform beneficio_marcar(tid, pid, p_beneficio, p_entregado, p_nota);
  return beneficios_qr(p_token);
end $$;
revoke all on function beneficio_entregar(text, uuid, boolean, text) from public, anon;
grant execute on function beneficio_entregar(text, uuid, boolean, text) to authenticated;

-- Desde la lista de Entregas del panel (sin escanear): puerta, ventas o quien configura la obra.
create or replace function beneficio_entregar_boleto(p_ticket uuid, p_beneficio uuid, p_entregado boolean default true, p_nota text default null) returns json
language plpgsql security definer set search_path = public as $$
declare pid text;
begin
  select pf.production_id into pid from tickets t join performances pf on pf.id = t.performance_id where t.id = p_ticket;
  if pid is null then raise exception 'Boleto no encontrado.'; end if;
  if not (is_staff() or has_perm(pid, 'puerta.validar') or has_perm(pid, 'ventas.operar') or has_perm(pid, 'funciones.gestionar')) then
    raise exception 'No autorizado';
  end if;
  perform beneficio_marcar(p_ticket, pid, p_beneficio, p_entregado, p_nota);
  return coalesce((select json_agg(row_to_json(x)) from beneficios_de_ticket(p_ticket) x), '[]'::json);
end $$;
revoke all on function beneficio_entregar_boleto(uuid, uuid, boolean, text) from public, anon;
grant execute on function beneficio_entregar_boleto(uuid, uuid, boolean, text) to authenticated;

-- ──────── Lista de entregas de una función (una fila por boleto y beneficio; solo órdenes pagadas) ────────
create or replace function beneficios_entregas(p_performance uuid)
returns table (ticket_id uuid, order_code text, comprador text, telefono text, lugar text, zona text,
               beneficio_id uuid, beneficio text, tipo text, entrega text, entrega_dias int,
               desde timestamptz, limite timestamptz, estado text, entregado_at timestamptz, entregado_por text, nota text)
language plpgsql stable security definer set search_path = public as $$
declare pid text;
begin
  select production_id into pid from performances where id = p_performance;
  if pid is null then return; end if;
  if not (is_staff() or has_perm(pid, 'ventas.ver') or has_perm(pid, 'puerta.validar') or has_perm(pid, 'funciones.gestionar')) then
    raise exception 'No autorizado';
  end if;
  return query
    select t.id, o.order_code, o.buyer_nombre, o.buyer_telefono, coalesce(s.seat_label, x.zona), x.zona,
           x.beneficio_id, x.nombre, x.tipo, x.entrega, x.entrega_dias, x.desde, x.limite, x.estado, x.entregado_at,
           (select pr.nombre from beneficio_entregas e join profiles pr on pr.id = e.entregado_por
             where e.ticket_id = t.id and e.beneficio_id = x.beneficio_id),
           x.nota
    from tickets t join orders o on o.id = t.order_id left join seats s on s.id = t.seat_id
    cross join lateral beneficios_de_ticket(t.id) x
    where t.performance_id = p_performance and t.is_active and o.status = 'aprobado' and x.estado <> 'sin_cupo'
    order by case x.estado when 'vencido' then 0 when 'hoy' then 1 when 'pendiente' then 2 else 3 end,
             x.limite, o.buyer_nombre, coalesce(s.seat_label, '');
end $$;
revoke all on function beneficios_entregas(uuid) from public, anon;
grant execute on function beneficios_entregas(uuid) to authenticated;

-- ──────── Pendientes de una obra (bandeja "Por hacer" y cierre de temporada) ────────
-- funcion: la función con la entrega más urgente (vencida primero, luego la que ya toca), para ir directo.
drop function if exists beneficios_pendientes(text);
create function beneficios_pendientes(pid text, out vencidos int, out hoy int, out pendientes int, out funcion uuid)
language plpgsql stable security definer set search_path = public as $$
begin
  vencidos := 0; hoy := 0; pendientes := 0;
  if not (is_staff() or has_perm(pid, 'ventas.ver') or has_perm(pid, 'puerta.validar') or has_perm(pid, 'funciones.gestionar')) then
    raise exception 'No autorizado';
  end if;
  if not exists (select 1 from zona_beneficios where production_id = pid and activo) then return; end if;
  select count(*) filter (where x.estado = 'vencido'), count(*) filter (where x.estado = 'hoy'),
         count(*) filter (where x.estado in ('vencido', 'hoy', 'pendiente')),
         (array_agg(p.id order by case x.estado when 'vencido' then 0 when 'hoy' then 1 else 2 end, x.limite)
            filter (where x.estado in ('vencido', 'hoy', 'pendiente')))[1]
    into vencidos, hoy, pendientes, funcion
  from performances p join tickets t on t.performance_id = p.id and t.is_active
  join orders o on o.id = t.order_id and o.status = 'aprobado'
  cross join lateral beneficios_de_ticket(t.id) x
  where p.production_id = pid and p.cancelada_at is null;
end $$;
revoke all on function beneficios_pendientes(text) from public, anon;
grant execute on function beneficios_pendientes(text) to authenticated;

-- ──────── Reporte por función: ahora también vencidos y pendientes ────────
drop function if exists beneficios_reporte(uuid);
create function beneficios_reporte(p_performance uuid)
returns table (beneficio_id uuid, nombre text, tipo text, cupo int, con_derecho int, entregados int, pendientes int, vencidos int,
               entrega text, entrega_dias int)
language plpgsql stable security definer set search_path = public as $$
declare pid text;
begin
  select production_id into pid from performances where id = p_performance;
  if pid is null then return; end if;
  if not (is_staff() or has_perm(pid, 'ventas.ver') or has_perm(pid, 'puerta.validar') or has_perm(pid, 'funciones.gestionar')) then
    raise exception 'No autorizado';
  end if;
  return query
    with x as (
      select b.beneficio_id, b.estado
      from tickets t join orders o on o.id = t.order_id and o.status = 'aprobado'
      cross join lateral beneficios_de_ticket(t.id) b
      where t.performance_id = p_performance and t.is_active
    )
    select zb.id, zb.nombre, zb.tipo, zb.cupo,
           (select count(*) from x where x.beneficio_id = zb.id and x.estado <> 'sin_cupo')::int,
           (select count(*) from beneficio_entregas e join tickets t on t.id = e.ticket_id
             where e.beneficio_id = zb.id and t.performance_id = p_performance)::int,
           (select count(*) from x where x.beneficio_id = zb.id and x.estado in ('vencido', 'hoy', 'pendiente'))::int,
           (select count(*) from x where x.beneficio_id = zb.id and x.estado = 'vencido')::int,
           zb.entrega, zb.entrega_dias
    from zona_beneficios zb
    where zb.production_id = pid and zb.activo and (zb.funciones is null or p_performance = any(zb.funciones))
    order by zb.orden, zb.created_at;
end $$;
revoke all on function beneficios_reporte(uuid) from public, anon;
grant execute on function beneficios_reporte(uuid) to authenticated;

-- WhatsApp y pantalla final: también el momento de entrega.
create or replace function orden_beneficios(p_order uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare pid text; dueno uuid;
begin
  select pf.production_id, o.buyer_user_id into pid, dueno from orders o join performances pf on pf.id = o.performance_id where o.id = p_order;
  if pid is null then return '[]'::json; end if;
  if not (coalesce(dueno = auth.uid(), false) or is_staff() or has_perm(pid, 'ventas.ver') or has_perm(pid, 'ventas.operar')) then
    raise exception 'No autorizado';
  end if;
  return coalesce((
    select json_agg(json_build_object('zona', z.zona, 'beneficios', z.bs) order by z.zona)
    from (
      select pc.nombre as zona,
             json_agg(json_build_object('tipo', zb.tipo, 'nombre', zb.nombre, 'minutos_antes', zb.minutos_antes, 'cupo', zb.cupo,
                                        'entrega', zb.entrega, 'entrega_dias', zb.entrega_dias)
                      order by zb.orden, zb.created_at) as bs
      from (select distinct coalesce(t.price_category_id, s.price_category_id) as zona
              from tickets t left join seats s on s.id = t.seat_id where t.order_id = p_order and t.is_active) tz
      join price_categories pc on pc.id = tz.zona
      join zona_beneficio_zonas zz on zz.price_category_id = tz.zona
      join zona_beneficios zb on zb.id = zz.beneficio_id and zb.activo
           and (zb.funciones is null or (select performance_id from orders where id = p_order) = any(zb.funciones))
      group by pc.nombre
    ) z), '[]'::json);
end $$;

commit;
