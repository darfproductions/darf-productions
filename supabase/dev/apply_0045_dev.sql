-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV".
-- Aplica la migración 0045 (inscripción, taller sin pagos). Si la base no es DEV, aborta.
begin;
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
end $$;

alter table production_fees
  add column cobrar boolean not null default true,
  add column inscripcion numeric(10,2) not null default 0 check (inscripcion >= 0);

alter table member_payments
  add column concepto text not null default 'mensualidad' check (concepto in ('mensualidad', 'inscripcion'));

alter table member_fee_terms
  add column sin_inscripcion boolean not null default false;

-- Advertencias por mensualidad: solo pagos de mensualidad y solo si el taller cobra.
create or replace function discipline_scan_fees(pid text) returns int
language plpgsql security definer set search_path = public as $$
declare
  cfg production_discipline%rowtype; f production_fees%rowtype; r record; vencidos int; n int; hechas int := 0;
begin
  if not (can_manage_discipline(pid) or has_perm(pid, 'mensualidades.gestionar')) then raise exception 'No autorizado'; end if;
  select * into f from production_fees where production_id = pid;
  if not found or not f.cobrar or f.monto <= 0 then return 0; end if;
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
                      where p.production_id = pid and p.user_id = r.user_id and p.concepto = 'mensualidad'
                        and p.periodo = g.periodo::date), 0) < r.debe;
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


insert into supabase_migrations.schema_migrations (version, name)
values ('20261012080000', '0045_registration_fee') on conflict do nothing;
commit;
select 'OK: 0045 aplicada en DARF 2.0 DEV' as resultado;
