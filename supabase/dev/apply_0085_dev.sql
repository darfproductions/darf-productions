-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV".
-- 0085: panel más fácil (bandeja Por hacer, Inicio con eventos, buscador). Requiere 0084.
-- Si la base no es DEV, aborta. Se corre completa en Supabase → SQL Editor.
begin;
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
end $$;


create or replace function sin_acentos(t text) returns text language sql immutable as $$
  select translate(lower(coalesce(t, '')), 'áéíóúüñàèìòù', 'aeiouunaeiou')
$$;

create or replace function coincide(texto text, busqueda text) returns boolean language sql immutable as $$
  select not exists (select 1 from unnest(string_to_array(sin_acentos(busqueda), ' ')) w
                      where w <> '' and position(w in sin_acentos(texto)) = 0)
$$;

create or replace function panel_pendientes()
returns table (tipo text, production_id text, ref_id text, ref_titulo text, n int)
language plpgsql stable security definer set search_path = public as $$
declare gestiona_aud boolean;
begin
  if auth.uid() is null then raise exception 'No autorizado'; end if;
  gestiona_aud := is_admin() or exists (select 1 from my_panel_access() a where a.permission_id = 'audiciones.gestionar');
  return query
  with mias as (
    select distinct a.production_id as pid from my_panel_access() a
      join productions p on p.id = a.production_id
     where p.estado <> 'archivada'
  )
  -- Solicitudes de audición: una fila por convocatoria (obra, general, registro permanente o equipo propio).
  select 'solicitudes'::text, a.production_id, a.id::text, a.titulo, count(*)::int
    from audition_applications ap join auditions a on a.id = ap.audition_id
   where ap.estado = 'inscrito' and a.estado = 'abierta'
     and ((a.production_id in (select pid from mias) and has_perm(a.production_id, 'audiciones.gestionar'))
          or (a.production_id is null and not coalesce(a.permanente, false) and is_admin())
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
   where r.publicado_at is null and r.hasta is not null and r.hasta < current_date and rubric_active(r.production_id)
     and r.production_id in (select pid from mias) and has_perm(r.production_id, 'rubrica.gestionar')
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
  select 'avisos_equipo', u.production_id, null, null, u.avisos::int from my_team_unread() u where u.avisos > 0;
end $$;
revoke execute on function panel_pendientes() from public, anon;
grant execute on function panel_pendientes() to authenticated;

create or replace function panel_home() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  if auth.uid() is null then raise exception 'No autorizado'; end if;
  with mias as (
    select distinct a.production_id as pid from my_panel_access() a
      join productions p on p.id = a.production_id
     where p.estado <> 'archivada'
  )
  select jsonb_build_object(
    'pendientes', coalesce((select jsonb_agg(jsonb_build_object('tipo', x.tipo, 'production_id', x.production_id, 'ref_id', x.ref_id, 'ref_titulo', x.ref_titulo, 'n', x.n))
        from panel_pendientes() x where x.n > 0), '[]'),
    'funciones', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'production_id', f.production_id, 'starts_at', f.starts_at, 'venue', f.venue) order by f.starts_at)
        from performances f
       where f.production_id in (select pid from mias) and f.starts_at between now() - interval '3 hours' and now() + interval '7 days'), '[]'),
    'ensayos', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'production_id', r.production_id, 'titulo', r.titulo, 'inicia', r.inicia, 'lugar', r.lugar) order by r.inicia)
        from rehearsals r
       where r.production_id in (select pid from mias) and r.estado = 'programado' and has_perm(r.production_id, 'ensayos.gestionar')
         and r.inicia between now() - interval '3 hours' and now() + interval '7 days'), '[]'),
    'juntas', coalesce((select jsonb_agg(jsonb_build_object('id', j.id, 'production_id', j.production_id, 'titulo', j.titulo, 'tipo', j.tipo, 'inicia', j.inicia, 'lugar', j.lugar) order by j.inicia)
        from team_meetings j
       where j.estado = 'programada' and j.inicia between now() - interval '3 hours' and now() + interval '7 days'
         and (team_audience_includes(j.production_id, auth.uid(), j.audiencia, j.roles, j.personas) or team_can_manage(j.production_id))), '[]'),
    -- Eventos (0081/0084) que me toca operar: en la puerta, cobrando u organizando.
    'eventos', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'production_id', e.production_id, 'titulo', evento_nombre(e), 'tipo', e.tipo,
                 'inicia', evento_cuando(e), 'lugar', coalesce(e.lugar, pf.venue),
                 'puerta', evento_puede_fila(e.id, e.production_id, 'puerta'), 'cobros', evento_puede_fila(e.id, e.production_id, 'cobros')) order by evento_cuando(e))
        from fan_encuentros e left join performances pf on pf.id = e.performance_id
       where evento_cuando(e) between now() - interval '3 hours' and now() + interval '7 days'
         and evento_puede_fila(e.id, e.production_id, 'ver')), '[]'),
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

create or replace function panel_buscar(q text)
returns table (tipo text, titulo text, detalle text, href text)
language plpgsql stable security definer set search_path = public as $$
declare t text := sin_acentos(btrim(coalesce(q, ''))); cod text := upper(btrim(coalesce(q, '')));
begin
  if auth.uid() is null then raise exception 'No autorizado'; end if;
  if char_length(t) < 2 then return; end if;
  return query
  (
    -- Órdenes de boletos por código (DARF-XXXXXX): quien ve las ventas de esa obra.
    select 'orden'::text, o.order_code, coalesce(o.buyer_nombre, '') || ' · ' || pr.nombre || ' · ' || o.status,
           '/panel/producciones/' || pf.production_id || '/boletos?codigo=' || o.order_code
      from orders o join performances pf on pf.id = o.performance_id join productions pr on pr.id = pf.production_id
     where cod ~ '^DARF-' and o.order_code like cod || '%' and has_perm(pf.production_id, 'ventas.ver')
     limit 5
  ) union all (
    -- Órdenes de eventos (EV-XXXXXX): quien cobra en ese evento.
    select 'orden_evento', o.codigo, display_name(o.user_id) || ' · ' || evento_nombre(e) || ' · ' || o.status,
           '/panel/eventos#e-' || e.id
      from evento_ordenes o join fan_encuentros e on e.id = o.encuentro_id
     where cod ~ '^EV-' and o.codigo like cod || '%' and evento_puede_fila(e.id, e.production_id, 'cobros')
     limit 5
  ) union all (
    -- Personas: el Director, todas (su ficha); los demás, las de sus obras con expedientes.
    select 'persona', coalesce(nullif(btrim(p.nombre), ''), u.email::text), u.email::text, '/panel/talento/' || p.id
      from profiles p join auth.users u on u.id = p.id
     where is_admin() and (coincide(p.nombre, t) or lower(u.email) like '%' || t || '%')
     order by p.nombre
     limit 8
  ) union all (
    select distinct on (m.user_id) 'persona', coalesce(nullif(btrim(p.nombre), ''), 'Sin nombre'), pr.nombre,
           '/panel/producciones/' || m.production_id || '/expedientes/' || m.user_id
      from production_members m join profiles p on p.id = m.user_id join productions pr on pr.id = m.production_id
     where not is_admin() and has_perm(m.production_id, 'expedientes.ver') and m.role_id = 'integrante'
       and coincide(p.nombre, t)
     order by m.user_id
     limit 8
  ) union all (
    select 'convocatoria', a.titulo, coalesce(pr.nombre, 'General') || ' · ' || a.estado, '/panel/audiciones/' || a.id
      from auditions a left join productions pr on pr.id = a.production_id
     where coincide(a.titulo, t) and (audition_team(a.id) or (a.production_id is null and is_admin()))
     order by a.created_at desc
     limit 5
  ) union all (
    select 'evento', evento_nombre(e), coalesce(pr.nombre, 'DARF') || ' · ' || to_char(evento_cuando(e) at time zone 'America/Mexico_City', 'DD/MM HH24:MI'),
           '/panel/eventos#e-' || e.id
      from fan_encuentros e left join productions pr on pr.id = e.production_id
     where coincide(evento_nombre(e), t) and evento_puede_fila(e.id, e.production_id, 'ver')
       and evento_fin(e) > now() - interval '30 days'
     order by evento_cuando(e)
     limit 5
  );
end $$;
revoke execute on function panel_buscar(text) from public, anon;
grant execute on function panel_buscar(text) to authenticated;

commit;
