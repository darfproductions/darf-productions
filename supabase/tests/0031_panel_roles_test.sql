-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0029, 0030 y 0031 aplicadas.

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_admin@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_fan1@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_prod@test.local'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_juez@test.local'),
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_staff@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-0000000000a1';
update profiles set rol = 'staff' where id = '00000000-0000-0000-0000-0000000000f1';

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- El Director nombra a la productora de mm y a un juez de mm.
do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform panel_add_member('mm', 'T_PROD@test.local', 'productor');
  perform panel_add_member('mm', 't_juez@test.local', 'juez');
  reset role;
end $$;

-- T1: un fan no tiene permisos ni ve miembros
do $$ declare n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  if has_perm('mm', 'obra.ver') then raise exception 'FALLO T1: fan con obra.ver'; end if;
  select count(*) into n from production_members;
  if n <> 0 then raise exception 'FALLO T1: fan ve % miembros', n; end if;
  select count(*) into n from my_panel_access();
  if n <> 0 then raise exception 'FALLO T1: fan con accesos'; end if;
  reset role;
end $$;

-- T2: la productora de mm gestiona mm, no hsm
do $$ declare n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  if not has_perm('mm', 'mensualidades.gestionar') then raise exception 'FALLO T2: productora sin permisos completos'; end if;
  if has_perm('hsm', 'obra.ver') then raise exception 'FALLO T2: productora ve hsm'; end if;
  perform panel_add_member('mm', 't_fan1@test.local', 'taquilla');
  select count(*) into n from panel_list_members('mm');
  if n <> 3 then raise exception 'FALLO T2: % miembros en mm', n; end if;
  delete from production_members where production_id = 'mm' and role_id = 'taquilla';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALLO T2: no pudo quitar'; end if;
  begin
    perform panel_add_member('hsm', 't_fan1@test.local', 'taquilla');
    raise exception 'FALLO T2: agregó en hsm';
  exception when raise_exception then
    if sqlerrm not like 'No tienes permiso%' then raise exception 'FALLO T2: %', sqlerrm; end if;
  end;
  begin
    insert into production_members (production_id, user_id, role_id)
    values ('hsm', '00000000-0000-0000-0000-0000000000c1', 'taquilla');
    raise exception 'FALLO T2: insertó directo en hsm';
  exception when others then
    if sqlerrm not like '%row-level security%' then raise exception 'FALLO T2b: %', sqlerrm; end if;
  end;
  begin
    perform panel_add_member('mm', 'nadie@test.local', 'taquilla');
    raise exception 'FALLO T2: agregó correo sin cuenta';
  exception when raise_exception then
    if sqlerrm not like 'Esa persona aún no tiene cuenta%' then raise exception 'FALLO T2c: %', sqlerrm; end if;
  end;
  reset role;
end $$;

-- T3: un juez solo evalúa
do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
  if not has_perm('mm', 'audiciones.evaluar') then raise exception 'FALLO T3: juez sin evaluar'; end if;
  if has_perm('mm', 'ventas.ver') or has_perm('mm', 'permisos.gestionar') then raise exception 'FALLO T3: juez de más'; end if;
  begin
    perform panel_add_member('mm', 't_fan1@test.local', 'productor');
    raise exception 'FALLO T3: juez dio roles';
  exception when raise_exception then
    if sqlerrm not like 'No tienes permiso%' then raise exception 'FALLO T3: %', sqlerrm; end if;
  end;
  begin
    perform panel_list_members('mm');
    raise exception 'FALLO T3: juez lista miembros';
  exception when raise_exception then
    if sqlerrm not like 'No tienes acceso%' then raise exception 'FALLO T3b: %', sqlerrm; end if;
  end;
  reset role;
end $$;

-- T4: staff global conserva lo de la 1.0 (ver ventas, puerta) y nada más
do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
  -- Desde 0034 (decisión de Johann): staff = lo mismo que hoy en la 1.0 (ver ventas y puerta), sin operar ventas.
  if not (has_perm('hsm', 'ventas.ver') and has_perm('showman', 'puerta.validar')) then raise exception 'FALLO T4: staff perdió 1.0'; end if;
  if has_perm('mm', 'obra.editar') or has_perm('mm', 'permisos.gestionar') or has_perm('mm', 'ventas.operar') then raise exception 'FALLO T4: staff ganó de más'; end if;
  reset role;
end $$;

-- T5: rol personalizado "Vestuario" da exactamente sus permisos
do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  insert into panel_roles (id, nombre, descripcion) values ('vestuario', 'Vestuario', 'Medidas y materiales');
  insert into role_permissions (role_id, permission_id) values ('vestuario', 'obra.ver'), ('vestuario', 'expedientes.ver');
  perform panel_add_member('hsm', 't_fan1@test.local', 'vestuario');
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  if not has_perm('hsm', 'expedientes.ver') then raise exception 'FALLO T5: sin su permiso'; end if;
  if has_perm('hsm', 'mensualidades.gestionar') or has_perm('mm', 'obra.ver') then raise exception 'FALLO T5: de más'; end if;
  reset role;
end $$;

-- T6: roles de sistema intocables; un no-Director no crea roles
do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  begin
    insert into role_permissions (role_id, permission_id) values ('juez', 'ventas.ver');
    raise exception 'FALLO T6: cambió rol de sistema';
  exception when raise_exception then
    if sqlerrm not like 'Los permisos de un rol de sistema%' then raise exception 'FALLO T6: %', sqlerrm; end if;
  end;
  begin
    update panel_roles set nombre = 'X' where id = 'taquilla';
    raise exception 'FALLO T6: renombró rol de sistema';
  exception when raise_exception then
    if sqlerrm not like '%es de sistema%' then raise exception 'FALLO T6b: %', sqlerrm; end if;
  end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  begin
    insert into panel_roles (id, nombre) values ('hack', 'Hack');
    raise exception 'FALLO T6: productora creó rol';
  exception when others then
    if sqlerrm not like '%row-level security%' then raise exception 'FALLO T6c: %', sqlerrm; end if;
  end;
  reset role;
end $$;

-- T7: bitácora registra y solo la lee el Director; siempre queda un Director
do $$ declare n int; begin
  select count(*) into n from audit_log where tabla = 'production_members' and production_id = 'mm';
  if n < 4 then raise exception 'FALLO T7: bitácora con % registros de mm', n; end if;
  if not exists (select 1 from audit_log where tabla = 'panel_roles' and registro_id = 'vestuario') then
    raise exception 'FALLO T7: no registró el rol nuevo';
  end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  select count(*) into n from audit_log;
  if n <> 0 then raise exception 'FALLO T7: fan lee bitácora'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  select count(*) into n from audit_log;
  if n = 0 then raise exception 'FALLO T7: Director no lee bitácora'; end if;
  reset role;
  update profiles set rol = 'fan' where rol = 'admin' and id <> '00000000-0000-0000-0000-0000000000a1';
  begin
    update profiles set rol = 'fan' where id = '00000000-0000-0000-0000-0000000000a1';
    raise exception 'FALLO T7: se quedó sin Director';
  exception when raise_exception then
    if sqlerrm not like 'Debe quedar al menos un Director%' then raise exception 'FALLO T7b: %', sqlerrm; end if;
  end;
end $$;

-- T8: solo el Director ve el directorio de cuentas
do $$ declare n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  begin
    perform admin_list_users(null);
    raise exception 'FALLO T8: productora ve cuentas';
  exception when raise_exception then
    if sqlerrm not like 'Solo el Director%' then raise exception 'FALLO T8: %', sqlerrm; end if;
  end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  select count(*) into n from admin_list_users('t_juez');
  if n <> 1 then raise exception 'FALLO T8: búsqueda devolvió %', n; end if;
  reset role;
end $$;

do $$ begin raise exception 'OK: 0031 pruebas T1–T8 (se aborta a propósito para no persistir)'; end $$;
