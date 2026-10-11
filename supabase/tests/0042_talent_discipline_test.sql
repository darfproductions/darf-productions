-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0031–0042 aplicadas.

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_admin@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_int1@test.local'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_int2@test.local'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_fan@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_prod@test.local'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_prodmm@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-0000000000a1';

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform panel_add_member('showman', 't_prod@test.local', 'productor');
  perform panel_add_member('mm', 't_prodmm@test.local', 'productor');
  perform panel_add_member('showman', 't_int1@test.local', 'integrante');
  perform panel_add_member('showman', 't_int2@test.local', 'integrante');
  perform panel_add_member('mm', 't_int1@test.local', 'integrante');
  reset role;
end $$;

-- Desde 0044 cuenta la fecha de ingreso: estas pruebas suponen que entraron hace tiempo.
do $$ begin
  if to_regclass('public.member_enrollment') is not null then
    execute 'update member_enrollment set ingreso = current_date - 365';
  end if;
end $$;

-- T1: expediente único: se llena una vez y lo ven las dos obras; cambiarlo regresa ambas a "por revisar"
do $$ declare n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  insert into person_files (user_id, emergencia_nombre, emergencia_telefono, alergias) values (auth.uid(), 'Mamá', '55', 'Ninguna');
  insert into member_files (production_id, user_id, confirmado_at, revisado_at) values ('showman', auth.uid(), now(), now());
  if (select revisado_at from member_files where production_id = 'showman' and user_id = auth.uid()) is not null then
    raise exception 'FALLO T1a: el integrante se marcó revisado';
  end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  update member_files set revisado_at = now(), confirmado_at = null where user_id = '00000000-0000-0000-0000-0000000000c1' and production_id = 'showman';
  if (select confirmado_at from member_files where user_id = '00000000-0000-0000-0000-0000000000c1' and production_id = 'showman') is null then
    raise exception 'FALLO T1b: la producción quitó la confirmación del integrante';
  end if;
  select count(*) into n from person_files where user_id = '00000000-0000-0000-0000-0000000000c1';
  if n <> 1 then raise exception 'FALLO T1c: la producción de Showman no ve el expediente'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
  select count(*) into n from person_files;
  if n <> 1 then raise exception 'FALLO T1d: la producción de Mamma Mia no ve el mismo expediente'; end if;
  select count(*) into n from person_files where user_id = '00000000-0000-0000-0000-0000000000c2';
  if n <> 0 then raise exception 'FALLO T1e: Mamma Mia ve a alguien que no es de su obra'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  update person_files set talla_ropa = 'M' where user_id = auth.uid();
  reset role;
  if (select revisado_at from member_files where user_id = '00000000-0000-0000-0000-0000000000c1' and production_id = 'showman') is not null then
    raise exception 'FALLO T1f: no volvió a por revisar';
  end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
  select count(*) into n from person_files;
  if n <> 0 then raise exception 'FALLO T1g: alguien fuera ve expedientes'; end if;
  reset role;
end $$;

-- T2: documentos dirigidos
do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  insert into member_doc_types (production_id, nombre, aplica, personas) values ('showman', 'Responsiva aéreo', 'personas', array['00000000-0000-0000-0000-0000000000c1'::uuid]);
  begin
    insert into member_doc_types (production_id, nombre, aplica) values ('showman', 'Sin grupo', 'grupo');
    raise exception 'FALLO T2: grupo sin elegir';
  exception when check_violation then null;
  end;
  reset role;
end $$;

-- T3: incidencias: notas internas no las ve el integrante; anular exige motivo; no se editan
do $$ declare n int; i uuid; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  insert into member_incidents (production_id, user_id, tipo, nivel, descripcion) values ('showman', '00000000-0000-0000-0000-0000000000c1', 'conducta', 'nota', 'Platicamos');
  insert into member_incidents (production_id, user_id, tipo, nivel, descripcion) values ('showman', '00000000-0000-0000-0000-0000000000c1', 'conducta', 'advertencia', 'Altercado') returning id into i;
  insert into member_incidents (production_id, user_id, tipo, nivel, descripcion) values ('showman', '00000000-0000-0000-0000-0000000000c1', 'retardo', 'grave', 'Llegó 1 hora tarde al general');
  begin
    update member_incidents set descripcion = 'otra' where id = i;
    raise exception 'FALLO T3: se editó una incidencia';
  exception when raise_exception then
    if sqlerrm not like 'Una incidencia no se edita%' then raise exception 'FALLO T3a: %', sqlerrm; end if;
  end;
  begin
    update member_incidents set anulada_at = now() where id = i;
    raise exception 'FALLO T3: anuló sin motivo';
  exception when check_violation then null;
  end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  select count(*) into n from member_incidents;
  if n <> 2 then raise exception 'FALLO T3b: el integrante ve % incidencias (no debe ver la nota)', n; end if;
  begin
    insert into member_incidents (production_id, user_id, tipo, nivel, descripcion) values ('showman', auth.uid(), 'otro', 'nota', 'x');
    raise exception 'FALLO T3: el integrante registró incidencias';
  exception when others then
    if sqlerrm not like '%row-level security%' then raise exception 'FALLO T3c: %', sqlerrm; end if;
  end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
  select count(*) into n from member_incidents;
  if n <> 0 then raise exception 'FALLO T3d: otra obra ve las incidencias'; end if;
  reset role;
end $$;

-- T4: límite y "requiere decisión"; advertencias automáticas por mensualidad sin repetir
do $$ declare n int; r record; esperadas int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  insert into production_discipline (production_id, limite_advertencias, auto_mensualidad_meses) values ('showman', 3, 2);
  insert into production_fees (production_id, monto, desde, hasta, dia_limite)
  values ('showman', 500, (date_trunc('month', current_date) - interval '5 months')::date, (date_trunc('month', current_date) + interval '2 months')::date, 28);
  insert into member_payments (production_id, user_id, periodo, monto)
  select 'showman', '00000000-0000-0000-0000-0000000000c2', g::date, 500
    from generate_series(date_trunc('month', current_date) - interval '5 months', date_trunc('month', current_date), interval '1 month') g;
  -- int1 debe los 5 meses anteriores (y el actual si ya pasó el día 28) → 1 advertencia por cada 2; int2 pagó todo → 0
  esperadas := (5 + case when extract(day from current_date) > 28 then 1 else 0 end) / 2;
  n := discipline_scan_fees('showman');
  if n <> esperadas then raise exception 'FALLO T4a: se crearon % advertencias automáticas (esperadas %)', n, esperadas; end if;
  n := discipline_scan_fees('showman');
  if n <> 0 then raise exception 'FALLO T4b: se repitieron las automáticas'; end if;
  select * into r from discipline_summary('showman') where user_id = '00000000-0000-0000-0000-0000000000c1';
  if r.advertencias <> 2 + esperadas or not r.requiere_decision then raise exception 'FALLO T4c: % advertencias, decisión %', r.advertencias, r.requiere_decision; end if;
  insert into member_measures (production_id, user_id, medida, descripcion) values ('showman', '00000000-0000-0000-0000-0000000000c1', 'aviso_tutor', 'Se habló con su mamá');
  select * into r from discipline_summary('showman') where user_id = '00000000-0000-0000-0000-0000000000c1';
  if r.requiere_decision then raise exception 'FALLO T4d: sigue requiriendo decisión tras registrar medida'; end if;
  reset role;
end $$;

-- T5: ficha de talento y unir fichas
do $$ declare h jsonb; a uuid; b uuid; n int; begin
  insert into people (nombre, profile_id) values ('Ana Paola Gonzalez', '00000000-0000-0000-0000-0000000000c1') returning id into a;
  insert into people (nombre) values ('Ana Paola González') returning id into b;
  insert into production_credits (production_id, person_id, tipo, papel) values ('showman', a, 'reparto', 'Jenny Lind');
  insert into production_credits (production_id, person_id, tipo, papel) values ('mm', b, 'ensamble', null);
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  begin
    perform people_merge(a, b);
    raise exception 'FALLO T5: unió fichas sin ser Director';
  exception when raise_exception then
    if sqlerrm not like 'Solo el Director%' then raise exception 'FALLO T5a: %', sqlerrm; end if;
  end;
  h := talent_history('00000000-0000-0000-0000-0000000000c1');
  if jsonb_array_length(h->'obras') <> 1 then raise exception 'FALLO T5b: obras antes de unir: %', h->'obras'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
  begin
    perform talent_history('00000000-0000-0000-0000-0000000000c1');
    raise exception 'FALLO T5: un fan vio la ficha de talento';
  exception when raise_exception then
    if sqlerrm not like 'No autorizado%' then raise exception 'FALLO T5c: %', sqlerrm; end if;
  end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  select count(*) into n from people_directory('gonzalez');
  if n < 2 then raise exception 'FALLO T5d: el buscador no encontró los duplicados'; end if;
  perform people_merge(a, b);
  h := talent_history('00000000-0000-0000-0000-0000000000c1');
  if jsonb_array_length(h->'obras') <> 2 then raise exception 'FALLO T5e: obras después de unir: %', h->'obras'; end if;
  reset role;
end $$;

do $$ begin raise exception 'OK: 0042 pruebas T1–T5 (se aborta a propósito para no persistir)'; end $$;
