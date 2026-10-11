-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV".
-- Aplica la migración 0044 (baja e ingreso tardío, ensayos recurrentes). Se corre a mano en
-- Supabase → SQL Editor si el conector no puede. Si la base no es DEV, aborta. No borra datos.
begin;
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
end $$;

create table member_enrollment (
  production_id text not null references productions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  ingreso date not null default current_date,
  baja_at date,
  baja_motivo text,
  baja_por uuid references auth.users(id) on delete set null,
  primary key (production_id, user_id),
  check (baja_at is null or baja_at >= ingreso),
  check (baja_at is null or coalesce(btrim(baja_motivo), '') <> '')
);

insert into member_enrollment (production_id, user_id, ingreso)
select production_id, user_id, created_at::date from production_members where role_id = 'integrante'
on conflict do nothing;

-- Al entrar como Integrante (por oferta o a mano) se registra su ingreso de hoy.
create or replace function member_enrollment_on_join() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role_id = 'integrante' then
    insert into member_enrollment (production_id, user_id, ingreso) values (new.production_id, new.user_id, current_date)
    on conflict do nothing;
  end if;
  return null;
end $$;
create trigger member_enrollment_on_join after insert on production_members
  for each row execute function member_enrollment_on_join();

alter table production_credits add column activo boolean not null default true;
alter table rehearsals add column serie_id uuid;
create index idx_rehearsals_serie on rehearsals(serie_id) where serie_id is not null;

-- Quién maneja altas y bajas: elenco o expedientes de la obra.
create or replace function can_manage_enrollment(pid text) returns boolean
language sql stable security definer set search_path = public as $$
  select has_perm(pid, 'elenco.gestionar') or has_perm(pid, 'expedientes.ver')
$$;

alter table member_enrollment enable row level security;
create policy member_enrollment_own on member_enrollment for select to authenticated using (user_id = auth.uid());
create policy member_enrollment_team on member_enrollment for select to authenticated
  using (can_manage_enrollment(production_id) or has_perm(production_id, 'ensayos.gestionar') or has_perm(production_id, 'mensualidades.gestionar'));
revoke all on member_enrollment from anon;
-- Cambios solo por las funciones de abajo (quedan en la Bitácora).

create or replace function member_withdraw(pid text, uid uuid, fecha date, motivo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not can_manage_enrollment(pid) then raise exception 'No autorizado'; end if;
  if coalesce(btrim(motivo), '') = '' then raise exception 'Escribe el motivo de la baja.'; end if;
  update member_enrollment set baja_at = coalesce(fecha, current_date), baja_motivo = btrim(motivo), baja_por = auth.uid()
   where production_id = pid and user_id = uid;
  if not found then raise exception 'Esa persona no es integrante de la obra.'; end if;
  update production_credits c set activo = false
    from people pe where pe.id = c.person_id and pe.profile_id = uid and c.production_id = pid;
end $$;

create or replace function member_reactivate(pid text, uid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not can_manage_enrollment(pid) then raise exception 'No autorizado'; end if;
  update member_enrollment set baja_at = null, baja_motivo = null, baja_por = null where production_id = pid and user_id = uid;
  if not found then raise exception 'Esa persona no es integrante de la obra.'; end if;
  update production_credits c set activo = true
    from people pe where pe.id = c.person_id and pe.profile_id = uid and c.production_id = pid;
end $$;

create or replace function member_set_ingreso(pid text, uid uuid, fecha date) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not can_manage_enrollment(pid) then raise exception 'No autorizado'; end if;
  update member_enrollment set ingreso = fecha where production_id = pid and user_id = uid;
  if not found then raise exception 'Esa persona no es integrante de la obra.'; end if;
end $$;

-- Citado = integrante, dentro de su periodo (ingreso ≤ día del ensayo < baja), y en la convocatoria.
create or replace function rehearsal_cites(rid uuid, uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from rehearsals r
      join production_members m on m.production_id = r.production_id and m.user_id = uid and m.role_id = 'integrante'
      left join member_enrollment e on e.production_id = r.production_id and e.user_id = uid
     where r.id = rid
       and (e.user_id is null or (
             e.ingreso <= (r.inicia at time zone 'America/Mexico_City')::date
             and (e.baja_at is null or (r.inicia at time zone 'America/Mexico_City')::date < e.baja_at)))
       and (
         r.convocatoria = 'todos'
         or (r.convocatoria = 'grupos' and r.grupos && member_groups(r.production_id, uid))
         or (r.convocatoria = 'personas' and uid = any(r.personas))))
$$;

-- Advertencias por mensualidad: solo meses dentro de su periodo (ingreso → baja).
create or replace function discipline_scan_fees(pid text) returns int
language plpgsql security definer set search_path = public as $$
declare
  cfg production_discipline%rowtype; f production_fees%rowtype; r record; vencidos int; n int; hechas int := 0;
begin
  if not (can_manage_discipline(pid) or has_perm(pid, 'mensualidades.gestionar')) then raise exception 'No autorizado'; end if;
  select * into f from production_fees where production_id = pid;
  if not found then return 0; end if;
  select * into cfg from production_discipline where production_id = pid;
  if not found then cfg.auto_mensualidad_meses := 2; end if;
  if cfg.auto_mensualidad_meses is null then return 0; end if;
  for r in
    select m.user_id, coalesce(t.beca, false) as beca, coalesce(t.cuota_especial, f.monto) as debe,
           greatest(f.desde, date_trunc('month', coalesce(e.ingreso, f.desde))::date) as desde,
           least(f.hasta, coalesce(date_trunc('month', e.baja_at - 1)::date, f.hasta), date_trunc('month', current_date)::date) as hasta
      from production_members m
      left join member_fee_terms t on t.production_id = pid and t.user_id = m.user_id
      left join member_enrollment e on e.production_id = pid and e.user_id = m.user_id
     where m.production_id = pid and m.role_id = 'integrante'
  loop
    continue when r.beca or r.debe <= 0 or r.hasta < r.desde;
    select count(*) into vencidos
      from generate_series(r.desde, r.hasta, interval '1 month') g(periodo)
     where (g.periodo::date + (f.dia_limite - 1)) < current_date
       and coalesce((select sum(p.monto) from member_payments p
                      where p.production_id = pid and p.user_id = r.user_id and p.periodo = g.periodo::date), 0) < r.debe;
    for n in 1 .. (vencidos / cfg.auto_mensualidad_meses) loop
      insert into member_incidents (production_id, user_id, tipo, nivel, descripcion, origen, auto_key, created_by)
      values (pid, r.user_id, 'mensualidad', 'advertencia',
              format('Mensualidad: %s meses vencidos sin pagar.', n * cfg.auto_mensualidad_meses), 'auto', 'mensualidad:' || n, null)
      on conflict (production_id, user_id, auto_key) where auto_key is not null do nothing;
      if found then hechas := hechas + 1; end if;
    end loop;
  end loop;
  return hechas;
end $$;

-- Mis producciones: incluye ingreso y baja (para mostrar "te diste de baja").
create or replace function my_enrollments()
returns table (production_id text, ingreso date, baja_at date, baja_motivo text)
language sql stable security definer set search_path = public as $$
  select production_id, ingreso, baja_at, baja_motivo from member_enrollment where user_id = auth.uid()
$$;

-- Ficha de talento: marcar obras donde la persona se dio de baja.
create or replace function talent_enrollments(uid uuid)
returns table (production_id text, ingreso date, baja_at date, baja_motivo text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not can_view_talent(uid) then raise exception 'No autorizado'; end if;
  return query select e.production_id, e.ingreso, e.baja_at, e.baja_motivo from member_enrollment e where e.user_id = uid;
end $$;

revoke execute on function member_enrollment_on_join() from public, anon;
revoke execute on function can_manage_enrollment(text) from public, anon;
revoke execute on function member_withdraw(text, uuid, date, text) from public, anon;
revoke execute on function member_reactivate(text, uuid) from public, anon;
revoke execute on function member_set_ingreso(text, uuid, date) from public, anon;
revoke execute on function my_enrollments() from public, anon;
revoke execute on function talent_enrollments(uuid) from public, anon;
grant execute on function can_manage_enrollment(text), member_withdraw(text, uuid, date, text), member_reactivate(text, uuid),
  member_set_ingreso(text, uuid, date), my_enrollments(), talent_enrollments(uuid) to authenticated;

create trigger audit_member_enrollment after insert or update or delete on member_enrollment for each row execute function audit_row();


insert into supabase_migrations.schema_migrations (version, name)
values ('20261012070000', '0044_enrollment_series') on conflict do nothing;
commit;
select 'OK: 0044 aplicada en DARF 2.0 DEV' as resultado;
