-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV".
-- Aplica la migración 0060 (encender/apagar evaluaciones y correcciones del Director). Si la base no es DEV, aborta.
begin;
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
end $$;

create table rubric_settings (
  production_id text primary key references productions(id) on delete cascade,
  activa boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now()
);
alter table rubric_settings enable row level security;
create policy rubric_settings_read on rubric_settings for select to authenticated
  using (has_perm(production_id, 'rubrica.gestionar') or has_perm(production_id, 'obra.publicar') or is_production_member(production_id));
revoke all on rubric_settings from anon;

create or replace function rubric_active(pid text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select activa from rubric_settings where production_id = pid), false)
$$;

create or replace function rubric_set_active(pid text, on_ boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (is_admin() or has_perm(pid, 'obra.publicar')) then raise exception 'No autorizado'; end if;
  insert into rubric_settings (production_id, activa) values (pid, on_)
  on conflict (production_id) do update set activa = excluded.activa, updated_by = auth.uid(), updated_at = now();
end $$;

-- Apagadas: no se captura nada.
create or replace function rubric_require_active() returns trigger
language plpgsql security definer set search_path = public as $$
declare pid text;
begin
  if tg_table_name = 'rubric_evaluations' then pid := new.production_id;
  else pid := rubric_eval_production(new.evaluation_id); end if;
  if not rubric_active(pid) then raise exception 'Las evaluaciones están apagadas en esta obra.'; end if;
  return new;
end $$;
create trigger rubric_evaluations_active before insert or update on rubric_evaluations for each row execute function rubric_require_active();
create trigger rubric_scores_active before insert or update on rubric_scores for each row execute function rubric_require_active();
create trigger rubric_shared_active before insert or update on rubric_shared_scores for each row execute function rubric_require_active();
create trigger rubric_notes_active before insert or update on rubric_notes for each row execute function rubric_require_active();

-- El alumno solo ve lo publicado de obras con evaluaciones encendidas.
create or replace function rubric_eval_mine(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from rubric_evaluations e join rubric_periods p on p.id = e.period_id
                  where e.id = eid and e.user_id = auth.uid() and p.publicado_at is not null and rubric_active(e.production_id))
$$;
alter policy rubric_periods_members on rubric_periods
  using (is_production_member(production_id) and publicado_at is not null and rubric_active(production_id));

-- El Director general califica cualquier materia (aunque tenga materias asignadas).
create or replace function rubric_can_grade(pid text, crit uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select has_perm(pid, 'rubrica.gestionar')
     and not coalesce((select compartido from rubric_criteria where id = crit), false)
     and (is_admin() or not rubric_restricted(pid)
          or exists (select 1 from rubric_teachers where production_id = pid and user_id = auth.uid() and criterion_id = crit))
$$;

-- …y corrige la parte de cada maestro en lo compartido y sus comentarios.
alter policy rubric_shared_write on rubric_shared_scores
  using ((teacher_id = auth.uid() or is_admin()) and has_perm(rubric_eval_production(evaluation_id), 'rubrica.gestionar'))
  with check ((teacher_id = auth.uid() or is_admin()) and has_perm(rubric_eval_production(evaluation_id), 'rubrica.gestionar')
              and coalesce((select compartido from rubric_criteria where id = criterion_id), false));
alter policy rubric_notes_write on rubric_notes
  using ((teacher_id = auth.uid() or is_admin()) and has_perm(rubric_eval_production(evaluation_id), 'rubrica.gestionar'))
  with check ((teacher_id = auth.uid() or is_admin()) and has_perm(rubric_eval_production(evaluation_id), 'rubrica.gestionar'));

revoke execute on function rubric_require_active() from public, anon, authenticated;
revoke execute on function rubric_active(text), rubric_set_active(text, boolean) from public, anon;
grant execute on function rubric_active(text), rubric_set_active(text, boolean) to authenticated;

create trigger audit_rubric_settings after insert or update or delete on rubric_settings for each row execute function audit_row();


insert into supabase_migrations.schema_migrations (version, name)
values ('20261012030900', '0060_rubric_toggle') on conflict do nothing;
commit;
select 'OK: 0060 aplicada en DARF 2.0 DEV' as resultado;
