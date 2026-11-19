-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0150 aplicadas. Hoy en la prueba se usa la fecha real; los meses probados (oct y nov 2026) ya pasaron su corte.
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000150c01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't150_cabeza@test.local'),
  ('00000000-0000-0000-0000-000000150c02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't150_cabeza2@test.local'),
  ('00000000-0000-0000-0000-000000150e01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't150_alumna@test.local'),
  ('00000000-0000-0000-0000-000000150e02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't150_profe@test.local');
insert into panel_roles (id, nombre, alcance, categoria) values ('t150_x', 'X', 'casa', 'casa');
insert into casa_members (user_id, role_id) values ('00000000-0000-0000-0000-000000150c01', 't150_x'), ('00000000-0000-0000-0000-000000150c02', 't150_x');
insert into casa_cargos (user_id, directivo) values ('00000000-0000-0000-0000-000000150c01', true), ('00000000-0000-0000-0000-000000150c02', true);
insert into productions (id, nombre, estado) values ('t150_g', 'Grease 150', 'borrador');
insert into production_fees (production_id, monto, desde, hasta) values ('t150_g', 1200, '2026-01-01', '2026-12-01');
insert into hon_config (vigente_desde) values ('2026-01-01') on conflict do nothing;
insert into hon_obras (production_id, mensual) values ('t150_g', true);
insert into people (id, nombre, profile_id) values ('00000000-0000-0000-0000-000000150f01', 'Profe 150', '00000000-0000-0000-0000-000000150e02');

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
create or replace function pg_temp.pago(f date, concepto text default 'mensualidad') returns uuid language sql as $$
  insert into member_payments (production_id, user_id, periodo, monto, concepto, fecha_pago)
  values ('t150_g', '00000000-0000-0000-0000-000000150e01', date_trunc('month', f)::date, 1200, concepto, f) returning id
$$;

do $$
declare p1 uuid; p2 uuid; p3 uuid; p4 uuid; p6 uuid; n int; ids text;
  res constant jsonb := '{"errores": [], "fondoAplicado": false, "totalPagado": 100, "reservaMes": 10}';
  per constant jsonb := '[{"person_id": "00000000-0000-0000-0000-000000150f01", "nombre": "Profe 150", "pago": 100, "bruto": 104.5, "partes": [{"bolsa": "compartida", "pct": 10, "base": 1045, "monto": 104.5}]}]';
begin
  -- Octubre: 2.º sábado el 10. Noviembre: el 14.
  p1 := pg_temp.pago('2026-10-05');
  p2 := pg_temp.pago('2026-10-20');
  p3 := pg_temp.pago('2026-11-14');
  p4 := pg_temp.pago('2026-11-15');
  perform pg_temp.pago('2026-11-01', 'inscripcion');

  -- T1: la ventana de noviembre (oct sin cerrar): del 11 de oct al 14 de nov; sin inscripciones.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000150c01');
  select string_agg(fecha_pago::text, ',' order by fecha_pago) into ids from hon_pagos_mes('2026-11-01');
  if ids <> '2026-10-20,2026-11-14' then raise exception 'FALLO T1: noviembre = %', ids; end if;
  select string_agg(fecha_pago::text, ',' order by fecha_pago) into ids from hon_pagos_mes('2026-10-01');
  if ids <> '2026-10-05' then raise exception 'FALLO T1: octubre = %', ids; end if;

  -- T2: cerrar octubre sella su pago; un pago tardío de octubre registrado después cuenta en noviembre.
  perform hon_cerrar_mes('2026-10-01', res, per);
  perform pg_temp.reset();
  if (select hon_mes from member_payments where id = p1) is distinct from '2026-10-01'::date then raise exception 'FALLO T2: no selló'; end if;
  p6 := pg_temp.pago('2026-10-07');
  perform pg_temp.as_user('00000000-0000-0000-0000-000000150c01');
  select string_agg(fecha_pago::text, ',' order by fecha_pago) into ids from hon_pagos_mes('2026-11-01');
  if ids <> '2026-10-07,2026-10-20,2026-11-14' then raise exception 'FALLO T2: tardío = %', ids; end if;
  select string_agg(fecha_pago::text, ',' order by fecha_pago) into ids from hon_pagos_mes('2026-10-01');
  if ids <> '2026-10-05' then raise exception 'FALLO T2: octubre cerrado cambió = %', ids; end if;

  -- T3: no se cierra dos veces, ni fuera de orden, ni antes del corte; el fondo necesita a todas las cabezas.
  begin perform hon_cerrar_mes('2026-10-01', res, per); raise exception 'FALLO T3: doble';
  exception when others then if sqlerrm not like 'Ese mes ya se cerró%' then raise; end if; end;
  begin perform hon_cerrar_mes('2026-12-01', res, per); raise exception 'FALLO T3: desorden o antes del corte';
  exception when others then if sqlerrm not like 'El mes se cierra a partir%' and sqlerrm not like 'Los meses se cierran en orden%' then raise; end if; end;
  perform hon_fondo_aprobar('2026-11-01', true);
  if hon_fondo_aprobado('2026-11-01') then raise exception 'FALLO T3: con una de dos cabezas'; end if;
  begin perform hon_cerrar_mes('2026-11-01', res || '{"fondoAplicado": true}', per); raise exception 'FALLO T3: fondo sin aprobar';
  exception when others then if sqlerrm not like 'El fondo común no está aprobado%' then raise; end if; end;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000150c02');
  perform hon_fondo_aprobar('2026-11-01', true);
  if not hon_fondo_aprobado('2026-11-01') then raise exception 'FALLO T3: con las dos'; end if;

  -- T4: emergencia por obra mientras el mes está abierto; cerrado, ya no.
  insert into hon_mes_obra (periodo, production_id, emergencia_uso) values ('2026-11-01', 't150_g', 800);
  perform hon_cerrar_mes('2026-11-01', res || '{"fondoAplicado": true}', per);
  begin
    update hon_mes_obra set emergencia_uso = 10 where periodo = '2026-11-01';
    get diagnostics n = row_count;
    if n > 0 then raise exception 'FALLO T4: editó un mes cerrado'; end if;
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  perform pg_temp.reset();
  if (select count(*) from member_payments where production_id = 't150_g' and hon_mes = '2026-11-01') <> 3 then raise exception 'FALLO T4: sellos de noviembre'; end if;
  if (select hon_mes from member_payments where id = p4) is not null then raise exception 'FALLO T4: selló un pago de diciembre'; end if;

  -- T5: un pago sellado no cambia de fecha.
  begin update member_payments set fecha_pago = '2026-10-01' where id = p2; raise exception 'FALLO T5: cambió fecha';
  exception when others then if sqlerrm not like 'Este pago ya contó%' then raise; end if; end;

  -- T6: cada quien ve su propio pago; otro no.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000150e02');
  if (select count(*) from hon_mes_personas) <> 2 then raise exception 'FALLO T6: no ve lo suyo'; end if;
  if exists (select 1 from hon_meses) then raise exception 'FALLO T6: ve el resumen'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000150e01');
  if exists (select 1 from hon_mes_personas) then raise exception 'FALLO T6: ve lo de otro'; end if;
  begin perform hon_pagos_mes('2026-11-01'); raise exception 'FALLO T6: alumna vio pagos';
  exception when others then if sqlerrm not like 'Solo las cabezas%' then raise; end if; end;
  perform pg_temp.reset();
  raise notice '0150 OK';
end $$;

rollback;
