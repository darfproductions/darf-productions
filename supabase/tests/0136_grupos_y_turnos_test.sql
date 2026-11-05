-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0136 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000136a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't136_admin@test.local'),
  ('00000000-0000-0000-0000-000000136a02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't136_ana@test.local'),
  ('00000000-0000-0000-0000-000000136a03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't136_beto@test.local'),
  ('00000000-0000-0000-0000-000000136a04', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't136_caro@test.local'),
  ('00000000-0000-0000-0000-000000136a05', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't136_otro@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-000000136a01';

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create or replace function pg_temp.reset() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

insert into productions (id, nombre, estado) values ('t136_obra', 'Obra 136', 'borrador');

do $$
declare adm text := '00000000-0000-0000-0000-000000136a01'; u_ana text := '00000000-0000-0000-0000-000000136a02';
        u_beto text := '00000000-0000-0000-0000-000000136a03'; u_caro text := '00000000-0000-0000-0000-000000136a04';
        otro text := '00000000-0000-0000-0000-000000136a05';
        aid uuid; vieja uuid; fg uuid; fc uuid; s1 uuid; s2 uuid; ana uuid; beto uuid; caro uuid; ok boolean; n int; r record;
begin
  insert into auditions (production_id, titulo, estado, numeracion) values ('t136_obra', 'Audición 136', 'abierta', 'previa') returning id into aid;
  -- Como Teen Beach Movie: una pregunta abierta "Grupo" ya contestada.
  insert into audition_fields (audition_id, etiqueta, tipo, orden) values (aid, 'Grupo (salón)', 'texto', 1) returning id into vieja;
  insert into audition_slots (audition_id, inicia, cupo) values (aid, '2026-11-08T17:00:00Z', 10) returning id into s1;
  insert into audition_slots (audition_id, inicia, cupo) values (aid, '2026-11-08T18:00:00Z', 10) returning id into s2;
  insert into audition_applications (audition_id, user_id, nombre, fecha_nacimiento, telefono, respuestas, numero)
    values (aid, u_ana::uuid, 'Ana López', '2010-01-01', '551', jsonb_build_object(vieja::text, '3B'), 1) returning id into ana;
  insert into audition_applications (audition_id, user_id, nombre, fecha_nacimiento, telefono, respuestas, numero)
    values (aid, u_beto::uuid, 'Beto Ruiz', '2010-01-01', '552', jsonb_build_object(vieja::text, '3A'), 2) returning id into beto;
  insert into audition_applications (audition_id, user_id, nombre, fecha_nacimiento, telefono, respuestas, numero)
    values (aid, u_caro::uuid, 'Caro Díaz', '2010-01-01', '553', jsonb_build_object(vieja::text, ' 3b '), 3) returning id into caro;

  update audition_applications set created_at = '2026-10-01T10:00:00Z' where id = ana;
  update audition_applications set created_at = '2026-10-01T11:00:00Z' where id = beto;
  update audition_applications set created_at = '2026-10-01T12:00:00Z' where id = caro;

  -- T1: alguien sin permiso no marca preguntas del sistema.
  perform pg_temp.as_user(otro);
  begin perform audition_pregunta_sistema(aid, 'grupo', vieja); ok := false; exception when others then ok := true; end;
  perform pg_temp.reset();
  if not ok then raise exception 'FALLO T1'; end if;

  -- T2: marcar la pregunta existente como "grupo": las respuestas se usan tal cual; se crea la de compañeros.
  perform pg_temp.as_user(adm);
  fg := audition_pregunta_sistema(aid, 'grupo', vieja);
  fc := audition_pregunta_sistema(aid, 'companeros');
  if fg <> vieja then raise exception 'FALLO T2a'; end if;
  if (select count(*) from audition_fields where audition_id = aid) <> 2 then raise exception 'FALLO T2b'; end if;
  select * into r from audition_respuestas_sistema(aid) x where x.id = caro;
  if r.grupo <> '3b' or r.companeros is not null then raise exception 'FALLO T2c: %', r; end if;
  perform pg_temp.reset();
  update audition_applications set respuestas = respuestas || jsonb_build_object(fc::text, 'con Caro Díaz') where id = ana;

  -- T3: horario para todo el grupo 3B (sin importar mayúsculas ni espacios) y orden por grupo.
  perform pg_temp.as_user(adm);
  n := audition_horario_grupo(aid, '3b', s2);
  if n <> 2 then raise exception 'FALLO T3a: %', n; end if;
  n := audition_horario_grupo(aid, '3A', s1);
  if n <> 1 then raise exception 'FALLO T3b: %', n; end if;
  n := audition_reordenar(aid, 'grupo');
  perform pg_temp.reset();
  if (select string_agg(nombre, ',' order by numero) from audition_applications where audition_id = aid) <> 'Beto Ruiz,Ana López,Caro Díaz' then
    raise exception 'FALLO T3c: %', (select string_agg(nombre || ':' || numero, ',' order by numero) from audition_applications where audition_id = aid);
  end if;

  -- T4: orden por horario (Beto 17:00 primero; Ana y Caro 18:00 por inscripción).
  update audition_applications set slot_id = s1 where id = caro;
  perform pg_temp.as_user(adm);
  perform audition_reordenar(aid, 'horario');
  perform pg_temp.reset();
  if (select string_agg(nombre, ',' order by numero) from audition_applications where audition_id = aid) <> 'Beto Ruiz,Caro Díaz,Ana López' then
    raise exception 'FALLO T4';
  end if;

  -- T5: avisar turnos: a cada quien con número y cuenta, con su hora.
  perform pg_temp.as_user(adm);
  n := audition_avisar_turnos(aid);
  perform pg_temp.reset();
  if n <> 3 then raise exception 'FALLO T5a: %', n; end if;
  if not exists (select 1 from notifications where user_id = u_beto::uuid and titulo = 'Tu turno: Nº 1 · domingo 8 de noviembre, 11:00 a.m.') then
    raise exception 'FALLO T5b: %', (select string_agg(titulo, ' | ') from notifications where user_id = u_beto::uuid);
  end if;

  -- T6: quitar la pregunta del sistema: la que tiene respuestas se conserva como pregunta normal; la vacía se borra.
  perform pg_temp.as_user(adm);
  perform audition_pregunta_sistema_quitar(aid, 'grupo');
  update audition_applications set respuestas = respuestas - fc::text where id = ana;
  perform audition_pregunta_sistema_quitar(aid, 'companeros');
  perform pg_temp.reset();
  if (select sistema is not null from audition_fields where id = vieja) then raise exception 'FALLO T6a'; end if;
  if exists (select 1 from audition_fields where id = fc) then raise exception 'FALLO T6b'; end if;
  if (select respuestas->>vieja::text from audition_applications where id = ana) <> '3B' then raise exception 'FALLO T6c: respuestas intactas'; end if;

  -- T7: sin pregunta de grupo, ordenar por grupo avisa.
  perform pg_temp.as_user(adm);
  begin perform audition_reordenar(aid, 'grupo'); ok := false; exception when others then ok := true; end;
  perform pg_temp.reset();
  if not ok then raise exception 'FALLO T7'; end if;

  raise notice '0136 OK';
end $$;
