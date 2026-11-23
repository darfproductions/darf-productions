-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0162 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000162a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't162_admin@test.local'),
  ('00000000-0000-0000-0000-000000162a02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't162_dani@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-000000162a01';
insert into productions (id, nombre, estado) values ('t162_obra', 'Obra 162', 'borrador');

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

do $$ declare aid uuid; a1 uuid; a2 uuid; a3 uuid; a4 uuid; n int; ok boolean; begin
  insert into auditions (production_id, titulo, estado, modalidad, visibilidad) values ('t162_obra', 'Escuela 162', 'cerrada', 'presencial', 'enlace') returning id into aid;
  insert into audition_applications (audition_id, walk_in, nombre, fecha_nacimiento, telefono, estado) values (aid, true, 'Ana', '2000-01-01', '1', 'convocado') returning id into a1;
  insert into audition_applications (audition_id, walk_in, nombre, fecha_nacimiento, telefono, estado) values (aid, true, 'Beto', '2000-01-01', '2', 'convocado') returning id into a2;
  insert into audition_applications (audition_id, walk_in, nombre, fecha_nacimiento, telefono, estado) values (aid, true, 'Caro', '2000-01-01', '3', 'cancelado') returning id into a3;
  insert into audition_applications (audition_id, user_id, nombre, fecha_nacimiento, telefono, estado) values (aid, '00000000-0000-0000-0000-000000162a02', 'Dani', '2000-01-01', '4', 'inscrito') returning id into a4;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000162a01');
  -- Por omisión está apagado.
  if (select asumir_llegada from auditions where id = aid) then raise exception 'FALLO T0'; end if;
  -- Al encenderlo: llegan Ana y Beto (con turno); ni la cancelada ni la solicitud sin aprobar.
  n := audition_asumir_llegada(aid, true);
  if n <> 2 then raise exception 'FALLO T1a: %', n; end if;
  if (select count(*) from audition_applications where audition_id = aid and checked_in_at is not null and numero is not null) <> 2 then raise exception 'FALLO T1b'; end if;
  -- Beto faltó: sale de la fila (sin llegada), conserva su número.
  perform audition_falto(aid, a2, true);
  if (select checked_in_at from audition_applications where id = a2) is not null or (select falto_at from audition_applications where id = a2) is null then raise exception 'FALLO T2a'; end if;
  if audition_faltaron(aid) <> array[a2] then raise exception 'FALLO T2b'; end if;
  -- Volver a "todos llegaron" no lo regresa.
  if audition_todos_llegaron(aid) <> 0 then raise exception 'FALLO T2c'; end if;
  -- "Sí vino": vuelve a la fila.
  perform audition_falto(aid, a2, false);
  if (select checked_in_at from audition_applications where id = a2) is null or (select falto_at from audition_applications where id = a2) is not null then raise exception 'FALLO T3'; end if;
  -- No se marca falta a quien ya pasó.
  update audition_applications set entered_at = now() where id = a1;
  begin perform audition_falto(aid, a1, true); ok := false; exception when others then ok := sqlerrm like '%Ya pasó%'; end;
  if not ok then raise exception 'FALLO T4'; end if;
end $$;

do $$ begin raise notice '0162 OK'; end $$;
