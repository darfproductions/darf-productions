-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV" (la base de darfproductions.com).
-- 0112b: complemento de 0112 para la tabla de pagos de Cuotas (registrar pagos de quien aún no tiene cuenta).
-- Para bases que ya corrieron apply_0112_dev.sql antes de este cambio. Si la base no es DEV, aborta.
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
  if to_regclass('public.credit_characters') is null then
    raise exception 'ABORTADO: primero corre apply_0112_dev.sql.';
  end if;
end $$;
begin;

-- ════════ 6. Registrar pagos por ficha desde la tabla de Cuotas ════════
-- Para quien aún no tiene cuenta (los de cuenta se registran directo en member_payments).
create or replace function pago_ficha_registrar(pid text, p_person uuid, p_concepto text, p_periodo date, p_monto numeric, p_metodo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_perm(pid, 'mensualidades.gestionar') then raise exception 'No autorizado'; end if;
  if not exists (select 1 from production_credits where production_id = pid and person_id = p_person) then
    raise exception 'Esa persona no es de esta obra.';
  end if;
  insert into member_payments_ficha (production_id, person_id, concepto, periodo, monto, metodo, nota)
  values (pid, p_person, p_concepto, date_trunc('month', p_periodo)::date, p_monto, coalesce(p_metodo, 'otro'), 'Registrado en Cuotas')
  on conflict (production_id, person_id, concepto, periodo) do nothing;
end $$;
revoke all on function pago_ficha_registrar(text, uuid, text, date, numeric, text) from public, anon;
grant execute on function pago_ficha_registrar(text, uuid, text, date, numeric, text) to authenticated;

commit;

select 'Listo 0112b. Tabla de pagos activa.' as resultado;
