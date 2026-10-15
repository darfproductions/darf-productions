-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0105 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000c51', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't105_admin@test.local'),
  ('00000000-0000-0000-0000-000000000c52', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'camila.bauer@test.local'),
  ('00000000-0000-0000-0000-000000000c53', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't105_fan@test.local'),
  ('00000000-0000-0000-0000-000000000c54', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't105_prod@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-000000000c51';
update profiles set nombre = 'Camila Báuer' where id = '00000000-0000-0000-0000-000000000c52';
update profiles set nombre = 'Fan Cualquiera' where id = '00000000-0000-0000-0000-000000000c53';
update profiles set nombre = 'Pedro Producción' where id = '00000000-0000-0000-0000-000000000c54';
insert into production_members (production_id, user_id, role_id)
  select 'showman', '00000000-0000-0000-0000-000000000c54', id from panel_roles where id = 'productor';
insert into panel_roles (id, nombre, categoria, alcance, orden) values
  ('casa_t105_dg', 'Dirección General', 'casa', 'casa', 1), ('casa_t105_com', 'Comunicación y Marketing', 'casa', 'casa', 5);

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

-- T1: buscar por nombre sin acentos; el correo sale enmascarado; cuenta_correo da el completo.
do $$ declare n int; c text; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000c54');
  select count(*), max(correo) into n, c from buscar_cuentas('camila bau');
  if n <> 1 or c <> 'cam***er@test.local' then raise exception 'FALLO T1: % %', n, c; end if;
  if cuenta_correo('00000000-0000-0000-0000-000000000c52') <> 'camila.bauer@test.local' then raise exception 'FALLO T1: correo'; end if;
  if (select count(*) from buscar_cuentas('c')) <> 0 then raise exception 'FALLO T1: una letra'; end if;
  perform pg_temp.as_root();
end $$;

-- T2: una cuenta sin nada en el panel no puede buscar.
do $$ declare ok boolean; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000c53');
  begin perform * from buscar_cuentas('camila'); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T2: buscar'; end if;
  begin perform cuenta_correo('00000000-0000-0000-0000-000000000c52'); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T2: correo'; end if;
  perform pg_temp.as_root();
end $$;

-- T3: Nosotros sale de Casa DARF, en el orden de los puestos; se puede ocultar.
do $$ declare j json; begin
  insert into casa_members (user_id, role_id) values
    ('00000000-0000-0000-0000-000000000c52', 'casa_t105_com'),
    ('00000000-0000-0000-0000-000000000c54', 'casa_t105_dg');
  perform pg_temp.as_root();
  set local role anon;
  select json_agg(json_build_object('n', nombre, 'c', cargo)) into j from team_public();
  reset role;
  if j::text not like '%Pedro Producción%Dirección General%Camila Báuer%Comunicación y Marketing%' then raise exception 'FALLO T3: %', j; end if;
  update casa_members set en_nosotros = false where user_id = '00000000-0000-0000-0000-000000000c52';
  if exists (select 1 from team_public() where nombre = 'Camila Báuer') then raise exception 'FALLO T3: oculta'; end if;
end $$;

-- T4: el portal del equipo general incluye a Casa DARF.
do $$ begin
  if not is_team(null, '00000000-0000-0000-0000-000000000c52') then raise exception 'FALLO T4: is_team'; end if;
  if not ('00000000-0000-0000-0000-000000000c52' = any(team_recipients(null, 'todos', null, null))) then raise exception 'FALLO T4: avisos'; end if;
  if is_team(null, '00000000-0000-0000-0000-000000000c53') then raise exception 'FALLO T4: fan'; end if;
end $$;

-- T5: cambiar la cuenta de una ficha (caso Camila): la ficha con créditos pasa a la cuenta buena.
do $$ declare pid uuid; begin
  insert into auth.users (id, instance_id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000c55', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'camila.vieja@test.local');
  insert into people (nombre, profile_id) values ('Camila Bauer', '00000000-0000-0000-0000-000000000c55') returning id into pid;
  insert into production_credits (production_id, person_id, tipo, papel) values ('showman', pid, 'produccion', 'ASM');
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000c51');
  perform people_link_account(pid, cuenta_correo('00000000-0000-0000-0000-000000000c52'));
  perform pg_temp.as_root();
  if (select profile_id from people where id = pid) <> '00000000-0000-0000-0000-000000000c52' then raise exception 'FALLO T5'; end if;
  if lealtad_producciones('00000000-0000-0000-0000-000000000c52') < 1 then raise exception 'FALLO T5: créditos'; end if;
end $$;

select 'OK 0105 buscar, Nosotros y Casa' as resultado;
