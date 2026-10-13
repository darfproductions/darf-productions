-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0031–0044 aplicadas.

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_admin@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_int1@test.local'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_tarde@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_dir@test.local'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_juez@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-0000000000a1';

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create temp table ctx (antes uuid, despues uuid, futuro uuid);
grant all on ctx to authenticated, anon;

do $$ declare p uuid; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform panel_add_member('showman', 't_dir@test.local', 'direccion');
  perform panel_add_member('showman', 't_juez@test.local', 'juez');
  perform panel_add_member('showman', 't_int1@test.local', 'integrante');
  perform panel_add_member('showman', 't_tarde@test.local', 'integrante');
  reset role;
  insert into people (nombre, profile_id) values ('Int Uno', '00000000-0000-0000-0000-0000000000c1') returning id into p;
  insert into production_credits (production_id, person_id, tipo, papel) values ('showman', p, 'reparto', 'Barnum');
end $$;

-- T1: al entrar queda su ingreso; ingreso tardío: no se le cita a ensayos anteriores
do $$ declare n int; a uuid; b uuid; begin
  if (select count(*) from member_enrollment where production_id = 'showman' and ingreso = hoy_mx()) <> 2 then
    raise exception 'FALLO T1a: no se registró el ingreso al entrar';
  end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  perform member_set_ingreso('showman', '00000000-0000-0000-0000-0000000000c1', hoy_mx() - 30);
  insert into rehearsals (production_id, titulo, inicia) values ('showman', 'Antes', now() - interval '10 days') returning id into a;
  insert into rehearsals (production_id, titulo, inicia) values ('showman', 'Futuro', now() + interval '10 days') returning id into b;
  insert into ctx (antes, futuro) values (a, b);
  select count(*) into n from rehearsal_roster(a);
  if n <> 1 then raise exception 'FALLO T1b: al ensayo de hace 10 días están citados % (solo el que entró antes)', n; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
  select count(*) into n from rehearsals;
  if n <> 1 then raise exception 'FALLO T1c: quien entró tarde ve % ensayos (solo el futuro)', n; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
  begin
    perform member_set_ingreso('showman', '00000000-0000-0000-0000-0000000000c2', hoy_mx() - 5);
    raise exception 'FALLO T1: un juez cambió el ingreso';
  exception when raise_exception then
    if sqlerrm not like 'No autorizado%' then raise exception 'FALLO T1d: %', sqlerrm; end if;
  end;
  reset role;
end $$;

-- T2: baja: conserva su historial, deja de estar citado y de verse en créditos; se reactiva
do $$ declare n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  insert into rehearsal_attendance (rehearsal_id, user_id, estado) values ((select antes from ctx), '00000000-0000-0000-0000-0000000000c1', 'presente');
  begin
    perform member_withdraw('showman', '00000000-0000-0000-0000-0000000000c1', hoy_mx(), '');
    raise exception 'FALLO T2: baja sin motivo';
  exception when raise_exception then
    if sqlerrm not like 'Escribe el motivo%' then raise exception 'FALLO T2a: %', sqlerrm; end if;
  end;
  perform member_withdraw('showman', '00000000-0000-0000-0000-0000000000c1', hoy_mx(), 'Cambio de ciudad');
  select count(*) into n from rehearsal_roster((select futuro from ctx)) where user_id = '00000000-0000-0000-0000-0000000000c1';
  if n <> 0 then raise exception 'FALLO T2b: sigue citado después de la baja'; end if;
  select count(*) into n from rehearsal_roster((select antes from ctx)) where user_id = '00000000-0000-0000-0000-0000000000c1';
  if n <> 1 then raise exception 'FALLO T2c: se perdió su ensayo anterior a la baja'; end if;
  if (select activo from production_credits c join people p on p.id = c.person_id where p.profile_id = '00000000-0000-0000-0000-0000000000c1') then
    raise exception 'FALLO T2d: sigue en los créditos públicos';
  end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  select count(*) into n from rehearsal_attendance;
  if n <> 1 then raise exception 'FALLO T2e: perdió su historial de asistencia'; end if;
  select count(*) into n from my_enrollments() where baja_motivo = 'Cambio de ciudad';
  if n <> 1 then raise exception 'FALLO T2f: no ve su baja'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  perform member_reactivate('showman', '00000000-0000-0000-0000-0000000000c1');
  select count(*) into n from rehearsal_roster((select futuro from ctx)) where user_id = '00000000-0000-0000-0000-0000000000c1';
  if n <> 1 then raise exception 'FALLO T2g: al reactivar no volvió a estar citado'; end if;
  reset role;
  select count(*) into n from audit_log where tabla = 'member_enrollment' and accion = 'update';
  if n < 3 then raise exception 'FALLO T2h: la bitácora no registró ingreso/baja/reactivación'; end if;
end $$;

-- T3: mensualidades solo dentro de su periodo (quien entró tarde no acumula meses previos)
do $$ declare n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  insert into production_fees (production_id, monto, desde, hasta, dia_limite)
  values ('showman', 500, (date_trunc('month', hoy_mx()) - interval '6 months')::date, (date_trunc('month', hoy_mx()) + interval '2 months')::date, 1);
  perform discipline_scan_fees('showman');
  select count(*) into n from member_incidents where user_id = '00000000-0000-0000-0000-0000000000c2' and tipo = 'mensualidad';
  if n <> 0 then raise exception 'FALLO T3a: quien entró este mes tiene % advertencias por meses anteriores', n; end if;
  select count(*) into n from member_incidents where user_id = '00000000-0000-0000-0000-0000000000c1' and tipo = 'mensualidad';
  if n < 1 then raise exception 'FALLO T3b: quien debe meses de su periodo no tiene advertencia'; end if;
  reset role;
end $$;

-- T4: quien solo maneja mensualidades no ve datos de salud (modelo de 0042)
do $$ declare n int; begin
  insert into person_files (user_id, alergias) values ('00000000-0000-0000-0000-0000000000c1', 'Nueces');
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  insert into panel_roles (id, nombre) values ('t_cobranza', 'Cobranza');
  insert into role_permissions (role_id, permission_id) values ('t_cobranza', 'mensualidades.gestionar');
  perform panel_add_member('showman', 't_juez@test.local', 't_cobranza');
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
  select count(*) into n from person_files;
  if n <> 0 then raise exception 'FALLO T4: cobranza ve datos de salud'; end if;
  reset role;
end $$;

do $$ begin raise exception 'OK: 0044 pruebas T1–T4 (se aborta a propósito para no persistir)'; end $$;
