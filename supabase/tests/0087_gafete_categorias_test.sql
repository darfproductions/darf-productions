-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0087 aplicadas.

insert into auth.users (id, instance_id, aud, role, email)
values ('00000000-0000-0000-0000-000000000091', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_g1@test.local'),
       ('00000000-0000-0000-0000-000000000092', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_g2@test.local'),
       ('00000000-0000-0000-0000-000000000093', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_g3@test.local');

do $$ declare j json; u uuid := '00000000-0000-0000-0000-000000000091'; begin
  -- T1: categorías de los roles del sistema.
  if (select string_agg(id || ':' || categoria, ',' order by id) from panel_roles where es_sistema) <>
     'contenido:crew,direccion:direccion,integrante:crew,juez:crew,maestro:direccion,maquillaje:crew,productor:produccion,puerta:staff,registro:staff,staff:staff,taquilla:crew' then
    raise exception 'FALLO T1: categorías %', (select string_agg(id || ':' || categoria, ',' order by id) from panel_roles where es_sistema);
  end if;
  -- T2: sube de categoría según sus roles (lo más alto gana) y baja si se los quitan.
  insert into production_members (production_id, user_id, role_id) values ('showman', u, 'puerta');
  j := badge_papel(u); if j->>'franja' <> 'staff' or j->>'papel' <> 'Puerta' then raise exception 'FALLO T2: puerta %', j; end if;
  insert into production_members (production_id, user_id, role_id) values ('showman', u, 'taquilla');
  j := badge_papel(u); if j->>'franja' <> 'crew' or j->>'papel' <> 'Taquilla' then raise exception 'FALLO T2: taquilla %', j; end if;
  insert into production_members (production_id, user_id, role_id) values ('showman', u, 'integrante');
  j := badge_papel(u); if j->>'franja' <> 'crew' or j->>'papel' <> 'Elenco' then raise exception 'FALLO T2: elenco gana a crew %', j; end if;
  insert into production_members (production_id, user_id, role_id) values ('showman', u, 'maestro');
  j := badge_papel(u); if j->>'franja' <> 'direccion' or j->>'papel' <> 'Maestro' then raise exception 'FALLO T2: maestro %', j; end if;
  insert into production_members (production_id, user_id, role_id) values ('showman', u, 'productor');
  j := badge_papel(u); if j->>'franja' <> 'produccion' then raise exception 'FALLO T2: producción %', j; end if;
  delete from production_members where user_id = u and role_id in ('productor', 'maestro');
  j := badge_papel(u); if j->>'franja' <> 'crew' then raise exception 'FALLO T2: no bajó %', j; end if;
  -- T3: rol nuevo con su categoría.
  insert into panel_roles (id, nombre, categoria) values ('coreografia', 'Coreografía', 'direccion');
  insert into production_members (production_id, user_id, role_id) values ('showman', '00000000-0000-0000-0000-000000000092', 'coreografia');
  j := badge_papel('00000000-0000-0000-0000-000000000092');
  if j->>'franja' <> 'direccion' or j->>'papel' <> 'Coreografía' then raise exception 'FALLO T3: rol nuevo %', j; end if;
  begin insert into panel_roles (id, nombre, categoria) values ('x1', 'X', 'jefe'); raise exception 'FALLO T3: categoría inválida';
  exception when check_violation then null; end;
  -- T4: Director y staff general de DARF.
  update profiles set rol = 'staff' where id = '00000000-0000-0000-0000-000000000093';
  j := badge_papel('00000000-0000-0000-0000-000000000093');
  if j->>'franja' <> 'staff' or j->>'papel' <> 'Staff DARF' then raise exception 'FALLO T4: staff DARF %', j; end if;
  update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-000000000093';
  j := badge_papel('00000000-0000-0000-0000-000000000093');
  if j->>'franja' <> 'manager' or j->>'papel' <> 'Dirección general' then raise exception 'FALLO T4: Director %', j; end if;
end $$;

select 'OK 0087' as resultado;
