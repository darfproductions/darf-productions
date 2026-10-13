-- 0059: rúbrica con materias por maestro, actitud compartida y boleta completa
-- (pedido de Diego, 2026-10-12, sobre 0058).
--   * A cada maestro se le asignan sus materias (criterios): solo califica esas. Un usuario
--     con rubrica.gestionar SIN materias asignadas es coordinador: arma la rúbrica, asigna
--     maestros, publica y escribe el comentario general (Producción, Dirección o un maestro
--     de un taller pequeño).
--   * Criterio COMPARTIDO (p. ej. "Actitud y conducta"): cada maestro pone su propio nivel y
--     número; la boleta muestra el promedio de todos.
--   * Cada maestro deja su comentario; el coordinador, el comentario general.
--   * Los periodos tienen fechas (desde/hasta) para la boleta: asistencia a ensayos (citados,
--     presentes, retardos, faltas, justificadas, %) y llamadas de atención (advertencias y
--     graves vigentes) del periodo, y los comentarios de cada maestro con su nombre y materias.
-- Precede: 0058.

begin;

alter table rubric_criteria add column compartido boolean not null default false;
alter table rubric_periods add column desde date, add column hasta date,
  add constraint rubric_periods_fechas check (desde is null or hasta is null or desde <= hasta);

create table rubric_teachers (
  production_id text not null references productions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  criterion_id uuid not null references rubric_criteria(id) on delete cascade,
  primary key (production_id, user_id, criterion_id)
);

create table rubric_shared_scores (
  evaluation_id uuid not null references rubric_evaluations(id) on delete cascade,
  criterion_id uuid not null references rubric_criteria(id) on delete cascade,
  teacher_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  level_id uuid references rubric_levels(id) on delete set null,
  numero numeric(4,1) check (numero between 0 and 10),
  primary key (evaluation_id, criterion_id, teacher_id)
);

create table rubric_notes (
  evaluation_id uuid not null references rubric_evaluations(id) on delete cascade,
  teacher_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  comentario text not null check (length(btrim(comentario)) between 1 and 2000),
  updated_at timestamptz not null default now(),
  primary key (evaluation_id, teacher_id)
);

-- ──────── Quién puede qué ────────
create or replace function rubric_restricted(pid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from rubric_teachers where production_id = pid and user_id = auth.uid())
$$;

create or replace function rubric_coord(pid text) returns boolean
language sql stable security definer set search_path = public as $$
  select has_perm(pid, 'rubrica.gestionar') and not rubric_restricted(pid)
$$;

-- ¿Puedo calificar este criterio (no compartido)?
create or replace function rubric_can_grade(pid text, crit uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select has_perm(pid, 'rubrica.gestionar')
     and not coalesce((select compartido from rubric_criteria where id = crit), false)
     and (not rubric_restricted(pid)
          or exists (select 1 from rubric_teachers where production_id = pid and user_id = auth.uid() and criterion_id = crit))
$$;

-- Estructura (criterios, niveles, periodos, asignaciones): solo coordinadores. Todos los maestros la leen.
alter policy rubric_criteria_team on rubric_criteria using (rubric_coord(production_id)) with check (rubric_coord(production_id));
alter policy rubric_levels_team on rubric_levels using (rubric_coord(production_id)) with check (rubric_coord(production_id));
alter policy rubric_periods_team on rubric_periods using (rubric_coord(production_id)) with check (rubric_coord(production_id));
create policy rubric_criteria_teachers on rubric_criteria for select to authenticated using (has_perm(production_id, 'rubrica.gestionar'));
create policy rubric_levels_teachers on rubric_levels for select to authenticated using (has_perm(production_id, 'rubrica.gestionar'));
create policy rubric_periods_teachers on rubric_periods for select to authenticated using (has_perm(production_id, 'rubrica.gestionar'));

-- Calificaciones: cada maestro solo escribe sus materias; todos leen.
alter policy rubric_scores_team on rubric_scores
  using (rubric_can_grade(rubric_eval_production(evaluation_id), criterion_id))
  with check (rubric_can_grade(rubric_eval_production(evaluation_id), criterion_id));
create policy rubric_scores_teachers on rubric_scores for select to authenticated
  using (has_perm(rubric_eval_production(evaluation_id), 'rubrica.gestionar'));

-- El comentario general solo lo cambia un coordinador.
create or replace function rubric_eval_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and rubric_restricted(new.production_id) then
    new.comentario := case when tg_op = 'UPDATE' then old.comentario end;
  end if;
  return new;
end $$;
create trigger rubric_eval_guard before insert or update on rubric_evaluations for each row execute function rubric_eval_guard();

alter table rubric_teachers enable row level security;
alter table rubric_shared_scores enable row level security;
alter table rubric_notes enable row level security;
create policy rubric_teachers_coord on rubric_teachers for all to authenticated
  using (rubric_coord(production_id)) with check (rubric_coord(production_id));
create policy rubric_teachers_read on rubric_teachers for select to authenticated using (has_perm(production_id, 'rubrica.gestionar'));
create policy rubric_shared_write on rubric_shared_scores for all to authenticated
  using (teacher_id = auth.uid() and has_perm(rubric_eval_production(evaluation_id), 'rubrica.gestionar'))
  with check (teacher_id = auth.uid() and has_perm(rubric_eval_production(evaluation_id), 'rubrica.gestionar')
              and coalesce((select compartido from rubric_criteria where id = criterion_id), false));
create policy rubric_shared_read on rubric_shared_scores for select to authenticated
  using (has_perm(rubric_eval_production(evaluation_id), 'rubrica.gestionar') or rubric_eval_mine(evaluation_id));
create policy rubric_notes_write on rubric_notes for all to authenticated
  using (teacher_id = auth.uid() and has_perm(rubric_eval_production(evaluation_id), 'rubrica.gestionar'))
  with check (teacher_id = auth.uid() and has_perm(rubric_eval_production(evaluation_id), 'rubrica.gestionar'));
create policy rubric_notes_read on rubric_notes for select to authenticated
  using (has_perm(rubric_eval_production(evaluation_id), 'rubrica.gestionar') or rubric_eval_mine(evaluation_id));
revoke all on rubric_teachers, rubric_shared_scores, rubric_notes from anon;

-- Maestros de la obra (rol Maestro) con sus materias y nombre.
create or replace function rubric_teacher_list(pid text)
returns table (user_id uuid, nombre text, criterios uuid[])
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_perm(pid, 'rubrica.gestionar') then raise exception 'No autorizado'; end if;
  return query
    select distinct u.id, coalesce(nullif(btrim(pr.nombre), ''), split_part(u.email::text, '@', 1)),
           coalesce((select array_agg(t.criterion_id) from rubric_teachers t where t.production_id = pid and t.user_id = u.id), '{}')
      from auth.users u left join profiles pr on pr.id = u.id
     where u.id in (select m.user_id from production_members m where m.production_id = pid and m.role_id = 'maestro')
        or u.id in (select t.user_id from rubric_teachers t where t.production_id = pid)
        or u.id in (select n.teacher_id from rubric_notes n join rubric_evaluations e on e.id = n.evaluation_id where e.production_id = pid)
        or u.id in (select s.teacher_id from rubric_shared_scores s join rubric_evaluations e on e.id = s.evaluation_id where e.production_id = pid)
     order by 2;
end $$;

-- Asistencia y llamadas de atención de un alumno en un periodo (para la boleta).
create or replace function rubric_period_extras(per uuid, uid uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p rubric_periods%rowtype; out jsonb;
begin
  select * into p from rubric_periods where id = per;
  if not found then raise exception 'No existe el periodo.'; end if;
  if not (has_perm(p.production_id, 'rubrica.gestionar') or (uid = auth.uid() and p.publicado_at is not null)) then
    raise exception 'No autorizado';
  end if;
  with ens as (
    select r.id from rehearsals r
     where r.production_id = p.production_id and r.estado = 'programado' and r.inicia <= now()
       and (p.desde is null or (r.inicia at time zone 'America/Mexico_City')::date >= p.desde)
       and (p.hasta is null or (r.inicia at time zone 'America/Mexico_City')::date <= p.hasta)
       and rehearsal_cites(r.id, uid)
  )
  select jsonb_build_object(
    'citados', (select count(*) from ens),
    'presentes', (select count(*) from rehearsal_attendance a where a.rehearsal_id in (select id from ens) and a.user_id = uid and a.estado = 'presente'),
    'retardos', (select count(*) from rehearsal_attendance a where a.rehearsal_id in (select id from ens) and a.user_id = uid and a.estado = 'retardo'),
    'faltas', (select count(*) from rehearsal_attendance a where a.rehearsal_id in (select id from ens) and a.user_id = uid and a.estado = 'falta'),
    'justificadas', (select count(*) from rehearsal_attendance a where a.rehearsal_id in (select id from ens) and a.user_id = uid and a.estado = 'justificada'),
    'incidencias', coalesce((select jsonb_agg(jsonb_build_object('fecha', i.fecha, 'nivel', i.nivel, 'tipo', i.tipo, 'descripcion', i.descripcion) order by i.fecha)
        from member_incidents i
       where i.production_id = p.production_id and i.user_id = uid and i.nivel in ('advertencia', 'grave') and i.anulada_at is null
         and (p.desde is null or i.fecha >= p.desde) and (p.hasta is null or i.fecha <= p.hasta)), '[]'),
    'notas', coalesce((select jsonb_agg(jsonb_build_object(
          'maestro', coalesce(nullif(btrim(pr.nombre), ''), 'Maestro'),
          'materias', coalesce((select jsonb_agg(c.nombre order by c.orden) from rubric_teachers t join rubric_criteria c on c.id = t.criterion_id
                                 where t.production_id = p.production_id and t.user_id = n.teacher_id), '[]'),
          'comentario', n.comentario) order by pr.nombre)
        from rubric_notes n join rubric_evaluations e on e.id = n.evaluation_id left join profiles pr on pr.id = n.teacher_id
       where e.period_id = per and e.user_id = uid), '[]')
  ) into out;
  return out;
end $$;

-- La rúbrica básica ahora incluye "Actitud y conducta" compartida.
create or replace function rubric_seed(pid text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not rubric_coord(pid) then raise exception 'No autorizado'; end if;
  if not exists (select 1 from rubric_criteria where production_id = pid) then
    insert into rubric_criteria (production_id, nombre, orden, compartido) values
      (pid, 'Actuación', 1, false), (pid, 'Canto', 2, false), (pid, 'Baile', 3, false),
      (pid, 'Actitud y conducta', 4, true);
  end if;
  if not exists (select 1 from rubric_levels where production_id = pid) then
    insert into rubric_levels (production_id, nombre, orden) values
      (pid, 'Excelente', 1), (pid, 'Bien', 2), (pid, 'En proceso', 3), (pid, 'Necesita apoyo', 4);
  end if;
end $$;

revoke execute on function rubric_eval_guard() from public, anon, authenticated;
revoke execute on function rubric_restricted(text), rubric_coord(text), rubric_can_grade(text, uuid), rubric_teacher_list(text), rubric_period_extras(uuid, uuid) from public, anon;
grant execute on function rubric_restricted(text), rubric_coord(text), rubric_can_grade(text, uuid), rubric_teacher_list(text), rubric_period_extras(uuid, uuid) to authenticated;

create trigger audit_rubric_teachers after insert or update or delete on rubric_teachers for each row execute function audit_row();

commit;
