-- 0058: rúbrica de evaluación por producción (talleres en escuela; decisiones de Diego, 2026-10-12).
--   * Rol nuevo "Maestro" por obra con el permiso rubrica.gestionar: arma la rúbrica (criterios,
--     niveles y periodos), evalúa al elenco y publica. No ve pagos, salud ni expediente.
--     Producción y Dirección artística también tienen el permiso.
--   * Cada criterio se califica con NIVEL (lista editable, p. ej. Excelente…Necesita apoyo) y
--     NÚMERO (0–10), más un comentario por alumno y periodo.
--   * Periodos que define la obra ("Bimestre 1", "Final"…). El alumno ve su evaluación en el
--     portal solo cuando el periodo está publicado, y puede descargar su boleta en PDF.
-- Precede: 0057. Cambia permisos (rol nuevo; aprobado por Diego).

begin;

-- ──────── Permiso y rol ────────
insert into permissions (id, grupo, descripcion, orden) values
  ('rubrica.gestionar', 'Elenco', 'Rúbrica del taller: criterios, periodos, evaluar y publicar', 27);
alter table panel_roles disable trigger panel_roles_protect;
insert into panel_roles (id, nombre, descripcion, es_sistema, orden) values
  ('maestro', 'Maestro', 'Evalúa al elenco con la rúbrica del taller', true, 11);
alter table panel_roles enable trigger panel_roles_protect;
alter table role_permissions disable trigger role_permissions_protect;
insert into role_permissions (role_id, permission_id) values
  ('maestro', 'obra.ver'), ('maestro', 'rubrica.gestionar'),
  ('productor', 'rubrica.gestionar'), ('direccion', 'rubrica.gestionar');
alter table role_permissions enable trigger role_permissions_protect;

-- ──────── Rúbrica ────────
create table rubric_criteria (
  id uuid primary key default gen_random_uuid(),
  production_id text not null references productions(id) on delete cascade,
  nombre text not null check (length(btrim(nombre)) between 1 and 80),
  descripcion text check (length(descripcion) <= 300),
  orden int not null default 0
);
create table rubric_levels (
  id uuid primary key default gen_random_uuid(),
  production_id text not null references productions(id) on delete cascade,
  nombre text not null check (length(btrim(nombre)) between 1 and 40),
  orden int not null default 0
);
create table rubric_periods (
  id uuid primary key default gen_random_uuid(),
  production_id text not null references productions(id) on delete cascade,
  nombre text not null check (length(btrim(nombre)) between 1 and 60),
  orden int not null default 0,
  publicado_at timestamptz
);
create table rubric_evaluations (
  id uuid primary key default gen_random_uuid(),
  production_id text not null references productions(id) on delete cascade,
  period_id uuid not null references rubric_periods(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  comentario text check (length(comentario) <= 2000),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  unique (period_id, user_id)
);
create table rubric_scores (
  evaluation_id uuid not null references rubric_evaluations(id) on delete cascade,
  criterion_id uuid not null references rubric_criteria(id) on delete cascade,
  level_id uuid references rubric_levels(id) on delete set null,
  numero numeric(4,1) check (numero between 0 and 10),
  primary key (evaluation_id, criterion_id)
);
create index idx_rubric_eval_user on rubric_evaluations(user_id);

-- El periodo de una evaluación es de la misma obra; criterio y nivel también.
create or replace function rubric_consistency() returns trigger
language plpgsql set search_path = public as $$
declare pid text;
begin
  if tg_table_name = 'rubric_evaluations' then
    if (select production_id from rubric_periods where id = new.period_id) <> new.production_id then
      raise exception 'El periodo es de otra obra.';
    end if;
    new.updated_at := now();
    new.updated_by := auth.uid();
  else
    select production_id into pid from rubric_evaluations where id = new.evaluation_id;
    if (select production_id from rubric_criteria where id = new.criterion_id) <> pid
       or (new.level_id is not null and (select production_id from rubric_levels where id = new.level_id) <> pid) then
      raise exception 'Criterio o nivel de otra obra.';
    end if;
  end if;
  return new;
end $$;
create trigger rubric_evaluations_consistency before insert or update on rubric_evaluations for each row execute function rubric_consistency();
create trigger rubric_scores_consistency before insert or update on rubric_scores for each row execute function rubric_consistency();

create or replace function rubric_eval_production(eid uuid) returns text
language sql stable security definer set search_path = public as $$
  select production_id from rubric_evaluations where id = eid
$$;

-- ¿Puede el alumno ver esta evaluación? (suya y del periodo publicado)
create or replace function rubric_eval_mine(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from rubric_evaluations e join rubric_periods p on p.id = e.period_id
                  where e.id = eid and e.user_id = auth.uid() and p.publicado_at is not null)
$$;

-- ¿Es (o fue) integrante de la obra? Para leer la rúbrica de sus boletas.
create or replace function is_production_member(pid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from production_members where production_id = pid and user_id = auth.uid())
$$;

alter table rubric_criteria enable row level security;
alter table rubric_levels enable row level security;
alter table rubric_periods enable row level security;
alter table rubric_evaluations enable row level security;
alter table rubric_scores enable row level security;

create policy rubric_criteria_team on rubric_criteria for all to authenticated
  using (has_perm(production_id, 'rubrica.gestionar')) with check (has_perm(production_id, 'rubrica.gestionar'));
create policy rubric_criteria_members on rubric_criteria for select to authenticated using (is_production_member(production_id));
create policy rubric_levels_team on rubric_levels for all to authenticated
  using (has_perm(production_id, 'rubrica.gestionar')) with check (has_perm(production_id, 'rubrica.gestionar'));
create policy rubric_levels_members on rubric_levels for select to authenticated using (is_production_member(production_id));
create policy rubric_periods_team on rubric_periods for all to authenticated
  using (has_perm(production_id, 'rubrica.gestionar')) with check (has_perm(production_id, 'rubrica.gestionar'));
create policy rubric_periods_members on rubric_periods for select to authenticated
  using (is_production_member(production_id) and publicado_at is not null);
create policy rubric_evaluations_team on rubric_evaluations for all to authenticated
  using (has_perm(production_id, 'rubrica.gestionar')) with check (has_perm(production_id, 'rubrica.gestionar'));
create policy rubric_evaluations_own on rubric_evaluations for select to authenticated using (rubric_eval_mine(id));
create policy rubric_scores_team on rubric_scores for all to authenticated
  using (has_perm(rubric_eval_production(evaluation_id), 'rubrica.gestionar'))
  with check (has_perm(rubric_eval_production(evaluation_id), 'rubrica.gestionar'));
create policy rubric_scores_own on rubric_scores for select to authenticated using (rubric_eval_mine(evaluation_id));
revoke all on rubric_criteria, rubric_levels, rubric_periods, rubric_evaluations, rubric_scores from anon;

-- Alumnos a evaluar (sin correos ni datos privados).
create or replace function rubric_roster(pid text)
returns table (user_id uuid, nombre text, papeles text[], activo boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_perm(pid, 'rubrica.gestionar') then raise exception 'No autorizado'; end if;
  return query
    select m.user_id,
           coalesce(nullif(btrim(pe.nombre), ''), nullif(btrim(pr.nombre), ''), 'Integrante'),
           coalesce((select array_agg(coalesce(c.papel, initcap(c.tipo)) order by c.tipo, c.orden)
                       from production_credits c where c.production_id = pid and c.person_id = pe.id), '{}'),
           is_active_member(pid, m.user_id)
      from production_members m
      left join profiles pr on pr.id = m.user_id
      left join people pe on pe.profile_id = m.user_id
     where m.production_id = pid and m.role_id = 'integrante'
     order by 4 desc, 2;
end $$;

-- Rúbrica básica para empezar (solo si la obra no tiene criterios ni niveles).
create or replace function rubric_seed(pid text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_perm(pid, 'rubrica.gestionar') then raise exception 'No autorizado'; end if;
  if not exists (select 1 from rubric_criteria where production_id = pid) then
    insert into rubric_criteria (production_id, nombre, orden) values
      (pid, 'Actuación', 1), (pid, 'Canto', 2), (pid, 'Baile', 3), (pid, 'Disciplina y puntualidad', 4), (pid, 'Trabajo en equipo', 5);
  end if;
  if not exists (select 1 from rubric_levels where production_id = pid) then
    insert into rubric_levels (production_id, nombre, orden) values
      (pid, 'Excelente', 1), (pid, 'Bien', 2), (pid, 'En proceso', 3), (pid, 'Necesita apoyo', 4);
  end if;
end $$;

revoke execute on function rubric_consistency() from public, anon, authenticated;
revoke execute on function rubric_eval_production(uuid), rubric_eval_mine(uuid), is_production_member(text), rubric_roster(text), rubric_seed(text) from public, anon;
grant execute on function rubric_eval_production(uuid), rubric_eval_mine(uuid), is_production_member(text), rubric_roster(text), rubric_seed(text) to authenticated;

create trigger audit_rubric_evaluations after insert or update or delete on rubric_evaluations for each row execute function audit_row();
create trigger audit_rubric_periods after insert or update or delete on rubric_periods for each row execute function audit_row();

commit;
