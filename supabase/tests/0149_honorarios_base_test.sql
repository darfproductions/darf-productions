-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0149 aplicadas.
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000149a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't149_dir@test.local'),
  ('00000000-0000-0000-0000-000000149c01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't149_cabeza@test.local'),
  ('00000000-0000-0000-0000-000000149c02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't149_rh@test.local'),
  ('00000000-0000-0000-0000-000000149c03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't149_casa@test.local'),
  ('00000000-0000-0000-0000-000000149e01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't149_alumna@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-000000149a01';
insert into panel_roles (id, nombre, alcance, categoria) values ('t149_rh', 'RH (prueba)', 'casa', 'casa'), ('t149_x', 'Otro (prueba)', 'casa', 'casa');
insert into role_permissions (role_id, permission_id) values ('t149_rh', 'casa.recargos'), ('t149_x', 'casa.sitio');
insert into casa_members (user_id, role_id) values
  ('00000000-0000-0000-0000-000000149c01', 't149_x'), ('00000000-0000-0000-0000-000000149c02', 't149_rh'), ('00000000-0000-0000-0000-000000149c03', 't149_x');
insert into casa_cargos (user_id, directivo) values ('00000000-0000-0000-0000-000000149c01', true);
insert into productions (id, nombre, estado) values ('t149_g', 'Grease 149', 'borrador'), ('t149_s', 'Showman 149', 'borrador');
insert into production_fees (production_id, monto, desde, hasta) values ('t149_g', 1200, '2026-01-01', '2026-12-01');
insert into people (id, nombre) values ('00000000-0000-0000-0000-000000149f01', 'Persona Uno 149'), ('00000000-0000-0000-0000-000000149f02', 'Alumna sin cuenta 149');

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create or replace function pg_temp.reset() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

do $$
declare n int; p member_payments; f member_payments_ficha; pf uuid := '00000000-0000-0000-0000-000000149f01';
begin
  -- T1: solo las cabezas configuran; Casa DARF sin ser cabeza no ve nada.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000149c01');
  if not hon_cabeza() then raise exception 'FALLO T1: cabeza'; end if;
  insert into hon_config (vigente_desde) values ('2026-01-01');
  insert into hon_obras (production_id, mensual) values ('t149_g', true);
  insert into hon_obras (production_id, mensual, cierre_empresa_pct, cierre_creativos_pct, cierre_compartida_pct, cierre_casa_pct) values ('t149_s', false, 40, 45, 0, 15);
  perform pg_temp.as_user('00000000-0000-0000-0000-000000149c03');
  if hon_cabeza() then raise exception 'FALLO T1: Casa DARF no cabeza'; end if;
  select count(*) into n from hon_config;
  if n <> 0 then raise exception 'FALLO T1: no cabeza ve la configuración'; end if;
  begin
    perform hon_asignacion_guardar('creativa:t149_g', pf, 'Dirección', 29, '2026-01-01');
    raise exception 'FALLO T1: no cabeza asignó';
  exception when others then if sqlerrm not like 'Solo las cabezas%' then raise; end if; end;

  -- T2: historial de asignaciones: cambiar el % cierra la anterior.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000149c01');
  perform hon_asignacion_guardar('creativa:t149_g', pf, 'Dirección', 29, '2026-01-01');
  perform hon_asignacion_guardar('creativa:t149_g', pf, 'Dirección', 30, '2026-06-01');
  -- 0151: las compartidas tienen id (compartida:<id>); antes de 0151 era 'compartida'.
  if to_regclass('hon_compartidas') is not null then
    execute 'insert into hon_compartidas (id, nombre) values (''00000000-0000-0000-0000-000000149c99'', ''C149'')';
    perform hon_asignacion_guardar('compartida:00000000-0000-0000-0000-000000149c99', pf, null, 9, '2026-01-01');
    perform hon_asignacion_guardar('compartida:00000000-0000-0000-0000-000000149c99', pf, null, null, '2026-03-01');
  else
    perform hon_asignacion_guardar('compartida', pf, null, 9, '2026-01-01');
    perform hon_asignacion_guardar('compartida', pf, null, null, '2026-03-01');
  end if;
  perform pg_temp.reset();
  if (select string_agg(pct::text || ':' || desde || ':' || coalesce(hasta::text, '-'), ' ' order by bolsa, desde) from hon_asignaciones where person_id = pf)
     <> '9.0000:2026-01-01:2026-03-01 29.0000:2026-01-01:2026-06-01 30.0000:2026-06-01:-' then
    raise exception 'FALLO T2: historial %', (select string_agg(pct::text || ':' || desde || ':' || coalesce(hasta::text, '-'), ' ' order by bolsa, desde) from hon_asignaciones where person_id = pf);
  end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000149c01');
  begin
    perform hon_asignacion_guardar('creativa:t149_g', pf, null, 31, '2026-05-01');
    raise exception 'FALLO T2: fecha anterior';
  exception when others then if sqlerrm not like 'La fecha no puede ser anterior%' then raise; end if; end;
  begin
    perform hon_asignacion_guardar('creativa:t149_x', pf, null, 10, '2026-07-01');
    raise exception 'FALLO T2: obra fuera del módulo';
  exception when others then if sqlerrm not like 'Esa obra no está%' then raise; end if; end;
  perform pg_temp.reset();

  -- T3: recargo. Noviembre 2026: el 2.º sábado es el 14.
  insert into member_payments (production_id, user_id, periodo, monto, concepto, fecha_pago)
    values ('t149_g', '00000000-0000-0000-0000-000000149e01', '2026-11-01', 1200, 'mensualidad', '2026-11-14') returning * into p;
  if p.recargo <> 0 then raise exception 'FALLO T3: a tiempo con recargo'; end if;
  insert into member_payments (production_id, user_id, periodo, monto, concepto, fecha_pago)
    values ('t149_g', '00000000-0000-0000-0000-000000149e01', '2026-10-01', 1200, 'mensualidad', '2026-11-03') returning * into p;
  if p.recargo <> 200 then raise exception 'FALLO T3: tarde sin recargo (%)', p.recargo; end if;
  insert into member_payments (production_id, user_id, periodo, monto, concepto, fecha_pago)
    values ('t149_g', '00000000-0000-0000-0000-000000149e01', '2026-09-01', 700, 'inscripcion', '2026-11-03') returning * into p;
  if p.recargo <> 0 then raise exception 'FALLO T3: inscripción con recargo'; end if;
  insert into member_payments_ficha (production_id, person_id, concepto, periodo, monto, fecha_pago)
    values ('t149_g', '00000000-0000-0000-0000-000000149f02', 'mensualidad', '2026-10-01', 1200, '2026-10-20') returning * into f;
  if f.recargo <> 200 then raise exception 'FALLO T3: ficha tarde sin recargo'; end if;
  begin
    insert into member_payments (production_id, user_id, periodo, monto, concepto, fecha_pago)
      values ('t149_g', '00000000-0000-0000-0000-000000149e01', '2026-12-01', 1200, 'mensualidad', hoy_mx() + 3);
    raise exception 'FALLO T3: fecha futura';
  exception when others then if sqlerrm not like 'La fecha de pago no puede ser futura%' then raise; end if; end;

  -- T4: perdonar: RH (casa.recargos) sí; otro de Casa DARF no.
  select * into p from member_payments where production_id = 't149_g' and periodo = '2026-10-01';
  perform pg_temp.as_user('00000000-0000-0000-0000-000000149c03');
  begin
    perform hon_recargo_perdonar('cuenta', p.id, true);
    raise exception 'FALLO T4: Casa DARF perdonó';
  exception when others then if sqlerrm not like 'No tienes permiso%' then raise; end if; end;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000149c02');
  perform hon_recargo_perdonar('cuenta', p.id, true);
  perform hon_recargo_perdonar('ficha', f.id, true);
  perform pg_temp.reset();
  if (select recargo_perdonado_por from member_payments where id = p.id) is distinct from '00000000-0000-0000-0000-000000149c02'::uuid then raise exception 'FALLO T4: no quedó quién perdonó'; end if;

  -- T5: una obra que no está en el módulo nunca lleva recargo.
  insert into member_payments (production_id, user_id, periodo, monto, concepto, fecha_pago)
    values ('t149_s', '00000000-0000-0000-0000-000000149e01', '2026-01-01', 500, 'mensualidad', '2026-11-03') returning * into p;
  if p.recargo <> 0 then raise exception 'FALLO T5: recargo fuera del módulo'; end if;
  raise notice '0149 OK';
end $$;

rollback;
