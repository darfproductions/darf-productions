-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0111 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't111_diego@test.local'),
  ('00000000-0000-0000-0000-000000000b02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't111_darf@test.local'),
  ('00000000-0000-0000-0000-000000000b03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't111_vacia@test.local'),
  ('00000000-0000-0000-0000-000000000b04', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't111_socia@test.local'),
  ('00000000-0000-0000-0000-000000000b05', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't111_elenco@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-000000000b02';
insert into fan_members (user_id) values ('00000000-0000-0000-0000-000000000b04'), ('00000000-0000-0000-0000-000000000b02');

create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create or replace function pg_temp.as_root() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

insert into productions (id, nombre, estado) values ('t111_vieja', 'Obra vieja 111', 'borrador');
insert into fan_encuentros (id, tipo, titulo, inicia, acceso, requiere_boleto) values
  ('00000000-0000-0000-0000-00000000b111', 'presencial', 'Convivencia 111', now() + interval '10 days', 'club', false);

-- T1: al ponerlo en Dirección general queda en las obras y eventos que ya existen.
do $$ begin
  insert into direccion_general_darf (user_id) values ('00000000-0000-0000-0000-000000000b01');
  if not exists (select 1 from production_members where production_id = 't111_vieja' and user_id = '00000000-0000-0000-0000-000000000b01' and role_id = 'direccion_general_darf') then
    raise exception 'FALLO T1: obra existente';
  end if;
  if not exists (select 1 from evento_equipo where encuentro_id = '00000000-0000-0000-0000-00000000b111' and user_id = '00000000-0000-0000-0000-000000000b01' and papel = 'organiza') then
    raise exception 'FALLO T1: evento existente';
  end if;
  if exists (select 1 from notifications where user_id = '00000000-0000-0000-0000-000000000b01' and tipo = 'equipo') then
    raise exception 'FALLO T1: le llegó bienvenida';
  end if;
  if (select nombre from panel_roles where id = 'direccion_general') <> 'Dirección de la obra'
     or (select nombre from panel_roles where id = 'direccion_general_darf') <> 'Dirección general' then
    raise exception 'FALLO T1: nombres de rol';
  end if;
end $$;

-- T2: obras y eventos nuevos lo agregan solo; duplicar con permisos no falla.
do $$ begin
  insert into productions (id, nombre, estado) values ('t111_nueva', 'Obra nueva 111', 'borrador');
  if not exists (select 1 from production_members where production_id = 't111_nueva' and user_id = '00000000-0000-0000-0000-000000000b01' and role_id = 'direccion_general_darf') then
    raise exception 'FALLO T2: obra nueva';
  end if;
  insert into fan_encuentros (id, tipo, titulo, inicia, acceso, requiere_boleto) values
    ('00000000-0000-0000-0000-00000000b112', 'presencial', 'Evento nuevo 111', now() + interval '20 days', 'publico', false);
  if not exists (select 1 from evento_equipo where encuentro_id = '00000000-0000-0000-0000-00000000b112' and user_id = '00000000-0000-0000-0000-000000000b01') then
    raise exception 'FALLO T2: evento nuevo';
  end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000b02');
  perform panel_duplicate_production('t111_nueva', 't111_copia', 'Copia 111', '2027', true, true, true);
  perform pg_temp.as_root();
  if (select count(*) from production_members where production_id = 't111_copia' and user_id = '00000000-0000-0000-0000-000000000b01') <> 1 then
    raise exception 'FALLO T2: duplicar';
  end if;
end $$;

-- T3: acceso total, sin citas a ensayos ni listas del equipo; solo avisos importantes.
do $$ declare r uuid; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000b01');
  if not has_perm('t111_vieja', 'permisos.gestionar') or not has_perm('t111_vieja', 'obra.publicar') then raise exception 'FALLO T3: acceso'; end if;
  if not exists (select 1 from my_panel_access() where production_id = 't111_vieja' and permission_id = 'reportes.ver') then raise exception 'FALLO T3: panel'; end if;
  perform pg_temp.as_root();
  if es_equipo('t111_vieja', '00000000-0000-0000-0000-000000000b01') then raise exception 'FALLO T3: es_equipo'; end if;
  insert into rehearsals (production_id, titulo, inicia, convocatoria, equipo_todos) values ('t111_vieja', 'Ensayo', now() + interval '2 days', 'todos', true) returning id into r;
  if rehearsal_cites(r, '00000000-0000-0000-0000-000000000b01') then raise exception 'FALLO T3: citado'; end if;
  if '00000000-0000-0000-0000-000000000b01' = any(team_recipients('t111_vieja', 'todos', '{}', '{}')) then raise exception 'FALLO T3: avisos de equipo'; end if;
  if not ('00000000-0000-0000-0000-000000000b01' = any(users_with_perm('t111_vieja', 'ventas.operar'))) then raise exception 'FALLO T3: órdenes'; end if;
  if '00000000-0000-0000-0000-000000000b01' = any(users_with_perm('t111_vieja', 'ensayos.gestionar')) then raise exception 'FALLO T3: avisos de ensayos'; end if;
  if lealtad_producciones('00000000-0000-0000-0000-000000000b01') < 3 then raise exception 'FALLO T3: Loyalty'; end if;
end $$;

-- T4: en Permisos no se quita ni se da a mano.
do $$ declare n int; ok boolean; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000b02');
  delete from production_members where production_id = 't111_vieja' and role_id = 'direccion_general_darf';
  get diagnostics n = row_count;
  begin
    insert into production_members (production_id, user_id, role_id) values ('t111_vieja', '00000000-0000-0000-0000-000000000b04', 'direccion_general_darf');
    ok := false;
  exception when others then ok := true;
  end;
  -- Tampoco con la función del panel (que no pasa por RLS).
  begin
    perform panel_add_member('t111_vieja', 't111_socia@test.local', 'direccion_general_darf');
    ok := false;
  exception when others then null;
  end;
  perform pg_temp.as_root();
  if n <> 0 then raise exception 'FALLO T4: se quitó'; end if;
  if not ok then raise exception 'FALLO T4: se dio'; end if;
end $$;

-- T5: cuenta de la empresa: sale del Club, sin credencial, fuera del Directorio y de listas; sigue admin.
do $$ declare ok boolean; begin
  insert into badges (user_id, token, codigo) values ('00000000-0000-0000-0000-000000000b02', badge_nuevo_token(), badge_nuevo_codigo()) on conflict do nothing;
  insert into cuentas_empresa (user_id) values ('00000000-0000-0000-0000-000000000b02');
  if exists (select 1 from fan_members where user_id = '00000000-0000-0000-0000-000000000b02')
     or exists (select 1 from badges where user_id = '00000000-0000-0000-0000-000000000b02') then
    raise exception 'FALLO T5: limpieza';
  end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000b02');
  begin perform fan_join(); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T5: se unió al club'; end if;
  if is_fan_member() then raise exception 'FALLO T5: socio'; end if;
  if credencial_mia() is not null then raise exception 'FALLO T5: credencial'; end if;
  if exists (select 1 from admin_list_users(null) where id = '00000000-0000-0000-0000-000000000b02') then raise exception 'FALLO T5: Directorio'; end if;
  if not is_admin() then raise exception 'FALLO T5: dejó de ser admin'; end if;
  perform pg_temp.as_root();
  if is_team(null, '00000000-0000-0000-0000-000000000b02') then raise exception 'FALLO T5: equipo'; end if;
end $$;

-- T6: borrar cuentas vacías: la vacía sí; la socia del club no; solo el admin.
do $$ declare ok boolean; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000b04');
  begin perform admin_borrar_cuenta('00000000-0000-0000-0000-000000000b03'); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T6: borró sin ser admin'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000b02');
  if not exists (select 1 from cuentas_vacias() where id = '00000000-0000-0000-0000-000000000b03') then raise exception 'FALLO T6: lista'; end if;
  if exists (select 1 from cuentas_vacias() where id = '00000000-0000-0000-0000-000000000b04') then raise exception 'FALLO T6: socia en la lista'; end if;
  begin perform admin_borrar_cuenta('00000000-0000-0000-0000-000000000b04'); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T6: borró una cuenta con datos'; end if;
  perform admin_borrar_cuenta('00000000-0000-0000-0000-000000000b03');
  perform pg_temp.as_root();
  if exists (select 1 from auth.users where id = '00000000-0000-0000-0000-000000000b03') then raise exception 'FALLO T6: no se borró'; end if;
  if not exists (select 1 from audit_log where tabla = 'cuentas' and registro_id = '00000000-0000-0000-0000-000000000b03') then raise exception 'FALLO T6: bitácora'; end if;
end $$;

-- T7: pagos por ficha pasan al ligar la cuenta, sin avisos, con su alta y beca; vencimiento segundo sábado.
do $$ declare n int; f production_fees; begin
  insert into production_fees (production_id, monto, desde, hasta, inscripcion, vence_sabado) values ('t111_vieja', 600, '2026-09-01', '2026-12-01', 600, true);
  insert into people (id, nombre) values ('00000000-0000-0000-0000-00000000b501', 'Eli Elenco');
  insert into production_credits (production_id, person_id, tipo, papel) values ('t111_vieja', '00000000-0000-0000-0000-00000000b501', 'ensamble', null);
  insert into ficha_cuotas (production_id, person_id, ingreso) values ('t111_vieja', '00000000-0000-0000-0000-00000000b501', '2026-08-22');
  insert into member_payments_ficha (production_id, person_id, concepto, periodo, monto, pagado_at) values
    ('t111_vieja', '00000000-0000-0000-0000-00000000b501', 'inscripcion', '2026-08-01', 600, '2026-08-22 16:00+00'),
    ('t111_vieja', '00000000-0000-0000-0000-00000000b501', 'mensualidad', '2026-09-01', 600, '2026-09-05 16:00+00');
  update people set profile_id = '00000000-0000-0000-0000-000000000b05' where id = '00000000-0000-0000-0000-00000000b501';
  select count(*) into n from member_payments where production_id = 't111_vieja' and user_id = '00000000-0000-0000-0000-000000000b05';
  if n <> 2 then raise exception 'FALLO T7: pasaron %', n; end if;
  if exists (select 1 from member_payments_ficha where person_id = '00000000-0000-0000-0000-00000000b501') then raise exception 'FALLO T7: quedó en la ficha'; end if;
  if exists (select 1 from notifications where user_id = '00000000-0000-0000-0000-000000000b05' and tipo = 'pago') then raise exception 'FALLO T7: avisó'; end if;
  if (select ingreso from member_enrollment where production_id = 't111_vieja' and user_id = '00000000-0000-0000-0000-000000000b05') <> '2026-08-22' then
    raise exception 'FALLO T7: ingreso';
  end if;
  select * into f from production_fees where production_id = 't111_vieja';
  if fee_limite(f, '2026-10-01') <> '2026-10-10' or fee_limite(f, '2026-11-01') <> '2026-11-14' or fee_limite(f, '2026-08-01') <> '2026-08-08' then
    raise exception 'FALLO T7: segundo sábado % %', fee_limite(f, '2026-10-01'), fee_limite(f, '2026-11-01');
  end if;
  -- Un pago nuevo (no de ficha) sí avisa.
  insert into member_payments (production_id, user_id, periodo, monto, metodo, concepto) values ('t111_vieja', '00000000-0000-0000-0000-000000000b05', '2026-10-01', 600, 'efectivo', 'mensualidad');
  if not exists (select 1 from notifications where user_id = '00000000-0000-0000-0000-000000000b05' and tipo = 'pago') then raise exception 'FALLO T7: pago nuevo sin aviso'; end if;
end $$;

-- T8: quitarlo de la tabla lo quita de las obras.
do $$ begin
  delete from direccion_general_darf where user_id = '00000000-0000-0000-0000-000000000b01';
  if exists (select 1 from production_members where user_id = '00000000-0000-0000-0000-000000000b01' and role_id = 'direccion_general_darf') then
    raise exception 'FALLO T8';
  end if;
end $$;
