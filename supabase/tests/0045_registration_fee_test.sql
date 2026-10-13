-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0031–0045 aplicadas.

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_admin@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_int1@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-0000000000a1';

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

do $$ declare n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform panel_add_member('showman', 't_int1@test.local', 'integrante');
  perform member_set_ingreso('showman', '00000000-0000-0000-0000-0000000000c1', hoy_mx() - 365);
  insert into production_fees (production_id, monto, inscripcion, desde, hasta, dia_limite)
  values ('showman', 500, 800, (date_trunc('month', hoy_mx()) - interval '6 months')::date, (date_trunc('month', hoy_mx()) + interval '2 months')::date, 1);
  -- T1: el pago de inscripción no cuenta como mensualidad
  insert into member_payments (production_id, user_id, periodo, monto, concepto)
  select 'showman', '00000000-0000-0000-0000-0000000000c1', g::date, 500, 'inscripcion'
    from generate_series(date_trunc('month', hoy_mx()) - interval '6 months', date_trunc('month', hoy_mx()) - interval '1 month', interval '1 month') g;
  n := discipline_scan_fees('showman');
  if n < 1 then raise exception 'FALLO T1: pagos de inscripción contaron como mensualidades (% advertencias)', n; end if;
  begin
    insert into member_payments (production_id, user_id, periodo, monto, concepto) values ('showman', '00000000-0000-0000-0000-0000000000c1', date_trunc('month', hoy_mx())::date, 1, 'otro');
    raise exception 'FALLO T1b: aceptó un concepto inválido';
  exception when check_violation then null;
  end;
  -- T2: taller sin pagos: no hay advertencias por mensualidad
  update member_incidents set anulada_at = now(), anulada_motivo = 'prueba' where tipo = 'mensualidad';
  delete from member_incidents where tipo = 'mensualidad';
  update production_fees set cobrar = false where production_id = 'showman';
  n := discipline_scan_fees('showman');
  if n <> 0 then raise exception 'FALLO T2: taller sin pagos generó % advertencias', n; end if;
  -- T3: el integrante ve su "sin inscripción" pero no puede cambiarlo
  insert into member_fee_terms (production_id, user_id, sin_inscripcion) values ('showman', '00000000-0000-0000-0000-0000000000c1', true);
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  if not (select sin_inscripcion from member_fee_terms where user_id = auth.uid()) then raise exception 'FALLO T3a'; end if;
  update member_fee_terms set sin_inscripcion = false where user_id = auth.uid();
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO T3b: el integrante se quitó la inscripción'; end if;
  reset role;
end $$;

do $$ begin raise exception 'OK: 0045 pruebas T1–T3 (se aborta a propósito para no persistir)'; end $$;
