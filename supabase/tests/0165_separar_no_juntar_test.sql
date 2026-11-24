-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0165 aplicadas.
insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000165a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't165_admin@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-000000165a01';
insert into productions (id, nombre, estado) values ('t165_obra', 'Obra 165', 'borrador');

do $$ declare aid uuid; a1 uuid; a2 uuid; begin
  insert into auditions (production_id, titulo, estado, modalidad, visibilidad) values ('t165_obra', 'Aud 165', 'abierta', 'presencial', 'enlace') returning id into aid;
  insert into audition_applications (audition_id, walk_in, nombre, fecha_nacimiento, telefono, estado) values (aid, true, 'Vale', '2012-01-01', '1', 'convocado') returning id into a1;
  insert into audition_applications (audition_id, walk_in, nombre, fecha_nacimiento, telefono, estado) values (aid, true, 'Niña', '2012-01-01', '2', 'convocado') returning id into a2;
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-000000165a01', 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  perform audition_agrupar(aid, array[a1, a2]);
  perform audition_separar(aid, a1);
  if (select grupo_turno from audition_applications where id = a1) is not null then raise exception 'FALLO T1: sigue en grupo'; end if;
  if audition_no_juntar(aid) <> array[a1] then raise exception 'FALLO T2: %', audition_no_juntar(aid); end if;
  -- Juntar a mano quita la marca.
  perform audition_agrupar(aid, array[a1, a2]);
  if audition_no_juntar(aid) <> '{}' then raise exception 'FALLO T3'; end if;
end $$;

do $$ begin raise notice '0165 OK'; end $$;
