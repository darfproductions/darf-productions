-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0031–0041 aplicadas.
-- Desde 0042 los datos del expediente viven en person_files; las reglas que aquí se prueban
-- (privacidad, revisado, documentos, mensualidades) se prueban en 0042–0044 con el modelo nuevo.
do $$ begin
  if to_regclass('public.person_files') is not null then
    raise exception 'OK: 0041 reemplazada por 0042 (ver 0042_talent_discipline_test.sql y 0044)';
  end if;
end $$;

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_admin@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_int1@test.local'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_int2@test.local'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_fan@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_prod@test.local'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_dir@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-0000000000a1';

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create temp table ctx (doc uuid, menores uuid);
grant all on ctx to authenticated, anon;

do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform panel_add_member('showman', 't_prod@test.local', 'productor');
  perform panel_add_member('showman', 't_dir@test.local', 'direccion');
  perform panel_add_member('showman', 't_int1@test.local', 'integrante');
  perform panel_add_member('showman', 't_int2@test.local', 'integrante');
  reset role;
end $$;

-- T1: cada integrante llena el suyo; no puede marcarse revisado ni darse beca; no ve el de otros
do $$ declare n int; v member_files%rowtype; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  insert into member_files (production_id, user_id, emergencia_nombre, emergencia_telefono, alergias, revisado_at)
  values ('showman', auth.uid(), 'Mamá', '5511', 'Nueces', now());
  select * into v from member_files where production_id = 'showman' and user_id = auth.uid();
  if v.revisado_at is not null then raise exception 'FALLO T1a: el integrante se marcó revisado'; end if;
  begin
    insert into member_fee_terms (production_id, user_id, beca) values ('showman', auth.uid(), true);
    raise exception 'FALLO T1: el integrante se dio beca';
  exception when others then
    if sqlerrm not like '%row-level security%' then raise exception 'FALLO T1e: %', sqlerrm; end if;
  end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
  insert into member_files (production_id, user_id, emergencia_nombre) values ('showman', auth.uid(), 'Papá');
  select count(*) into n from member_files;
  if n <> 1 then raise exception 'FALLO T1b: int2 ve % expedientes', n; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
  begin
    insert into member_files (production_id, user_id) values ('showman', auth.uid());
    raise exception 'FALLO T1: alguien fuera del elenco creó expediente';
  exception when others then
    if sqlerrm not like '%row-level security%' then raise exception 'FALLO T1c: %', sqlerrm; end if;
  end;
  -- Dirección artística no tiene expedientes.ver: no ve datos de salud
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
  select count(*) into n from member_files;
  if n <> 0 then raise exception 'FALLO T1d: Dirección artística ve expedientes'; end if;
  reset role;
end $$;

-- T2: la producción revisa; si el integrante cambia algo, vuelve a "por revisar"; beca solo producción
do $$ declare v member_files%rowtype; n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  update member_files set revisado_at = now(), revisado_por = auth.uid() where user_id = '00000000-0000-0000-0000-0000000000c1';
  insert into member_fee_terms (production_id, user_id, beca) values ('showman', '00000000-0000-0000-0000-0000000000c1', true);
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  select * into v from member_files where user_id = auth.uid();
  if v.revisado_at is null then raise exception 'FALLO T2a: no quedó revisado'; end if;
  update member_files set talla_ropa = 'M' where user_id = auth.uid();
  select * into v from member_files where user_id = auth.uid();
  if v.revisado_at is not null then raise exception 'FALLO T2b: no volvió a por revisar'; end if;
  update member_fee_terms set beca = false where user_id = auth.uid();
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO T2c: el integrante se quitó la beca'; end if;
  if not (select beca from member_fee_terms where user_id = auth.uid()) then raise exception 'FALLO T2d: el integrante no ve su beca'; end if;
  reset role;
end $$;

-- T3: documentos: el integrante sube su archivo; "entregado" solo lo marca la producción
do $$ declare d uuid; m uuid; v member_docs%rowtype; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  insert into member_doc_types (production_id, nombre) values ('showman', 'Reglamento firmado') returning id into d;
  insert into member_doc_types (production_id, nombre, solo_menores) values ('showman', 'Permiso de menores', true) returning id into m;
  insert into ctx values (d, m);
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  insert into member_docs (doc_type_id, production_id, user_id, archivo_path, subido_at, entregado_at)
  values (d, 'showman', auth.uid(), 'showman/00000000-0000-0000-0000-0000000000c1/reglamento.pdf', now(), now());
  select * into v from member_docs where doc_type_id = d and user_id = auth.uid();
  if v.entregado_at is not null then raise exception 'FALLO T3a: el integrante se marcó entregado'; end if;
  begin
    insert into member_docs (doc_type_id, production_id, user_id, archivo_path)
    values (m, 'showman', auth.uid(), 'showman/00000000-0000-0000-0000-0000000000c2/x.pdf');
    raise exception 'FALLO T3: archivo en carpeta ajena';
  exception when raise_exception then
    if sqlerrm not like 'Archivo no válido%' then raise exception 'FALLO T3b: %', sqlerrm; end if;
  end;
  if not can_use_member_object('showman/00000000-0000-0000-0000-0000000000c1/reglamento.pdf') then raise exception 'FALLO T3c'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
  if can_use_member_object('showman/00000000-0000-0000-0000-0000000000c1/reglamento.pdf') then raise exception 'FALLO T3d: int2 abre archivo de int1'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  if not can_use_member_object('showman/00000000-0000-0000-0000-0000000000c1/reglamento.pdf') then raise exception 'FALLO T3e: producción no abre el archivo'; end if;
  update member_docs set entregado_at = now(), recibido_por = auth.uid() where doc_type_id = d;
  if (select entregado_at from member_docs where doc_type_id = d) is null then raise exception 'FALLO T3f: producción no marcó entregado'; end if;
  reset role;
end $$;

-- T4: mensualidades: la producción registra; cada integrante ve solo lo suyo y no puede registrar
do $$ declare n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
  begin
    insert into production_fees (production_id, monto, desde, hasta) values ('showman', 500, '2026-09-01', '2027-03-01');
    raise exception 'FALLO T4: Dirección artística definió mensualidad';
  exception when others then
    if sqlerrm not like '%row-level security%' then raise exception 'FALLO T4a: %', sqlerrm; end if;
  end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  insert into production_fees (production_id, monto, desde, hasta) values ('showman', 500, '2026-09-01', '2027-03-01');
  insert into member_payments (production_id, user_id, periodo, monto) values ('showman', '00000000-0000-0000-0000-0000000000c1', '2026-09-01', 500);
  insert into member_payments (production_id, user_id, periodo, monto, metodo) values ('showman', '00000000-0000-0000-0000-0000000000c2', '2026-09-01', 500, 'transferencia');
  begin
    insert into member_payments (production_id, user_id, periodo, monto) values ('showman', '00000000-0000-0000-0000-0000000000c1', '2026-09-15', 500);
    raise exception 'FALLO T4: periodo que no es día 1';
  exception when check_violation then null;
  end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  select count(*) into n from member_payments;
  if n <> 1 then raise exception 'FALLO T4b: int1 ve % pagos', n; end if;
  select count(*) into n from production_fees where production_id = 'showman';
  if n <> 1 then raise exception 'FALLO T4c: int1 no ve la mensualidad de su obra'; end if;
  begin
    insert into member_payments (production_id, user_id, periodo, monto) values ('showman', auth.uid(), '2026-10-01', 500);
    raise exception 'FALLO T4: el integrante registró su propio pago';
  exception when others then
    if sqlerrm not like '%row-level security%' then raise exception 'FALLO T4d: %', sqlerrm; end if;
  end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
  select count(*) into n from production_fees;
  if n <> 0 then raise exception 'FALLO T4e: alguien fuera del elenco ve mensualidades'; end if;
  reset role;
  select count(*) into n from audit_log where tabla = 'member_payments';
  if n < 2 then raise exception 'FALLO T4f: la bitácora no registró los pagos'; end if;
end $$;

-- T5: lista del elenco y mis producciones
do $$ declare n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  select count(*) into n from cast_roster('showman');
  if n <> 2 then raise exception 'FALLO T5a: la lista trae % integrantes', n; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  begin
    perform cast_roster('showman');
    raise exception 'FALLO T5: un integrante vio la lista con correos';
  exception when raise_exception then
    if sqlerrm not like 'No autorizado%' then raise exception 'FALLO T5b: %', sqlerrm; end if;
  end;
  select count(*) into n from my_productions() where production_id = 'showman';
  if n <> 1 then raise exception 'FALLO T5c: Mis producciones no muestra la obra'; end if;
  reset role;
end $$;

-- T6: quien solo maneja mensualidades (rol personalizado) ve pagos pero NO datos de salud
do $$ declare n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  insert into panel_roles (id, nombre) values ('t_cobranza', 'Cobranza');
  insert into role_permissions (role_id, permission_id) values ('t_cobranza', 'mensualidades.gestionar');
  perform panel_add_member('showman', 't_fan@test.local', 't_cobranza');
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
  select count(*) into n from member_files;
  if n <> 0 then raise exception 'FALLO T6a: cobranza ve datos de salud'; end if;
  select count(*) into n from member_payments;
  if n <> 2 then raise exception 'FALLO T6b: cobranza ve % pagos', n; end if;
  reset role;
end $$;

do $$ begin raise exception 'OK: 0041 pruebas T1–T6 (se aborta a propósito para no persistir)'; end $$;
