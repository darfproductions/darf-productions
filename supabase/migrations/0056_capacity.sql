-- 0056: la ocupación cuenta también la entrada general (pedido de Diego, 2026-10-12).
--   * performance_capacity(función) = asientos numerados activos de la obra + cupo de las zonas
--     de entrada general que tienen precio en esa función (el cupo de la función o el de la zona).
--   * season_summary agrega 'capacidad' por función y en total; director_capacity() da la
--     capacidad total de cada obra para el reporte general. Los cierres ya guardados no cambian;
--     la web usa asientos × funciones cuando un resumen viejo no trae capacidad.
-- Precede: 0055.

begin;

create or replace function performance_capacity(pfid uuid) returns int
language sql stable security definer set search_path = public as $$
  select (select count(*)::int from seats s join performances pf on pf.production_id = s.production_id where pf.id = pfid and s.is_active)
       + coalesce((select sum(coalesce(ppc.cupo, pc.cupo))::int from performance_price_categories ppc
                     join price_categories pc on pc.id = ppc.price_category_id
                    where ppc.performance_id = pfid and pc.cupo is not null and pc.is_active), 0)
$$;

create or replace function season_summary(pid text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  if not (has_perm(pid, 'obra.publicar') or has_perm(pid, 'reportes.ver')) then raise exception 'No autorizado'; end if;
  with f as (
    select pf.id, pf.starts_at,
           (select coalesce(sum(o.total), 0) from orders o where o.performance_id = pf.id and o.status = 'aprobado') as ingresos,
           (select count(*) from tickets t join orders o on o.id = t.order_id
             where o.performance_id = pf.id and o.status = 'aprobado' and t.is_active) as boletos,
           (select count(*) from tickets t join orders o on o.id = t.order_id
             where o.performance_id = pf.id and o.status = 'aprobado' and t.is_active and t.checked_in_at is not null) as asistieron,
           performance_capacity(pf.id) as capacidad
      from performances pf
     where pf.production_id = pid
  ), o as (
    select count(*) filter (where o.status = 'aprobado') as ordenes,
           count(*) filter (where o.status = 'pendiente') as pendientes,
           coalesce(sum(o.total) filter (where o.status = 'aprobado'), 0) as ingresos,
           coalesce(sum(o.discount_amount) filter (where o.status = 'aprobado'), 0) as descuentos,
           count(*) filter (where o.status = 'aprobado' and o.created_by_staff_id is not null) as taquilla
      from orders o join performances pf on pf.id = o.performance_id where pf.production_id = pid
  )
  select jsonb_build_object(
    'obra', (select nombre from productions where id = pid),
    'generado_at', now(),
    'asientos', (select count(*) from seats where production_id = pid and is_active),
    'capacidad', (select coalesce(sum(capacidad), 0) from f),
    'funciones', coalesce((select jsonb_agg(jsonb_build_object('starts_at', starts_at, 'boletos', boletos, 'asistieron', asistieron, 'ingresos', ingresos, 'capacidad', capacidad) order by starts_at) from f), '[]'),
    'ventas', (select jsonb_build_object('ordenes', ordenes, 'pendientes', pendientes, 'ingresos', ingresos, 'descuentos', descuentos, 'ordenes_taquilla', taquilla,
                                         'boletos', (select coalesce(sum(boletos), 0) from f), 'asistieron', (select coalesce(sum(asistieron), 0) from f)) from o),
    'vendedores', coalesce((select jsonb_agg(x order by (x->>'monto')::numeric desc) from (
        select jsonb_build_object('nombre', coalesce((select nullif(btrim(pr.nombre), '') from profiles pr where pr.id = s.user_id), s.nombre),
                                  'codigo', s.codigo, 'ordenes', count(*), 'monto', sum(o.total)) as x
          from orders o join performances pf on pf.id = o.performance_id join sellers s on s.id = o.seller_id
         where pf.production_id = pid and o.status = 'aprobado'
         group by s.id) v), '[]'),
    'taller', jsonb_build_object(
        'cobrado', (select coalesce(sum(monto), 0) from member_payments where production_id = pid),
        'integrantes', (select count(*) from production_members where production_id = pid and role_id = 'integrante'),
        'activos', (select count(*) from production_members m where m.production_id = pid and m.role_id = 'integrante' and is_active_member(pid, m.user_id))),
    'ensayos', jsonb_build_object(
        'programados', (select count(*) from rehearsals where production_id = pid and estado = 'programado'),
        'presentes', (select count(*) from rehearsal_attendance a join rehearsals r on r.id = a.rehearsal_id where r.production_id = pid and a.estado in ('presente', 'retardo')),
        'faltas', (select count(*) from rehearsal_attendance a join rehearsals r on r.id = a.rehearsal_id where r.production_id = pid and a.estado = 'falta')),
    'elenco', coalesce((select jsonb_object_agg(tipo, n) from (select tipo, count(*) as n from production_credits where production_id = pid and activo group by tipo) c), '{}'),
    'audiciones', jsonb_build_object(
        'convocatorias', (select count(*) from auditions where production_id = pid),
        'solicitudes', (select count(*) from audition_applications a join auditions au on au.id = a.audition_id where au.production_id = pid))
  ) into out;
  return out;
end $$;

-- Capacidad total por obra (suma de sus funciones), para el reporte general. Solo el Director.
create or replace function director_capacity()
returns table (production_id text, capacidad int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo el Director.'; end if;
  return query
    select p.id, (select coalesce(sum(performance_capacity(f.id)), 0)::int from performances f where f.production_id = p.id)
      from productions p;
end $$;

revoke execute on function performance_capacity(uuid) from public;
grant execute on function performance_capacity(uuid) to anon, authenticated;
revoke execute on function director_capacity() from public, anon;
grant execute on function director_capacity() to authenticated;

commit;
