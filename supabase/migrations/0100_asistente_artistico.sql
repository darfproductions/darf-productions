-- 0100 · Rol "Asistente artístico" y propuestas de calificación en la rúbrica (Diego 2026-10-14).
--
-- Asistente de dirección vocal, de coreografía… : más abajo que maestros y dirección creativa, pero no es
-- producción ni crew. Categoría dirección (franja de dirección en el gafete y, por 0099, siempre pasa lista y
-- maneja ensayos). Califica y registra en audiciones. En la rúbrica solo PROPONE calificaciones de las materias
-- que el coordinador le asigna; el maestro de esa materia (o un coordinador) las aprueba tal cual, las corrige
-- o las rechaza. Hasta aprobarse no cuentan: viven aparte de rubric_scores (boleta, promedios y alumnos no las ven).

-- ════════ Permiso y rol ════════
insert into permissions (id, grupo, descripcion, orden) values
  ('rubrica.proponer', 'Elenco', 'Proponer calificaciones en la rúbrica (las aprueba el maestro de la materia)', 28)
on conflict (id) do nothing;
alter table panel_roles disable trigger panel_roles_protect;
insert into panel_roles (id, nombre, descripcion, es_sistema, orden, categoria) values
  ('asistente', 'Asistente artístico', 'Asistente de dirección vocal, coreografía…: ensayos y asistencia, audiciones y propuestas de calificación', true, 12, 'direccion')
on conflict (id) do nothing;
alter table panel_roles enable trigger panel_roles_protect;
alter table role_permissions disable trigger role_permissions_protect;
insert into role_permissions (role_id, permission_id) values
  ('asistente', 'obra.ver'), ('asistente', 'materiales.ver'), ('asistente', 'ensayos.gestionar'),
  ('asistente', 'audiciones.evaluar'), ('asistente', 'audiciones.registro'), ('asistente', 'rubrica.proponer')
on conflict do nothing;
alter table role_permissions enable trigger role_permissions_protect;

-- ════════ Materias de cada asistente ════════
create table if not exists rubric_assistants (
  production_id text not null references productions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  criterion_id uuid not null references rubric_criteria(id) on delete cascade,
  primary key (production_id, user_id, criterion_id)
);
alter table rubric_assistants enable row level security;
drop policy if exists rubric_assistants_read on rubric_assistants;
create policy rubric_assistants_read on rubric_assistants for select to authenticated
  using (user_id = auth.uid() or has_perm(production_id, 'rubrica.gestionar'));
drop policy if exists rubric_assistants_write on rubric_assistants;
create policy rubric_assistants_write on rubric_assistants for all to authenticated
  using (rubric_coord(production_id) or is_admin()) with check (rubric_coord(production_id) or is_admin());
revoke all on rubric_assistants from anon;

create or replace function rubric_can_propose(pid text, crit uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select has_perm(pid, 'rubrica.proponer')
     and exists (select 1 from rubric_assistants where production_id = pid and user_id = auth.uid() and criterion_id = crit)
$$;

-- ════════ Propuestas ════════
create table if not exists rubric_proposals (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references rubric_evaluations(id) on delete cascade,
  criterion_id uuid not null references rubric_criteria(id) on delete cascade,
  proposed_by uuid not null references auth.users(id) on delete cascade default auth.uid(),
  level_id uuid references rubric_levels(id) on delete set null,
  numero numeric(4,1) check (numero between 0 and 10),
  comentario text check (length(comentario) <= 1000),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'corregida', 'rechazada')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (evaluation_id, criterion_id, proposed_by),
  check (level_id is not null or numero is not null)
);
create index if not exists idx_rubric_proposals_eval on rubric_proposals(evaluation_id);
alter table rubric_proposals enable row level security;
-- Solo lectura directa: el asistente ve las suyas; quien califica la materia (o coordina) ve las de su materia.
drop policy if exists rubric_proposals_read on rubric_proposals;
create policy rubric_proposals_read on rubric_proposals for select to authenticated
  using (proposed_by = auth.uid() or rubric_can_grade(rubric_eval_production(evaluation_id), criterion_id));
revoke all on rubric_proposals from anon;
drop trigger if exists audit_rubric_proposals on rubric_proposals;
create trigger audit_rubric_proposals after insert or update or delete on rubric_proposals for each row execute function audit_row();

-- Proponer (o cambiar una propuesta pendiente). Crea la evaluación del alumno si aún no existe.
create or replace function rubric_proponer(per uuid, uid uuid, crit uuid, p_level uuid, p_numero numeric, p_comentario text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare pid text; eid uuid; pid_crit text; qid uuid; previo rubric_proposals; maestros uuid[];
begin
  select production_id into pid from rubric_periods where id = per;
  if pid is null then raise exception 'Ese periodo no existe.'; end if;
  select production_id into pid_crit from rubric_criteria where id = crit;
  if pid_crit is distinct from pid then raise exception 'Esa materia no es de esta obra.'; end if;
  if not rubric_can_propose(pid, crit) then raise exception 'Solo puedes proponer en tus materias.'; end if;
  if not rubric_active(pid) then raise exception 'Las evaluaciones están apagadas en esta obra.'; end if;
  if exists (select 1 from rubric_periods where id = per and publicado_at is not null) then raise exception 'Este periodo ya se publicó.'; end if;
  if p_level is null and p_numero is null then raise exception 'Elige un nivel o un número.'; end if;
  if p_numero is not null and (p_numero < 0 or p_numero > 10) then raise exception 'El número va de 0 a 10.'; end if;
  if p_level is not null and not exists (select 1 from rubric_levels where id = p_level and production_id = pid) then raise exception 'Nivel no válido.'; end if;
  if not exists (select 1 from production_members where production_id = pid and user_id = uid and role_id = 'integrante') then
    raise exception 'Esa persona no es del elenco de esta obra.';
  end if;
  select id into eid from rubric_evaluations where period_id = per and user_id = uid;
  if eid is null then
    insert into rubric_evaluations (production_id, period_id, user_id) values (pid, per, uid) returning id into eid;
  end if;
  select * into previo from rubric_proposals where evaluation_id = eid and criterion_id = crit and proposed_by = auth.uid();
  if found and previo.estado <> 'pendiente' then raise exception 'Esa propuesta ya se revisó.'; end if;
  insert into rubric_proposals (evaluation_id, criterion_id, proposed_by, level_id, numero, comentario)
  values (eid, crit, auth.uid(), p_level, p_numero, nullif(btrim(coalesce(p_comentario, '')), ''))
  on conflict (evaluation_id, criterion_id, proposed_by) do update
    set level_id = excluded.level_id, numero = excluded.numero, comentario = excluded.comentario, updated_at = now()
  returning id into qid;
  -- Aviso a quien califica esa materia (solo la primera vez).
  if previo.id is null then
    select coalesce(array_agg(distinct t.user_id), '{}') into maestros from rubric_teachers t where t.production_id = pid and t.criterion_id = crit;
    perform notify(maestros, 'evaluacion', 'Nueva propuesta de calificación',
                   (select nombre from rubric_criteria where id = crit) || ' · ' || coalesce((select nombre from profiles where id = uid), 'un alumno'),
                   '/panel/producciones/' || pid || '/evaluaciones/' || per || '/' || uid, pid);
  end if;
  return qid;
end $$;

-- Retirar una propuesta pendiente (el asistente).
create or replace function rubric_proposal_retirar(qid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from rubric_proposals where id = qid and proposed_by = auth.uid() and estado = 'pendiente';
end $$;

-- Aprobar (tal cual o corregida) o rechazar: el maestro de esa materia, un coordinador o admin.
create or replace function rubric_resolver(qid uuid, p_aceptar boolean, p_level uuid default null, p_numero numeric default null)
returns text
language plpgsql security definer set search_path = public as $$
declare q rubric_proposals; pid text; est text; lvl uuid; num numeric;
begin
  select * into q from rubric_proposals where id = qid for update;
  if not found then raise exception 'Esa propuesta no existe.'; end if;
  pid := rubric_eval_production(q.evaluation_id);
  if not rubric_can_grade(pid, q.criterion_id) then raise exception 'Solo el maestro de esa materia puede revisarla.'; end if;
  if q.estado <> 'pendiente' then raise exception 'Esa propuesta ya se revisó.'; end if;
  if not p_aceptar then
    est := 'rechazada';
  else
    lvl := coalesce(p_level, q.level_id);
    num := case when p_level is null and p_numero is null then q.numero else p_numero end;
    if p_level is not null and p_numero is null and p_level is distinct from q.level_id then num := null; end if;
    if lvl is null and num is null then raise exception 'Elige un nivel o un número.'; end if;
    est := case when lvl is not distinct from q.level_id and num is not distinct from q.numero then 'aprobada' else 'corregida' end;
    insert into rubric_scores (evaluation_id, criterion_id, level_id, numero) values (q.evaluation_id, q.criterion_id, lvl, num)
    on conflict (evaluation_id, criterion_id) do update set level_id = excluded.level_id, numero = excluded.numero;
    update rubric_evaluations set updated_at = now() where id = q.evaluation_id;
  end if;
  update rubric_proposals set estado = est, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now() where id = qid;
  perform notify(array[q.proposed_by], 'evaluacion',
                 case est when 'aprobada' then 'Aprobaron tu calificación' when 'corregida' then 'Corrigieron y aprobaron tu calificación' else 'No se aprobó tu calificación' end,
                 (select nombre from rubric_criteria where id = q.criterion_id), '/panel/producciones/' || pid || '/evaluaciones', pid);
  return est;
end $$;

-- Las propuestas también respetan el apagado de evaluaciones (0060).
drop trigger if exists rubric_proposals_active on rubric_proposals;
create trigger rubric_proposals_active before insert or update on rubric_proposals for each row execute function rubric_require_active();

-- Lista de alumnos para el asistente (la de 0058 pide rubrica.gestionar).
create or replace function rubric_roster_asistente(pid text)
returns table (user_id uuid, nombre text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_perm(pid, 'rubrica.proponer') then raise exception 'No autorizado'; end if;
  return query
    select m.user_id, coalesce(nullif(btrim(pe.nombre), ''), nullif(btrim(pr.nombre), ''), split_part(u.email::text, '@', 1))
      from production_members m join auth.users u on u.id = m.user_id
      left join profiles pr on pr.id = m.user_id left join people pe on pe.profile_id = m.user_id
     where m.production_id = pid and m.role_id = 'integrante' and is_active_member(pid, m.user_id)
     order by 2;
end $$;

-- El asistente ve los periodos aunque no estén publicados (propone antes de publicar).
drop policy if exists rubric_periods_asistentes on rubric_periods;
create policy rubric_periods_asistentes on rubric_periods for select to authenticated using (has_perm(production_id, 'rubrica.proponer'));

-- Asistentes de la obra y sus materias (para el coordinador y para poner nombre a las propuestas).
create or replace function rubric_assistant_list(pid text)
returns table (user_id uuid, nombre text, criterios uuid[])
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_perm(pid, 'rubrica.gestionar') then raise exception 'No autorizado'; end if;
  return query
    select distinct u.id, coalesce(nullif(btrim(pr.nombre), ''), split_part(u.email::text, '@', 1)),
           coalesce((select array_agg(a.criterion_id) from rubric_assistants a where a.production_id = pid and a.user_id = u.id), '{}')
      from auth.users u left join profiles pr on pr.id = u.id
     where u.id in (select m.user_id from production_members m where m.production_id = pid and m.role_id = 'asistente')
        or u.id in (select a.user_id from rubric_assistants a where a.production_id = pid)
     order by 2;
end $$;

-- Propuestas de un periodo: las mías (asistente) y las de las materias que puedo calificar (maestro/coordinación).
create or replace function rubric_propuestas(per uuid)
returns table (id uuid, user_id uuid, criterion_id uuid, proposed_by uuid, asistente text, level_id uuid, numero numeric,
               comentario text, estado text, updated_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare pid text;
begin
  select production_id into pid from rubric_periods where rubric_periods.id = per;
  if pid is null or not (has_perm(pid, 'rubrica.gestionar') or has_perm(pid, 'rubrica.proponer')) then raise exception 'No autorizado'; end if;
  return query
    select q.id, e.user_id, q.criterion_id, q.proposed_by,
           coalesce(nullif(btrim(pr.nombre), ''), 'Asistente'), q.level_id, q.numero, q.comentario, q.estado, q.updated_at
      from rubric_proposals q join rubric_evaluations e on e.id = q.evaluation_id
      left join profiles pr on pr.id = q.proposed_by
     where e.period_id = per and (q.proposed_by = auth.uid() or rubric_can_grade(pid, q.criterion_id))
     order by q.updated_at desc;
end $$;

-- ════════ Por hacer del panel: propuestas por revisar ════════
CREATE OR REPLACE FUNCTION public.panel_pendientes()
 RETURNS TABLE(tipo text, production_id text, ref_id text, ref_titulo text, n integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
   where ap.estado = 'inscrito' and a.estado in ('abierta', 'cerrada')
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
   where r.publicado_at is null and r.hasta is not null and r.hasta < hoy_mx() and rubric_active(r.production_id)
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
  -- 0100: propuestas de calificación de asistentes artísticos por aprobar (para quien califica esa materia).
  select 'propuestas', e.production_id, null, null, count(*)::int
    from rubric_proposals q join rubric_evaluations e on e.id = q.evaluation_id
   where q.estado = 'pendiente' and e.production_id in (select pid from mias) and rubric_can_grade(e.production_id, q.criterion_id)
   group by e.production_id
  union all
  select 'avisos_equipo', u.production_id, null, null, u.avisos::int from my_team_unread() u where u.avisos > 0;
end $function$

;

revoke execute on function rubric_can_propose(text, uuid) from public, anon;
revoke execute on function rubric_proponer(uuid, uuid, uuid, uuid, numeric, text) from public, anon;
revoke execute on function rubric_proposal_retirar(uuid) from public, anon;
revoke execute on function rubric_resolver(uuid, boolean, uuid, numeric) from public, anon;
revoke execute on function rubric_roster_asistente(text) from public, anon;
revoke execute on function rubric_assistant_list(text), rubric_propuestas(uuid) from public, anon;
grant execute on function rubric_can_propose(text, uuid), rubric_proponer(uuid, uuid, uuid, uuid, numeric, text), rubric_proposal_retirar(uuid),
  rubric_resolver(uuid, boolean, uuid, numeric), rubric_roster_asistente(text), rubric_assistant_list(text), rubric_propuestas(uuid) to authenticated;
