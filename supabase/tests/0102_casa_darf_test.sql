-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0102 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't102_admin@test.local'),
  ('00000000-0000-0000-0000-000000000d02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't102_comu@test.local'),
  ('00000000-0000-0000-0000-000000000d03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't102_admon@test.local'),
  ('00000000-0000-0000-0000-000000000d04', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't102_talento@test.local'),
  ('00000000-0000-0000-0000-000000000d05', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't102_dg@test.local'),
  ('00000000-0000-0000-0000-000000000d06', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't102_nosotros@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-000000000d01';

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
create or replace function pg_temp.falla(q text) returns boolean language plpgsql as $$
begin
  execute q; return false;
exception when others then return true;
end $$;

-- T0: el admin arma Casa DARF; nadie más puede.
do $$ declare pe uuid; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000d01');
  perform casa_agregar('t102_comu@test.local', array['casa_comunicacion'], '2023-02-01');
  perform casa_agregar('t102_admon@test.local', array['casa_administracion']);
  perform casa_agregar('t102_talento@test.local', array['casa_talento']);
  if (select count(*) from casa_lista()) < 3 then raise exception 'FALLO T0: lista'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000d03');
  if not pg_temp.falla($q$select casa_agregar('t102_dg@test.local', array['casa_direccion'])$q$) then raise exception 'FALLO T0: Administración dio un rol de casa'; end if;
  if not pg_temp.falla($q$insert into casa_members (user_id, role_id) values ('00000000-0000-0000-0000-000000000d05', 'casa_direccion')$q$) then raise exception 'FALLO T0: insert directo'; end if;
  if not pg_temp.falla($q$update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-000000000d03'$q$) then raise exception 'FALLO T0: se hizo admin'; end if;
  perform pg_temp.as_root();
  -- Alguien que solo está en Nosotros (Equipo DARF) ya no es Casa DARF.
  insert into people (nombre, profile_id) values ('Nora Nosotros', '00000000-0000-0000-0000-000000000d06') returning id into pe;
  insert into team_members (person_id, cargo) values (pe, 'Coordinadora');
end $$;

-- T1: Comunicación: sitio y contacto sí; reportes y producciones no.
do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000d02');
  if mis_permisos_casa() <> array['casa.sitio', 'casa.eventos', 'casa.club', 'casa.contacto'] then raise exception 'FALLO T1: permisos %', mis_permisos_casa(); end if;
  perform panel_set_site_banner('corre', null, true, '[{"texto": "Hola"}]'::jsonb);
  if not evento_editor(null) then raise exception 'FALLO T1: eventos DARF'; end if;
  if not pg_temp.falla('select director_overview()') then raise exception 'FALLO T1: vio reportes'; end if;
  if not pg_temp.falla($q$insert into productions (id, nombre) values ('t102-x', 'X')$q$) then raise exception 'FALLO T1: creó obra'; end if;
  if has_perm('showman', 'obra.ver') then raise exception 'FALLO T1: entra a las obras'; end if;
  perform pg_temp.as_root();
  if (select count(*) from site_banner_items where texto = 'Hola') <> 1 then raise exception 'FALLO T1: franja'; end if;
end $$;

-- T2: Administración crea una obra y nombra a su Dirección general sin ser parte del equipo.
do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000d03');
  insert into productions (id, nombre) values ('t102-obra', 'Obra de prueba');
  perform panel_add_member('t102-obra', 't102_dg@test.local', 'direccion_general');
  if not has_perm('showman', 'permisos.gestionar') or not has_perm('t102-obra', 'ventas.operar') then raise exception 'FALLO T2: permisos de obra'; end if;
  if not exists (select 1 from my_panel_access() where production_id = 't102-obra' and permission_id = 'obra.publicar') then raise exception 'FALLO T2: my_panel_access'; end if;
  if exists (select 1 from my_panel_access() where permission_id like 'casa.%') then raise exception 'FALLO T2: casa en obras'; end if;
  if not pg_temp.falla($q$select panel_add_member('t102-obra', 't102_dg@test.local', 'casa_direccion')$q$) then raise exception 'FALLO T2: rol de casa en una obra'; end if;
  if has_casa('casa.sitio') then raise exception 'FALLO T2: sitio'; end if;
  perform pg_temp.as_root();
  if exists (select 1 from production_members where production_id = 't102-obra' and user_id = '00000000-0000-0000-0000-000000000d03') then raise exception 'FALLO T2: quedó en el equipo'; end if;
  if not exists (select 1 from production_members where production_id = 't102-obra' and user_id = '00000000-0000-0000-0000-000000000d05' and role_id = 'direccion_general') then raise exception 'FALLO T2: Dirección general'; end if;
  -- La Dirección general de la obra no tiene nada de Casa DARF.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000d05');
  if has_casa('casa.producciones') or has_perm('showman', 'obra.ver') then raise exception 'FALLO T2: DG global'; end if;
  if not has_perm('t102-obra', 'permisos.gestionar') then raise exception 'FALLO T2: DG en su obra'; end if;
  perform pg_temp.as_root();
end $$;

-- T3: Talento: audiciones generales; los demás no.
do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000d04');
  if not has_perm(null, 'audiciones.gestionar') or not manages_any_audition() then raise exception 'FALLO T3: Talento'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000d02');
  if has_perm(null, 'audiciones.gestionar') then raise exception 'FALLO T3: Comunicación en audiciones'; end if;
  perform pg_temp.as_root();
end $$;

-- T4: Roles: casa.* solo en roles de casa; Administración (casa.roles) edita roles de obra, no los de casa.
do $$ begin
  if not pg_temp.falla($q$insert into role_permissions values ('taquilla', 'casa.sitio')$q$) then raise exception 'FALLO T4: casa en rol de obra'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000d03');
  insert into panel_roles (id, nombre, categoria) values ('t102rol', 'Rol de prueba', 'crew');
  insert into role_permissions values ('t102rol', 'obra.ver');
  if not pg_temp.falla($q$insert into role_permissions values ('casa_talento', 'casa.sitio')$q$) then raise exception 'FALLO T4: editó un rol de casa'; end if;
  perform pg_temp.as_root();
end $$;

-- T5: gafete: Casa DARF gana sobre un puesto de obra; Nosotros solo ya no es Casa DARF.
do $$ begin
  insert into production_members (production_id, user_id, role_id) values ('showman', '00000000-0000-0000-0000-000000000d02', 'productor');
  if badge_papel('00000000-0000-0000-0000-000000000d02')->>'franja' <> 'casa' then raise exception 'FALLO T5: casa no gana'; end if;
  if badge_papel('00000000-0000-0000-0000-000000000d02')->>'papel' <> 'Comunicación' then raise exception 'FALLO T5: papel'; end if;
  if (badge_papel('00000000-0000-0000-0000-000000000d02')->>'casa_desde')::int <> 2023 then raise exception 'FALLO T5: desde'; end if;
  if coalesce(badge_papel('00000000-0000-0000-0000-000000000d06')->>'franja', '') = 'casa' then raise exception 'FALLO T5: Nosotros es casa'; end if;
  if badge_papel('00000000-0000-0000-0000-000000000d01')->>'franja' <> 'casa' then raise exception 'FALLO T5: admin'; end if;
  if credencial_nivel('00000000-0000-0000-0000-000000000d04') <> 'equipo' then raise exception 'FALLO T5: Talento sin gafete'; end if;
end $$;

select 'OK 0102';
