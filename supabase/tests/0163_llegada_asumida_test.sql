-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0163 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000163a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't163_admin@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-000000163a01';
insert into productions (id, nombre, estado) values ('t163_obra', 'Obra 163', 'borrador');

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

do $$ declare aid uuid; a1 uuid; a2 uuid; a3 uuid; begin
  insert into auditions (production_id, titulo, estado, modalidad, visibilidad) values ('t163_obra', 'Escuela 163', 'cerrada', 'presencial', 'enlace') returning id into aid;
  insert into audition_applications (audition_id, walk_in, nombre, fecha_nacimiento, telefono, estado) values (aid, true, 'Ana', '2000-01-01', '1', 'convocado') returning id into a1;
  insert into audition_applications (audition_id, walk_in, nombre, fecha_nacimiento, telefono, estado) values (aid, true, 'Beto', '2000-01-01', '2', 'convocado') returning id into a2;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000163a01');
  perform audition_asumir_llegada(aid, true);
  if audition_llegadas_asumidas(aid) <> array[a1, a2] and audition_llegadas_asumidas(aid) <> array[a2, a1] then raise exception 'FALLO T1: %', audition_llegadas_asumidas(aid); end if;
  -- Faltó: ya no es llegada asumida. Sí vino: llegada real (con hora), no asumida.
  perform audition_falto(aid, a2, true);
  if (select llegada_asumida from audition_applications where id = a2) then raise exception 'FALLO T2a'; end if;
  perform audition_falto(aid, a2, false);
  if (select llegada_asumida or checked_in_at is null from audition_applications where id = a2) then raise exception 'FALLO T2b'; end if;
  if audition_llegadas_asumidas(aid) <> array[a1] then raise exception 'FALLO T3: %', audition_llegadas_asumidas(aid); end if;
  -- Una alta nueva que llega con QR es real.
  set local role postgres;
  insert into audition_applications (audition_id, walk_in, nombre, fecha_nacimiento, telefono, estado) values (aid, true, 'Caro', '2000-01-01', '3', 'convocado') returning id into a3;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000163a01');
  perform audition_checkin(aid, a3::text);
  if (select llegada_asumida from audition_applications where id = a3) then raise exception 'FALLO T4'; end if;
end $$;

do $$ begin raise notice '0163 OK'; end $$;
