-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0116 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000a61', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't116_a@test.local'),
  ('00000000-0000-0000-0000-000000000a62', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't116_b@test.local'),
  ('00000000-0000-0000-0000-000000000a63', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't116_c@test.local'),
  ('00000000-0000-0000-0000-000000000a64', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't116_d@test.local'),
  ('00000000-0000-0000-0000-000000000a65', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't116_admin@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-000000000a65';

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

insert into productions (id, nombre, estado) values ('t116_obra', 'Obra 116', 'borrador');

do $$ declare aid uuid; barnum uuid; phillip uuid; ens uuid; a1 uuid; a2 uuid; a3 uuid; a4 uuid; w uuid; ok boolean; begin
  insert into auditions (production_id, titulo, estado, numeracion) values ('t116_obra', 'Audición 116', 'abierta', 'personaje') returning id into aid;
  insert into audition_roles (audition_id, nombre, orden) values (aid, 'Barnum', 1) returning id into barnum;
  insert into audition_roles (audition_id, nombre, orden) values (aid, 'Phillip', 2) returning id into phillip;
  insert into audition_roles (audition_id, nombre, orden) values (aid, 'Ensamble', 9) returning id into ens;
  -- Se inscriben en este orden: Ensamble, Phillip, Phillip+Barnum, sin personaje.
  insert into audition_applications (audition_id, user_id, nombre, fecha_nacimiento, telefono, roles, created_at)
    values (aid, '00000000-0000-0000-0000-000000000a61', 'Ale Ensamble', '2005-01-01', '1', array[ens], now() - interval '4 hours') returning id into a1;
  insert into audition_applications (audition_id, user_id, nombre, fecha_nacimiento, telefono, roles, created_at)
    values (aid, '00000000-0000-0000-0000-000000000a62', 'Pepe Phillip', '2005-01-01', '2', array[phillip], now() - interval '3 hours') returning id into a2;
  insert into audition_applications (audition_id, user_id, nombre, fecha_nacimiento, telefono, roles, created_at)
    values (aid, '00000000-0000-0000-0000-000000000a63', 'Bea Doble', '2005-01-01', '3', array[phillip, barnum], now() - interval '2 hours') returning id into a3;
  insert into audition_applications (audition_id, user_id, nombre, fecha_nacimiento, telefono, roles, created_at)
    values (aid, '00000000-0000-0000-0000-000000000a64', 'Sin Personaje', '2005-01-01', '4', '{}', now() - interval '1 hour') returning id into a4;
  if exists (select 1 from audition_applications where audition_id = aid and numero is not null) then raise exception 'FALLO: número antes del cierre'; end if;

  -- T1: al cerrar se reparten: Barnum (Bea), Phillip (Pepe), Ensamble (Ale), sin personaje.
  update auditions set estado = 'cerrada' where id = aid;
  if (select numero from audition_applications where id = a3) <> 1 then raise exception 'FALLO T1: Bea'; end if;
  if (select numero from audition_applications where id = a2) <> 2 then raise exception 'FALLO T1: Pepe'; end if;
  if (select numero from audition_applications where id = a1) <> 3 then raise exception 'FALLO T1: Ale'; end if;
  if (select numero from audition_applications where id = a4) <> 4 then raise exception 'FALLO T1: sin personaje'; end if;
  if not exists (select 1 from notifications where user_id = '00000000-0000-0000-0000-000000000a63' and titulo like '%Nº 1%') then raise exception 'FALLO T1: aviso'; end if;
  -- Volver a cerrar/abrir no cambia nada.
  update auditions set estado = 'abierta' where id = aid;
  update auditions set estado = 'cerrada' where id = aid;
  if (select count(*) from notifications where user_id = '00000000-0000-0000-0000-000000000a63' and titulo like '%Nº%') <> 1 then raise exception 'FALLO T1: repetido'; end if;

  -- T2: quien llega sin registro el día de la audición pasa al último.
  insert into audition_applications (audition_id, walk_in, nombre, fecha_nacimiento, telefono) values (aid, true, 'Llegó Hoy', '2005-01-01', '5') returning id into w;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000a65');
  perform audition_checkin(aid, (select qr_token::text from audition_applications where id = w));
  perform audition_checkin(aid, (select qr_token::text from audition_applications where id = a2));
  perform pg_temp.as_root();
  if (select numero from audition_applications where id = w) <> 5 then raise exception 'FALLO T2: walk-in %', (select numero from audition_applications where id = w); end if;
  if (select numero from audition_applications where id = a2) <> 2 then raise exception 'FALLO T2: conserva su número'; end if;

  -- T3: "Asignar ahora" solo para quien gestiona y solo una vez.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000a61');
  begin perform audition_numerar_ahora(aid); ok := false; exception when others then ok := true; end;
  perform pg_temp.as_root();
  if not ok then raise exception 'FALLO T3: sin permiso'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000a65');
  begin perform audition_numerar_ahora(aid); ok := false; exception when others then ok := true; end;
  perform pg_temp.as_root();
  if not ok then raise exception 'FALLO T3: dos veces'; end if;
end $$;

-- T4: por fecha de cierre (lo que corre cada 15 min).
do $$ declare aid uuid; a uuid; begin
  insert into auditions (production_id, titulo, estado, numeracion, inscripcion_cierra)
    values ('t116_obra', 'Audición 116 b', 'abierta', 'personaje', now() - interval '1 minute') returning id into aid;
  insert into audition_applications (audition_id, user_id, nombre, fecha_nacimiento, telefono)
    values (aid, '00000000-0000-0000-0000-000000000a61', 'Ale', '2005-01-01', '1') returning id into a;
  perform auditions_numerar_vencidas();
  if (select numero from audition_applications where id = a) <> 1 then raise exception 'FALLO T4'; end if;
end $$;

select 'TODO OK';
