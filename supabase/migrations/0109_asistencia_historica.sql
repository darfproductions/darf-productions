-- 0109: asistencia histórica de ensayos (Diego 2026-10-15).
-- Para cargar el registro de asistencias y faltas que se llevaba fuera de la página (Showman):
--   * La asistencia se guarda por ficha (rehearsal_attendance_ficha) mientras la persona no tiene cuenta.
--     En cuanto su ficha se liga a una cuenta, pasa sola a sus ensayos (rehearsal_attendance).
--   * Lo histórico queda marcado (historico) y NO genera advertencias automáticas ni cuenta para ellas:
--     es solo registro. Sí cuenta como asistencia (portal, expediente y boleta).
--   * Su ingreso a la obra se recorre a la fecha de su primer ensayo registrado, para que esos ensayos
--     cuenten como citados.

alter table rehearsal_attendance add column if not exists historico boolean not null default false;

create table if not exists rehearsal_attendance_ficha (
  rehearsal_id uuid not null references rehearsals(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  estado text not null check (estado in ('presente', 'retardo', 'falta', 'justificada')),
  minutos_tarde integer check (minutos_tarde between 1 and 600),
  nota text check (length(nota) <= 500),
  created_at timestamptz not null default now(),
  primary key (rehearsal_id, person_id)
);
alter table rehearsal_attendance_ficha enable row level security;
-- Solo quien maneja los ensayos de la obra la ve; se escribe por script o por las funciones de abajo.
drop policy if exists rehearsal_attendance_ficha_read on rehearsal_attendance_ficha;
create policy rehearsal_attendance_ficha_read on rehearsal_attendance_ficha for select
  using (has_perm(rehearsal_production(rehearsal_id), 'ensayos.gestionar') or is_admin());

-- ──────── Las advertencias automáticas ignoran lo histórico ────────
create or replace function rehearsal_auto_warnings() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  pid text := rehearsal_production(new.rehearsal_id);
  cfg production_discipline%rowtype;
  n_ret int; n_fal int; k int;
begin
  if new.historico then return null; end if;
  select * into cfg from production_discipline where production_id = pid;
  if not found then cfg.auto_retardos := 3; cfg.auto_faltas := 2; end if;
  select count(*) filter (where a.estado = 'retardo'), count(*) filter (where a.estado = 'falta')
    into n_ret, n_fal
    from rehearsal_attendance a join rehearsals r on r.id = a.rehearsal_id
   where r.production_id = pid and a.user_id = new.user_id and r.estado = 'programado' and not a.historico;
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

-- ──────── Pasar la asistencia de una ficha a su cuenta ────────
create or replace function asistencia_ficha_pasar(p_person uuid) returns int
language plpgsql security definer set search_path = public as $$
declare uid uuid; n int;
begin
  select profile_id into uid from people where id = p_person;
  if uid is null then return 0; end if;
  insert into rehearsal_attendance (rehearsal_id, user_id, estado, minutos_tarde, nota, marcado_at, historico)
  select f.rehearsal_id, uid, f.estado, case when f.estado = 'retardo' then f.minutos_tarde end, f.nota, r.inicia, true
    from rehearsal_attendance_ficha f join rehearsals r on r.id = f.rehearsal_id
   where f.person_id = p_person
  on conflict do nothing;
  get diagnostics n = row_count;
  -- Su ingreso a cada obra se recorre al día de su primer ensayo registrado.
  update member_enrollment e set ingreso = least(e.ingreso, x.primero)
    from (select r.production_id, min((r.inicia at time zone 'America/Mexico_City')::date) as primero
            from rehearsal_attendance_ficha f join rehearsals r on r.id = f.rehearsal_id
           where f.person_id = p_person group by r.production_id) x
   where e.production_id = x.production_id and e.user_id = uid;
  delete from rehearsal_attendance_ficha where person_id = p_person;
  return n;
end $$;
revoke all on function asistencia_ficha_pasar(uuid) from public, anon, authenticated;

-- Al ligar la ficha a una cuenta (después de darle acceso de integrante, 0106).
create or replace function asistencia_ficha_al_ligar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.profile_id is not null and new.profile_id is distinct from old.profile_id then
    perform asistencia_ficha_pasar(new.id);
  end if;
  return null;
end $$;

drop trigger if exists historial_asistencia_ficha on people;
create trigger historial_asistencia_ficha after update of profile_id on people
  for each row execute function asistencia_ficha_al_ligar();

-- Unir fichas duplicadas conserva la asistencia histórica.
create or replace function people_merge(keep uuid, quitar uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare k people%rowtype; d people%rowtype;
begin
  if not has_casa('casa.personas') then raise exception 'Solo el Director puede unir fichas.'; end if;
  if keep = quitar then raise exception 'Elige dos fichas distintas.'; end if;
  select * into k from people where id = keep for update;
  select * into d from people where id = quitar for update;
  if k.id is null or d.id is null then raise exception 'No se encontró una de las fichas.'; end if;
  if k.profile_id is not null and d.profile_id is not null and k.profile_id <> d.profile_id then
    raise exception 'Las dos fichas tienen cuentas distintas; no se pueden unir.';
  end if;
  update production_credits set person_id = keep where person_id = quitar;
  -- 0109: la asistencia histórica de la ficha que se une pasa a la que se queda.
  update rehearsal_attendance_ficha f set person_id = keep where f.person_id = quitar
     and not exists (select 1 from rehearsal_attendance_ficha g where g.person_id = keep and g.rehearsal_id = f.rehearsal_id);
  if k.profile_id is null and d.profile_id is not null then
    update people set profile_id = null where id = quitar;
    update people set profile_id = d.profile_id where id = keep;
  end if;
  delete from people where id = quitar;
  perform asistencia_ficha_pasar(keep);
end $function$;
