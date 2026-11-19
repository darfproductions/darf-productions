-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0148 aplicadas.
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000148a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't148_dir@test.local'),
  ('00000000-0000-0000-0000-000000148c01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't148_casa@test.local'),
  ('00000000-0000-0000-0000-000000148f01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't148_fan@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-000000148a01';
-- Un rol de Casa DARF SIN casa.producciones (solo el sitio).
insert into panel_roles (id, nombre, alcance, categoria) values ('t148_sitio', 'Sitio (prueba)', 'casa', 'casa');
insert into role_permissions (role_id, permission_id) values ('t148_sitio', 'casa.sitio');
insert into casa_members (user_id, role_id) values ('00000000-0000-0000-0000-000000148c01', 't148_sitio');

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
declare n int; total int;
begin
  select count(*) into total from productions;

  -- T1: Casa DARF sin casa.producciones entra a todas las obras con todos los permisos de obra.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000148c01');
  if not has_perm('showman', 'expedientes.ver') or not has_perm('mm', 'elenco.gestionar') then raise exception 'FALLO T1: has_perm'; end if;
  if has_perm('showman', 'casa.personas') then raise exception 'FALLO T1: no debe ganar permisos de casa'; end if;
  select count(distinct production_id) into n from my_panel_access();
  if n <> total then raise exception 'FALLO T1: my_panel_access ve % de % obras', n, total; end if;
  if not maneja_funciones() then raise exception 'FALLO T1: funciones'; end if;

  -- T2: pero no puede borrar una obra.
  begin
    perform panel_borrar_produccion('hsm', 'nada');
    raise exception 'FALLO T2: Casa DARF borró';
  exception when others then
    if sqlerrm not like 'Solo el Director%' then raise exception 'FALLO T2: %', sqlerrm; end if;
  end;
  begin
    perform _borrar_produccion('hsm', 'nada');
    raise exception 'FALLO T2: llamó directo a la función interna';
  exception when insufficient_privilege then null;
  end;

  -- T3: alguien sin Casa DARF ni equipo no ve nada.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000148f01');
  if has_perm('showman', 'obra.ver') or casa_obras() then raise exception 'FALLO T3: fan con acceso'; end if;
  if exists (select 1 from my_panel_access()) then raise exception 'FALLO T3: fan con panel'; end if;

  -- T4: el Director sí llega a la función de borrar (falla por la confirmación, no por permiso).
  perform pg_temp.as_user('00000000-0000-0000-0000-000000148a01');
  begin
    perform panel_borrar_produccion('hsm', 'nombre equivocado');
    raise exception 'FALLO T4: borró sin confirmar';
  exception when others then
    if sqlerrm not like 'Para confirmar%' then raise exception 'FALLO T4: %', sqlerrm; end if;
  end;
  perform pg_temp.reset();
  raise notice '0148 OK';
end $$;

rollback;
