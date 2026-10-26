-- 0130 (Diego 2026-10-26): beneficios "uno por compra".
--   * Un beneficio se puede marcar como uno por compra: el póster firmado de VIP le toca una vez a cada orden, aunque
--     la orden traiga 10 boletos VIP. Dos órdenes de la misma persona = dos pósters.
--   * Lo lleva el primer boleto de la orden en una zona con ese beneficio (si se cancela, pasa al siguiente). Los
--     demás boletos de la orden lo muestran como "va con el boleto X" (estado otro_boleto) y no se pueden marcar.
--   * Con cupo ("los primeros 20"), en uno por compra se cuentan órdenes, no boletos.
-- Precede: 0129.

begin;

alter table zona_beneficios add column if not exists por_compra boolean not null default false;

-- ──────── Beneficios de un boleto (interna; reemplaza 0125) ────────
-- estado: entregado | otro_boleto | por_pagar | sin_cupo | vencido | hoy | pendiente.
drop function if exists beneficios_de_ticket(uuid);
create function beneficios_de_ticket(p_ticket uuid)
returns table (beneficio_id uuid, tipo text, nombre text, detalle text, minutos_antes int, cupo int,
               alcanza boolean, entregado_at timestamptz, zona text,
               entrega text, entrega_dias int, desde timestamptz, limite timestamptz, nota text, estado text,
               por_compra boolean, con_boleto text)
language sql stable security definer set search_path = public as $$
  with b as (
    select t.id as tid, t.order_id as oid, t.performance_id as pf, t.created_at as t_at, o.status,
           coalesce(o.approved_at, o.created_at) as pagado,
           coalesce(t.price_category_id, s.price_category_id) as zona, p.starts_at
    from tickets t join orders o on o.id = t.order_id left join seats s on s.id = t.seat_id
         join performances p on p.id = t.performance_id
    where t.id = p_ticket and t.is_active
  ), x as (
    select zb.id, zb.tipo, zb.nombre, zb.detalle, zb.minutos_antes, zb.cupo, zb.orden, zb.created_at, zb.por_compra,
           -- Uno por compra: el boleto de la orden que lo lleva (el primero en una zona con este beneficio).
           case when zb.por_compra then (
             select t3.id from tickets t3 left join seats s3 on s3.id = t3.seat_id
              where t3.order_id = b.oid and t3.is_active
                and coalesce(t3.price_category_id, s3.price_category_id) in
                    (select z3.price_category_id from zona_beneficio_zonas z3 where z3.beneficio_id = zb.id)
              order by t3.created_at, t3.id limit 1) end as primero,
           case when zb.cupo is null then (case when b.status = 'aprobado' then true else null end)
                when b.status <> 'aprobado' then null
                when zb.por_compra then
                  (select count(distinct o2.id) from tickets t2 join orders o2 on o2.id = t2.order_id left join seats s2 on s2.id = t2.seat_id
                    where t2.performance_id = b.pf and t2.is_active and o2.status = 'aprobado'
                      and coalesce(t2.price_category_id, s2.price_category_id) in
                          (select z2.price_category_id from zona_beneficio_zonas z2 where z2.beneficio_id = zb.id)
                      and (coalesce(o2.approved_at, o2.created_at), o2.id) < (b.pagado, b.oid)) < zb.cupo
                else (select count(*) from tickets t2 join orders o2 on o2.id = t2.order_id left join seats s2 on s2.id = t2.seat_id
                       where t2.performance_id = b.pf and t2.is_active and o2.status = 'aprobado'
                         and coalesce(t2.price_category_id, s2.price_category_id) in
                             (select z2.price_category_id from zona_beneficio_zonas z2 where z2.beneficio_id = zb.id)
                         and (coalesce(o2.approved_at, o2.created_at), t2.created_at, t2.id) < (b.pagado, b.t_at, b.tid)) < zb.cupo
           end as alcanza,
           e.entregado_at, pc.nombre as zona, zb.entrega, zb.entrega_dias, l.desde, l.limite, e.nota, b.tid
    from b
    join zona_beneficio_zonas z on z.price_category_id = b.zona
    join zona_beneficios zb on zb.id = z.beneficio_id and zb.activo and (zb.funciones is null or b.pf = any(zb.funciones))
    join price_categories pc on pc.id = b.zona
    cross join lateral beneficio_limite(b.starts_at, zb.entrega, zb.entrega_dias) l
    left join beneficio_entregas e on e.ticket_id = b.tid and e.beneficio_id = zb.id
  )
  select id, tipo, nombre, detalle, minutos_antes, cupo,
         case when primero is not null and primero <> tid then false when cupo is null then true else alcanza end,
         entregado_at, zona, entrega, entrega_dias, desde, limite, nota,
         case when entregado_at is not null then 'entregado'
              when primero is not null and primero <> tid then 'otro_boleto'
              when alcanza is null then 'por_pagar'
              when not alcanza then 'sin_cupo'
              when now() >= limite then 'vencido'
              when now() >= desde then 'hoy'
              else 'pendiente' end,
         por_compra,
         case when primero is not null and primero <> tid then
           (select coalesce(s4.seat_label, pc4.nombre) from tickets t4 left join seats s4 on s4.id = t4.seat_id
              left join price_categories pc4 on pc4.id = t4.price_category_id where t4.id = primero) end
  from x
  order by orden, created_at
$$;
revoke all on function beneficios_de_ticket(uuid) from public, anon, authenticated;

-- No se marca en un boleto que no lo lleva (uno por compra: va con otro boleto de la orden).
create or replace function beneficio_marcar(tid uuid, pid text, p_beneficio uuid, p_entregado boolean, p_nota text)
returns void language plpgsql security definer set search_path = public as $$
declare v_nota text := nullif(btrim(coalesce(p_nota, '')), ''); otro text;
begin
  if not exists (select 1 from beneficios_de_ticket(tid) x where x.beneficio_id = p_beneficio) then
    raise exception 'Este boleto no tiene ese beneficio.';
  end if;
  if v_nota is not null and char_length(v_nota) > 200 then raise exception 'La nota es de máximo 200 caracteres.'; end if;
  if p_entregado then
    if exists (select 1 from beneficios_de_ticket(tid) x where x.beneficio_id = p_beneficio and x.estado = 'por_pagar') then
      raise exception 'La orden de este boleto todavía no está pagada.';
    end if;
    select x.con_boleto into otro from beneficios_de_ticket(tid) x where x.beneficio_id = p_beneficio and x.estado = 'otro_boleto';
    if found then
      raise exception 'Es uno por compra: va con el boleto %.', coalesce(otro, 'principal de la orden');
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

-- Lista de entregas: una fila por orden en los de uno por compra (sin los boletos que no lo llevan).
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
    where t.performance_id = p_performance and t.is_active and o.status = 'aprobado' and x.estado not in ('sin_cupo', 'otro_boleto')
    order by case x.estado when 'vencido' then 0 when 'hoy' then 1 when 'pendiente' then 2 else 3 end,
             x.limite, o.buyer_nombre, coalesce(s.seat_label, '');
end $$;

-- Reporte: "con derecho" cuenta órdenes en los de uno por compra.
create or replace function beneficios_reporte(p_performance uuid)
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
           (select count(*) from x where x.beneficio_id = zb.id and x.estado not in ('sin_cupo', 'otro_boleto'))::int,
           (select count(*) from beneficio_entregas e join tickets t on t.id = e.ticket_id
             where e.beneficio_id = zb.id and t.performance_id = p_performance)::int,
           (select count(*) from x where x.beneficio_id = zb.id and x.estado in ('vencido', 'hoy', 'pendiente'))::int,
           (select count(*) from x where x.beneficio_id = zb.id and x.estado = 'vencido')::int,
           zb.entrega, zb.entrega_dias
    from zona_beneficios zb
    where zb.production_id = pid and zb.activo and (zb.funciones is null or p_performance = any(zb.funciones))
    order by zb.orden, zb.created_at;
end $$;

-- Resumen de la orden (WhatsApp): también si es uno por compra (igual que 0128, más 'por_compra').
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
             json_agg(json_build_object('tipo', zb.tipo, 'nombre', zb.nombre, 'detalle', zb.detalle, 'minutos_antes', zb.minutos_antes, 'cupo', zb.cupo,
                                        'entrega', zb.entrega, 'entrega_dias', zb.entrega_dias, 'por_compra', zb.por_compra)
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
