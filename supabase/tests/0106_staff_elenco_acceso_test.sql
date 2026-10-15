-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0106 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000e61', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't106_a@test.local'),
  ('00000000-0000-0000-0000-000000000e62', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't106_b@test.local');
insert into productions (id, nombre, estado) values ('t106_viva', 'Obra viva', 'borrador'), ('t106_vieja', 'Obra vieja', 'cancelada');
insert into people (id, nombre, profile_id) values
  ('00000000-0000-0000-0000-00000000e601', 'Ana Elenco', '00000000-0000-0000-0000-000000000e61'),
  ('00000000-0000-0000-0000-00000000e602', 'Beto Sin Cuenta', null),
  ('00000000-0000-0000-0000-00000000e603', 'Caro Staff', null);

-- T1: staff sin puesto se guarda; crew sin puesto no.
do $$ declare ok boolean; begin
  insert into production_credits (production_id, person_id, tipo) values ('t106_viva', '00000000-0000-0000-0000-00000000e603', 'staff');
  begin insert into production_credits (production_id, person_id, tipo) values ('t106_viva', '00000000-0000-0000-0000-00000000e603', 'crew'); ok := false;
  exception when check_violation then ok := true; end;
  if not ok then raise exception 'FALLO T1: crew sin puesto'; end if;
end $$;

-- T2: agregar a alguien con cuenta al ensamble de una obra viva lo hace integrante (con su alta).
do $$ begin
  insert into production_credits (production_id, person_id, tipo) values ('t106_viva', '00000000-0000-0000-0000-00000000e601', 'ensamble');
  if not exists (select 1 from production_members where production_id = 't106_viva' and user_id = '00000000-0000-0000-0000-000000000e61' and role_id = 'integrante') then
    raise exception 'FALLO T2: no quedó integrante';
  end if;
  if not exists (select 1 from member_enrollment where production_id = 't106_viva' and user_id = '00000000-0000-0000-0000-000000000e61') then
    raise exception 'FALLO T2: sin alta';
  end if;
end $$;

-- T3: en una obra cancelada (o archivada o concluida) no se da acceso.
do $$ begin
  insert into production_credits (production_id, person_id, tipo, papel) values ('t106_vieja', '00000000-0000-0000-0000-00000000e601', 'reparto', 'Brady');
  if exists (select 1 from production_members where production_id = 't106_vieja' and user_id = '00000000-0000-0000-0000-000000000e61') then
    raise exception 'FALLO T3';
  end if;
end $$;

-- T4: sin cuenta no pasa nada; al ligar su cuenta entra. Staff no entra como integrante.
do $$ begin
  insert into production_credits (production_id, person_id, tipo, papel) values ('t106_viva', '00000000-0000-0000-0000-00000000e602', 'reparto', 'Troy');
  update people set profile_id = '00000000-0000-0000-0000-000000000e62' where id = '00000000-0000-0000-0000-00000000e602';
  if not exists (select 1 from production_members where production_id = 't106_viva' and user_id = '00000000-0000-0000-0000-000000000e62' and role_id = 'integrante') then
    raise exception 'FALLO T4: al ligar';
  end if;
end $$;
do $$ begin
  -- Staff con cuenta: solo crédito, sin acceso de integrante.
  insert into auth.users (id, instance_id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000e63', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't106_c@test.local');
  update people set profile_id = '00000000-0000-0000-0000-000000000e63' where id = '00000000-0000-0000-0000-00000000e603';
  if exists (select 1 from production_members where production_id = 't106_viva' and user_id = '00000000-0000-0000-0000-000000000e63') then
    raise exception 'FALLO T4: staff dio acceso';
  end if;
end $$;

-- T5: gafete de quien solo es staff: franja staff, papel Staff.
do $$ declare j json; begin
  j := badge_papel('00000000-0000-0000-0000-000000000e63');
  if j->>'franja' <> 'staff' or j->>'papel' <> 'Staff' then raise exception 'FALLO T5: %', j; end if;
end $$;

select 'OK 0106 staff y acceso del elenco' as resultado;
