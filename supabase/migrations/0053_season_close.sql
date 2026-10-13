-- 0053: reporte general del Director y cierre de temporada (plan, punto 3; 2026-10-12).
--   * director_overview(): una fila por obra con ventas, ocupación, asistencia, talleres,
--     elenco y audiciones. director_sellers(): vendedores de todas las obras. Solo el Director.
--   * season_summary(obra): resumen de la temporada (también como vista previa del cierre).
--   * season_close(obra, notas, dar_baja): quien tiene obra.publicar cierra la temporada:
--       - no deja cerrar con órdenes por aprobar;
--       - quita de venta todas las funciones;
--       - guarda el resumen congelado en season_closures (con notas);
--       - archiva la obra (estado 'archivada' ⇔ concluded, 0029);
--       - si dar_baja: baja de los integrantes activos con motivo "Fin de temporada"
--         (pierden materiales y comunicados) SIN quitarlos de los créditos: el elenco
--         queda congelado en la página de archivo.
--   * season_reopen(obra): solo el Director; vuelve a 'publicada'. No reactiva ventas ni
--     integrantes (eso se hace a mano si hace falta).
-- Precede: 0052.

begin;

create table season_closures (
  id uuid primary key default gen_random_uuid(),
  production_id text not null references productions(id) on delete cascade,
  cerrado_at timestamptz not null default now(),
  cerrado_por uuid references auth.users(id) on delete set null default auth.uid(),
  notas text check (length(notas) <= 4000),
  bajas int not null default 0,
  resumen jsonb not null,
  reabierto_at timestamptz,
  reabierto_por uuid references auth.users(id) on delete set null
);
create index idx_season_closures_prod on season_closures(production_id, cerrado_at desc);

alter table season_closures enable row level security;
create policy season_closures_team on season_closures for select to authenticated
  using (has_perm(production_id, 'obra.publicar') or has_perm(production_id, 'reportes.ver'));
revoke all on season_closures from anon;

-- ──────── Resumen de una obra ────────
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
             where o.performance_id = pf.id and o.status = 'aprobado' and t.is_active and t.checked_in_at is not null) as asistieron
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
    'funciones', coalesce((select jsonb_agg(jsonb_build_object('starts_at', starts_at, 'boletos', boletos, 'asistieron', asistieron, 'ingresos', ingresos) order by starts_at) from f), '[]'),
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

-- ──────── Cerrar y reabrir ────────
create or replace function season_close(pid text, notas_ text, dar_baja boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare n int; bajas_ int := 0; cid uuid;
begin
  if not has_perm(pid, 'obra.publicar') then raise exception 'No autorizado'; end if;
  if (select estado from productions where id = pid) = 'archivada' then raise exception 'La temporada ya está cerrada.'; end if;
  select count(*) into n from orders o join performances pf on pf.id = o.performance_id
   where pf.production_id = pid and o.status = 'pendiente';
  if n > 0 then raise exception 'Hay % órdenes por aprobar. Apruébalas o recházalas antes de cerrar.', n; end if;

  update performances set on_sale = false where production_id = pid and on_sale;

  if dar_baja then
    insert into member_enrollment (production_id, user_id, ingreso)
    select m.production_id, m.user_id, current_date from production_members m
     where m.production_id = pid and m.role_id = 'integrante'
    on conflict (production_id, user_id) do nothing;
    update member_enrollment set baja_at = greatest(current_date, ingreso), baja_motivo = 'Fin de temporada', baja_por = auth.uid()
     where production_id = pid and (baja_at is null or baja_at > current_date);
    get diagnostics bajas_ = row_count;
  end if;

  insert into season_closures (production_id, notas, bajas, resumen)
  values (pid, nullif(btrim(coalesce(notas_, '')), ''), bajas_, season_summary(pid))
  returning id into cid;

  update productions set estado = 'archivada' where id = pid;
  return cid;
end $$;

create or replace function season_reopen(pid text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo el Director puede reabrir una temporada.'; end if;
  update productions set estado = 'publicada' where id = pid and estado = 'archivada';
  if not found then raise exception 'La obra no está archivada.'; end if;
  update season_closures set reabierto_at = now(), reabierto_por = auth.uid()
   where id = (select id from season_closures where production_id = pid order by cerrado_at desc limit 1);
end $$;

-- ──────── Reporte general (Director) ────────
create or replace function director_overview()
returns table (production_id text, nombre text, estado text, funciones int, funciones_futuras int, asientos int,
               boletos int, asistieron int, ingresos numeric, pendientes int, cobrado_taller numeric,
               integrantes_activos int, solicitudes int, cerrado_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo el Director.'; end if;
  return query
    select p.id, p.nombre, p.estado,
           (select count(*)::int from performances f where f.production_id = p.id),
           (select count(*)::int from performances f where f.production_id = p.id and f.starts_at > now()),
           (select count(*)::int from seats s where s.production_id = p.id and s.is_active),
           (select count(*)::int from tickets t join orders o on o.id = t.order_id join performances f on f.id = o.performance_id
             where f.production_id = p.id and o.status = 'aprobado' and t.is_active),
           (select count(*)::int from tickets t join orders o on o.id = t.order_id join performances f on f.id = o.performance_id
             where f.production_id = p.id and o.status = 'aprobado' and t.is_active and t.checked_in_at is not null),
           (select coalesce(sum(o.total), 0) from orders o join performances f on f.id = o.performance_id
             where f.production_id = p.id and o.status = 'aprobado'),
           (select count(*)::int from orders o join performances f on f.id = o.performance_id
             where f.production_id = p.id and o.status = 'pendiente'),
           (select coalesce(sum(mp.monto), 0) from member_payments mp where mp.production_id = p.id),
           (select count(*)::int from production_members m where m.production_id = p.id and m.role_id = 'integrante' and is_active_member(p.id, m.user_id)),
           (select count(*)::int from audition_applications a join auditions au on au.id = a.audition_id where au.production_id = p.id),
           (select max(c.cerrado_at) from season_closures c where c.production_id = p.id and c.reabierto_at is null)
      from productions p
     order by p.created_at desc;
end $$;

create or replace function director_sellers()
returns table (nombre text, codigo text, tipo text, obras int, ordenes int, monto numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo el Director.'; end if;
  return query
    select coalesce((select nullif(btrim(pr.nombre), '') from profiles pr where pr.id = s.user_id), s.nombre),
           s.codigo, case when s.user_id is null then 'externo' else 'cuenta' end,
           count(distinct f.production_id)::int, count(*)::int, sum(o.total)
      from orders o join performances f on f.id = o.performance_id join sellers s on s.id = o.seller_id
     where o.status = 'aprobado'
     group by s.id
     order by sum(o.total) desc
     limit 50;
end $$;

revoke execute on function season_summary(text) from public, anon;
revoke execute on function season_close(text, text, boolean) from public, anon;
revoke execute on function season_reopen(text) from public, anon;
revoke execute on function director_overview() from public, anon;
revoke execute on function director_sellers() from public, anon;
grant execute on function season_summary(text), season_close(text, text, boolean), season_reopen(text),
  director_overview(), director_sellers() to authenticated;

create trigger audit_season_closures after insert or update or delete on season_closures for each row execute function audit_row();

commit;
