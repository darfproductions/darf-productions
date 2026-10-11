-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV".
-- Aplica la migración 0043 (ensayos y asistencia, etapa 3E bloque 3). Se corre a mano en
-- Supabase → SQL Editor si el conector no puede. Si la base no es DEV, aborta. No borra datos.
begin;
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
end $$;

create table rehearsals (
  id uuid primary key default gen_random_uuid(),
  production_id text not null references productions(id) on delete cascade,
  titulo text not null default 'Ensayo' check (length(btrim(titulo)) between 1 and 120),
  inicia timestamptz not null,
  termina timestamptz,
  lugar text,
  notas text,
  convocatoria text not null default 'todos' check (convocatoria in ('todos', 'grupos', 'personas')),
  grupos text[] not null default '{}',
  personas uuid[] not null default '{}',
  estado text not null default 'programado' check (estado in ('programado', 'cancelado')),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (termina is null or termina > inicia),
  check (convocatoria <> 'grupos' or cardinality(grupos) > 0),
  check (convocatoria <> 'personas' or cardinality(personas) > 0),
  check (grupos <@ array['reparto', 'ensamble', 'creativo', 'produccion', 'crew', 'tecnico'])
);
create index idx_rehearsals_prod on rehearsals(production_id, inicia);

create table rehearsal_attendance (
  rehearsal_id uuid not null references rehearsals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  estado text not null check (estado in ('presente', 'retardo', 'falta', 'justificada')),
  minutos_tarde int check (minutos_tarde between 1 and 600),
  nota text,
  marcado_por uuid references auth.users(id) on delete set null default auth.uid(),
  marcado_at timestamptz not null default now(),
  primary key (rehearsal_id, user_id)
);

create table rehearsal_absences (
  rehearsal_id uuid not null references rehearsals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  motivo text not null check (length(btrim(motivo)) between 1 and 1000),
  created_at timestamptz not null default now(),
  primary key (rehearsal_id, user_id)
);

-- Grupos (tipos de crédito) de una persona en una obra.
create or replace function member_groups(pid text, uid uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct c.tipo), '{}')
    from production_credits c join people pe on pe.id = c.person_id
   where c.production_id = pid and pe.profile_id = uid
$$;

-- ¿Está citada esta persona a este ensayo?
create or replace function rehearsal_cites(rid uuid, uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from rehearsals r
      join production_members m on m.production_id = r.production_id and m.user_id = uid and m.role_id = 'integrante'
     where r.id = rid and (
       r.convocatoria = 'todos'
       or (r.convocatoria = 'grupos' and r.grupos && member_groups(r.production_id, uid))
       or (r.convocatoria = 'personas' and uid = any(r.personas))))
$$;

create or replace function rehearsal_production(rid uuid) returns text
language sql stable security definer set search_path = public as $$
  select production_id from rehearsals where id = rid
$$;

alter table rehearsals enable row level security;
alter table rehearsal_attendance enable row level security;
alter table rehearsal_absences enable row level security;
create policy rehearsals_team on rehearsals for all to authenticated
  using (has_perm(production_id, 'ensayos.gestionar')) with check (has_perm(production_id, 'ensayos.gestionar'));
create policy rehearsals_cited on rehearsals for select to authenticated using (rehearsal_cites(id, auth.uid()));
create policy rehearsal_attendance_team on rehearsal_attendance for all to authenticated
  using (has_perm(rehearsal_production(rehearsal_id), 'ensayos.gestionar'))
  with check (has_perm(rehearsal_production(rehearsal_id), 'ensayos.gestionar') and rehearsal_cites(rehearsal_id, user_id));
create policy rehearsal_attendance_own on rehearsal_attendance for select to authenticated using (user_id = auth.uid());
-- Quien lleva expedientes también ve la asistencia (historial del integrante).
create policy rehearsal_attendance_exp on rehearsal_attendance for select to authenticated
  using (has_perm(rehearsal_production(rehearsal_id), 'expedientes.ver'));
create policy rehearsal_absences_team on rehearsal_absences for select to authenticated
  using (has_perm(rehearsal_production(rehearsal_id), 'ensayos.gestionar'));
create policy rehearsal_absences_own on rehearsal_absences for all to authenticated
  using (user_id = auth.uid() and rehearsal_cites(rehearsal_id, auth.uid()))
  with check (user_id = auth.uid() and rehearsal_cites(rehearsal_id, auth.uid()));
revoke all on rehearsals, rehearsal_attendance, rehearsal_absences from anon;

-- Advertencias automáticas por retardos y faltas sin justificar (reglas de la obra; 0042).
create or replace function rehearsal_auto_warnings() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  pid text := rehearsal_production(new.rehearsal_id);
  cfg production_discipline%rowtype;
  n_ret int; n_fal int; k int;
begin
  select * into cfg from production_discipline where production_id = pid;
  if not found then cfg.auto_retardos := 3; cfg.auto_faltas := 2; end if;
  select count(*) filter (where a.estado = 'retardo'), count(*) filter (where a.estado = 'falta')
    into n_ret, n_fal
    from rehearsal_attendance a join rehearsals r on r.id = a.rehearsal_id
   where r.production_id = pid and a.user_id = new.user_id and r.estado = 'programado';
  if cfg.auto_retardos is not null then
    for k in 1 .. (n_ret / cfg.auto_retardos) loop
      insert into member_incidents (production_id, user_id, tipo, nivel, descripcion, origen, auto_key, created_by)
      values (pid, new.user_id, 'retardo', 'advertencia', format('%s retardos en ensayos.', k * cfg.auto_retardos), 'auto', 'retardos:' || k, null)
      on conflict (production_id, user_id, auto_key) where auto_key is not null do nothing;
    end loop;
  end if;
  if cfg.auto_faltas is not null then
    for k in 1 .. (n_fal / cfg.auto_faltas) loop
      insert into member_incidents (production_id, user_id, tipo, nivel, descripcion, origen, auto_key, created_by)
      values (pid, new.user_id, 'falta', 'advertencia', format('%s faltas sin justificar a ensayos.', k * cfg.auto_faltas), 'auto', 'faltas:' || k, null)
      on conflict (production_id, user_id, auto_key) where auto_key is not null do nothing;
    end loop;
  end if;
  return null;
end $$;
create trigger rehearsal_auto_warnings after insert or update of estado on rehearsal_attendance
  for each row execute function rehearsal_auto_warnings();

-- Lista de citados con su asistencia y su aviso (para tomar asistencia).
create or replace function rehearsal_roster(rid uuid)
returns table (user_id uuid, nombre text, papeles text[], estado text, minutos_tarde int, nota text, aviso text)
language plpgsql stable security definer set search_path = public as $$
declare pid text := rehearsal_production(rid);
begin
  if not has_perm(pid, 'ensayos.gestionar') then raise exception 'No autorizado'; end if;
  return query
    select m.user_id,
           coalesce(nullif(btrim(pe.nombre), ''), nullif(btrim(pr.nombre), ''), split_part(u.email::text, '@', 1)),
           coalesce((select array_agg(coalesce(c.papel, initcap(c.tipo)) order by c.tipo, c.orden)
                       from production_credits c where c.production_id = pid and c.person_id = pe.id), '{}'),
           a.estado, a.minutos_tarde, a.nota, ab.motivo
      from production_members m
      join auth.users u on u.id = m.user_id
      left join profiles pr on pr.id = m.user_id
      left join people pe on pe.profile_id = m.user_id
      left join rehearsal_attendance a on a.rehearsal_id = rid and a.user_id = m.user_id
      left join rehearsal_absences ab on ab.rehearsal_id = rid and ab.user_id = m.user_id
     where m.production_id = pid and m.role_id = 'integrante' and rehearsal_cites(rid, m.user_id)
     order by 2;
end $$;

-- Resumen de asistencia por integrante en una obra.
create or replace function attendance_summary(pid text)
returns table (user_id uuid, presentes int, retardos int, faltas int, justificadas int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (has_perm(pid, 'ensayos.gestionar') or has_perm(pid, 'expedientes.ver')) then raise exception 'No autorizado'; end if;
  return query
    select a.user_id,
           count(*) filter (where a.estado = 'presente')::int, count(*) filter (where a.estado = 'retardo')::int,
           count(*) filter (where a.estado = 'falta')::int, count(*) filter (where a.estado = 'justificada')::int
      from rehearsal_attendance a join rehearsals r on r.id = a.rehearsal_id
     where r.production_id = pid and r.estado = 'programado'
     group by a.user_id;
end $$;

revoke execute on function member_groups(text, uuid) from public, anon;
revoke execute on function rehearsal_cites(uuid, uuid) from public, anon;
revoke execute on function rehearsal_production(uuid) from public, anon;
revoke execute on function rehearsal_auto_warnings() from public, anon;
revoke execute on function rehearsal_roster(uuid) from public, anon;
revoke execute on function attendance_summary(text) from public, anon;
grant execute on function member_groups(text, uuid), rehearsal_cites(uuid, uuid), rehearsal_production(uuid), rehearsal_roster(uuid),
  attendance_summary(text) to authenticated;

create trigger audit_rehearsals after insert or update or delete on rehearsals for each row execute function audit_row();


insert into supabase_migrations.schema_migrations (version, name)
values ('20261012060000', '0043_rehearsals') on conflict do nothing;
commit;
select 'OK: 0043 aplicada en DARF 2.0 DEV' as resultado;
