-- 0108: pendientes del elenco "No publicado" (0107).
--   1. Aviso en la bandeja "Por hacer" del panel (y en "Listo para vender"): personas de Reparto o Ensamble
--      sin publicar en obras vivas, para quien arma el elenco.
--   2. Vista previa: los retratos del perfil profesional también salen para quien edita la obra, aunque la
--      persona aún no esté publicada. El público sigue viendo solo lo publicado.
--   3. Bitácora: queda registrado quién publicó o despublicó a quién (con nombre y papel).

-- ──────── 1. Bandeja "Por hacer" ────────
create or replace function panel_pendientes()
 RETURNS TABLE(tipo text, production_id text, ref_id text, ref_titulo text, n integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare gestiona_aud boolean;
begin
  if auth.uid() is null then raise exception 'No autorizado'; end if;
  gestiona_aud := has_casa('casa.audiciones') or exists (select 1 from my_panel_access() a where a.permission_id = 'audiciones.gestionar');
  return query
  with mias as (
    select distinct a.production_id as pid from my_panel_access() a
      join productions p on p.id = a.production_id
     where p.estado <> 'archivada'
  )
  -- Solicitudes de audición: una fila por convocatoria (obra, general, registro permanente o equipo propio).
  select 'solicitudes'::text, a.production_id, a.id::text, a.titulo, count(*)::int
    from audition_applications ap join auditions a on a.id = ap.audition_id
   where ap.estado = 'inscrito' and a.estado in ('abierta', 'cerrada')
     and ((a.production_id in (select pid from mias) and has_perm(a.production_id, 'audiciones.gestionar'))
          or (a.production_id is null and not coalesce(a.permanente, false) and has_casa('casa.audiciones'))
          or (coalesce(a.permanente, false) and gestiona_aud)
          or audition_member_perm(a.id, 'audiciones.gestionar'))
   group by a.production_id, a.id, a.titulo
  union all
  select 'ofertas', o.production_id, null, null, count(*)::int from casting_offers o
   where o.estado = 'enviada' and o.production_id in (select pid from mias) and has_perm(o.production_id, 'elenco.gestionar')
   group by o.production_id
  union all
  select 'documentos', d.production_id, null, null, count(*)::int from member_docs d
   where d.subido_at is not null and d.entregado_at is null
     and d.production_id in (select pid from mias) and has_perm(d.production_id, 'expedientes.ver')
   group by d.production_id
  union all
  select 'advertencias', i.production_id, null, null, count(*)::int from member_incidents i
   where i.nivel in ('advertencia', 'grave') and i.anulada_at is null and i.created_at > now() - interval '7 days'
     and i.production_id in (select pid from mias) and has_perm(i.production_id, 'expedientes.ver')
   group by i.production_id
  union all
  -- Personas en el límite de advertencias sin medida tomada (y sin baja).
  select 'decision', m.pid, null, null, (
      select count(*)::int from discipline_summary(m.pid) d
       where d.requiere_decision
         and not exists (select 1 from member_enrollment e where e.production_id = m.pid and e.user_id = d.user_id and e.baja_at is not null))
    from mias m
   where has_perm(m.pid, 'expedientes.ver') and (can_manage_discipline(m.pid) or has_perm(m.pid, 'mensualidades.gestionar'))
  union all
  select 'evaluaciones', r.production_id, null, null, count(*)::int from rubric_periods r
   where r.publicado_at is null and r.hasta is not null and r.hasta < hoy_mx() and rubric_active(r.production_id)
     and r.production_id in (select pid from mias) and rubric_puede_publicar(r.production_id)
   group by r.production_id
  union all
  -- 0101: entregas de calificaciones por revisar (coordinación y Dirección general).
  select 'entregas', r.production_id, null, null, count(*)::int
    from rubric_entregas en join rubric_periods r on r.id = en.period_id
   where en.estado = 'entregada' and r.publicado_at is null and rubric_active(r.production_id)
     and r.production_id in (select pid from mias) and (rubric_coord(r.production_id) or rubric_puede_publicar(r.production_id))
   group by r.production_id
  union all
  select 'solicitudes_elenco', q.production_id, null, null, count(*)::int from member_requests q
   where q.estado = 'pendiente' and q.production_id in (select pid from mias) and can_review_request(q.production_id, q.tipo)
   group by q.production_id
  union all
  -- Pagos de eventos por revisar (de la obra o del equipo propio del evento).
  select 'pagos_evento', e.production_id, e.id::text, evento_nombre(e), count(*)::int
    from evento_ordenes o join fan_encuentros e on e.id = o.encuentro_id
   where o.status = 'pendiente' and evento_puede_fila(e.id, e.production_id, 'cobros')
   group by e.production_id, e.id
  union all
  select 'notas_equipo', u.production_id, null, null, u.notas::int from my_team_unread() u where u.notas > 0
  union all
  -- 0100: propuestas de calificación de asistentes artísticos por aprobar (para quien califica esa materia).
  select 'propuestas', e.production_id, null, null, count(*)::int
    from rubric_proposals q join rubric_evaluations e on e.id = q.evaluation_id
   where q.estado = 'pendiente' and e.production_id in (select pid from mias) and rubric_can_grade(e.production_id, q.criterion_id)
   group by e.production_id
  union all
  -- 0108: Reparto y Ensamble que siguen sin publicar en obras vivas (para quien arma el elenco).
  select 'elenco_sin_publicar', c.production_id, null, null, count(*)::int
    from production_credits c join productions p on p.id = c.production_id
   where not c.publicado and c.activo and c.tipo in ('reparto', 'ensamble')
     and p.estado in ('borrador', 'publicada') and not coalesce(p.concluded, false)
     and c.production_id in (select pid from mias)
     and (has_perm(c.production_id, 'elenco.gestionar') or has_perm(c.production_id, 'obra.editar'))
   group by c.production_id
  union all
  select 'avisos_equipo', u.production_id, null, null, u.avisos::int from my_team_unread() u where u.avisos > 0;
end $function$;

-- ──────── 2. Retratos en la vista previa ────────
create or replace function production_pro_info(pid text)
returns table (person_id uuid, retrato_path text, slug text)
language sql stable security definer set search_path = public as $$
  select distinct c.person_id,
         case when pro_is_public(c.person_id) then p.retrato_path end,
         case when pro_is_public(c.person_id) then p.slug end
    from production_credits c join pro_profiles p on p.person_id = c.person_id
   where c.production_id = pid
     and ((c.publicado and production_is_visible(pid))
          or has_perm(pid, 'obra.editar') or has_perm(pid, 'elenco.gestionar'))
$$;

-- ──────── 3. Bitácora al publicar o despublicar ────────
create or replace function credito_publicado_bitacora() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (tabla, accion, registro_id, production_id, despues)
  values ('production_credits', case when new.publicado then 'publicar' else 'despublicar' end, new.id::text, new.production_id,
          jsonb_build_object('persona', (select nombre from people where id = new.person_id), 'papel', new.papel, 'tipo', new.tipo));
  return null;
end $$;

drop trigger if exists credito_publicado_bitacora on production_credits;
create trigger credito_publicado_bitacora after update of publicado on production_credits
  for each row when (old.publicado is distinct from new.publicado) execute function credito_publicado_bitacora();
