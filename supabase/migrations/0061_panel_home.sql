-- 0061: inicio del panel "Tu día" (Bloque 2, plan del 2026-10-12).
--   Una sola lectura con lo que necesita atención en MIS obras, según mis permisos en cada una:
--   * pendientes: solicitudes de audición sin revisar, ofertas de papel sin respuesta,
--     documentos subidos por recibir, advertencias de la semana y periodos de evaluación
--     terminados sin publicar;
--   * funciones y ensayos de los próximos 7 días;
--   * cambios recientes de la bitácora (solo quien maneja permisos de la obra, o el Director),
--     con el nombre de quien hizo el cambio.
--   Solo lee: no cambia datos ni permisos.
-- Precede: 0060.

begin;

create or replace function panel_home() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  if auth.uid() is null then raise exception 'No autorizado'; end if;
  with mias as (
    select distinct a.production_id as pid from my_panel_access() a
      join productions p on p.id = a.production_id
     where p.estado <> 'archivada'
  ),
  pend as (
    select 'solicitudes' as tipo, a.production_id as pid, count(*) as n
      from audition_applications ap join auditions a on a.id = ap.audition_id
     where ap.estado = 'inscrito' and a.estado = 'abierta'
       and a.production_id in (select pid from mias) and has_perm(a.production_id, 'audiciones.gestionar')
     group by a.production_id
    union all
    select 'solicitudes', null, count(*)
      from audition_applications ap join auditions a on a.id = ap.audition_id
     where ap.estado = 'inscrito' and a.estado = 'abierta' and a.production_id is null and is_admin()
    having count(*) > 0
    union all
    select 'ofertas', o.production_id, count(*) from casting_offers o
     where o.estado = 'enviada' and o.production_id in (select pid from mias) and has_perm(o.production_id, 'elenco.gestionar')
     group by o.production_id
    union all
    select 'documentos', d.production_id, count(*) from member_docs d
     where d.subido_at is not null and d.entregado_at is null
       and d.production_id in (select pid from mias) and has_perm(d.production_id, 'expedientes.ver')
     group by d.production_id
    union all
    select 'advertencias', i.production_id, count(*) from member_incidents i
     where i.nivel in ('advertencia', 'grave') and i.anulada_at is null and i.created_at > now() - interval '7 days'
       and i.production_id in (select pid from mias) and has_perm(i.production_id, 'expedientes.ver')
     group by i.production_id
    union all
    select 'evaluaciones', r.production_id, count(*) from rubric_periods r
     where r.publicado_at is null and r.hasta is not null and r.hasta < current_date and rubric_active(r.production_id)
       and r.production_id in (select pid from mias) and has_perm(r.production_id, 'rubrica.gestionar')
     group by r.production_id
  )
  select jsonb_build_object(
    'pendientes', coalesce((select jsonb_agg(jsonb_build_object('tipo', tipo, 'production_id', pid, 'n', n)) from pend), '[]'),
    'funciones', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'production_id', f.production_id, 'starts_at', f.starts_at, 'venue', f.venue) order by f.starts_at)
        from performances f
       where f.production_id in (select pid from mias) and f.starts_at between now() - interval '3 hours' and now() + interval '7 days'), '[]'),
    'ensayos', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'production_id', r.production_id, 'titulo', r.titulo, 'inicia', r.inicia, 'lugar', r.lugar) order by r.inicia)
        from rehearsals r
       where r.production_id in (select pid from mias) and r.estado = 'programado' and has_perm(r.production_id, 'ensayos.gestionar')
         and r.inicia between now() - interval '3 hours' and now() + interval '7 days'), '[]'),
    'cambios', coalesce((select jsonb_agg(x order by x->>'at' desc) from (
        select jsonb_build_object('id', l.id, 'at', l.at, 'actor', l.actor, 'tabla', l.tabla, 'accion', l.accion,
                 'registro_id', l.registro_id, 'production_id', l.production_id, 'antes', l.antes, 'despues', l.despues,
                 'actor_nombre', coalesce(nullif(btrim(pr.nombre), ''), 'Alguien'),
                 'persona_nombre', (select nullif(btrim(p2.nombre), '') from profiles p2
                                     where p2.id::text = coalesce(l.despues->>'user_id', l.antes->>'user_id'))) as x
          from audit_log l left join profiles pr on pr.id = l.actor
         where l.production_id in (select pid from mias)
           and (is_admin() or has_perm(l.production_id, 'permisos.gestionar'))
           and l.at > now() - interval '14 days'
         order by l.at desc
         limit 8) s), '[]')
  ) into out;
  return out;
end $$;

revoke execute on function panel_home() from public, anon;
grant execute on function panel_home() to authenticated;

commit;
