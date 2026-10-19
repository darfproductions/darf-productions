-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0115 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000f01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't115_host@test.local'),
  ('00000000-0000-0000-0000-000000000f02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't115_juez@test.local'),
  ('00000000-0000-0000-0000-000000000f03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't115_ana@test.local'),
  ('00000000-0000-0000-0000-000000000f04', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't115_nadie@test.local');

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

insert into productions (id, nombre, estado) values ('t115_obra', 'Obra 115', 'borrador'), ('t115_vieja', 'Obra vieja 115', 'borrador');

do $$ declare aid uuid; aid2 uuid; f1 uuid; f2 uuid; a1 uuid; a2 uuid; a3 uuid; ajena uuid; p uuid; j json; ok boolean; begin
  insert into auditions (production_id, titulo, estado) values ('t115_obra', 'Audición 115', 'abierta') returning id into aid;
  insert into auditions (production_id, titulo, estado) values ('t115_obra', 'Otra 115', 'abierta') returning id into aid2;
  insert into audition_members (audition_id, user_id, role_id) values
    (aid, '00000000-0000-0000-0000-000000000f01', 'host'), (aid, '00000000-0000-0000-0000-000000000f02', 'juez');
  insert into audition_fields (audition_id, etiqueta, tipo, orden) values (aid, 'Experiencia', 'parrafo', 1) returning id into f1;
  insert into audition_fields (audition_id, etiqueta, tipo, orden) values (aid, 'Video', 'enlace', 2) returning id into f2;
  insert into audition_applications (audition_id, user_id, nombre, fecha_nacimiento, telefono, numero, checked_in_at, respuestas)
    values (aid, '00000000-0000-0000-0000-000000000f03', 'Ana', '2005-01-01', '5511', 1, now(),
            jsonb_build_object(f1::text, 'Coro 3 años', f2::text, 'https://youtu.be/x')) returning id into a1;
  insert into audition_applications (audition_id, walk_in, nombre, fecha_nacimiento, telefono, numero, checked_in_at)
    values (aid, true, 'Beto', '2006-01-01', '5512', 2, now()) returning id into a2;
  insert into audition_applications (audition_id, walk_in, nombre, fecha_nacimiento, telefono, numero)
    values (aid, true, 'Caro (no llegó)', '2006-01-01', '5513', 3) returning id into a3;
  insert into audition_applications (audition_id, walk_in, nombre, fecha_nacimiento, telefono, numero, checked_in_at)
    values (aid2, true, 'De otra', '2006-01-01', '5514', 1, now()) returning id into ajena;
  -- Ana ya estuvo en otra obra.
  insert into people (nombre, profile_id) values ('Ana', '00000000-0000-0000-0000-000000000f03') returning id into p;
  insert into production_credits (production_id, person_id, tipo, papel) values ('t115_vieja', p, 'reparto', 'Donna');

  -- T1: el juez sin nadie en escena; el host pone a Ana.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000f02');
  if audition_juez_actual(aid)->>'app' is not null then raise exception 'FALLO T1: vacío'; end if;
  begin perform audition_en_escena(aid, a1); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T1: el juez no pone en escena'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000f01');
  perform audition_en_escena(aid, a1);
  begin perform audition_en_escena(aid, a3); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T1: no llegó'; end if;
  begin perform audition_en_escena(aid, ajena); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T1: de otra audición'; end if;

  -- T2: el juez ve respuestas de texto, ligas, historial y nada de contacto.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000f02');
  j := audition_juez_actual(aid);
  if (j->>'app')::uuid <> a1 then raise exception 'FALLO T2: actual'; end if;
  if j->'respuestas'->0->>'respuesta' <> 'Coro 3 años' or json_array_length(j->'respuestas') <> 1 then raise exception 'FALLO T2: respuestas %', j->'respuestas'; end if;
  if j->'enlaces'->0->>'url' <> 'https://youtu.be/x' then raise exception 'FALLO T2: ligas'; end if;
  if j->'historial'->0->>'papel' <> 'Donna' then raise exception 'FALLO T2: historial'; end if;
  if j::text like '%5511%' then raise exception 'FALLO T2: teléfono'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000f04');
  begin perform audition_juez_actual(aid); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T2: sin permiso'; end if;

  -- T3: pasar al siguiente: Ana termina, Beto entra; luego no queda nadie.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000f01');
  j := audition_siguiente(aid);
  if (j->>'app')::uuid <> a2 then raise exception 'FALLO T3: siguiente %', j; end if;
  perform pg_temp.as_root();
  if (select finished_at from audition_applications where id = a1) is null then raise exception 'FALLO T3: Ana terminó'; end if;
  if (select entered_at from audition_applications where id = a2) is null then raise exception 'FALLO T3: Beto entró'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000f01');
  j := audition_siguiente(aid);
  perform pg_temp.as_root();
  if j->>'app' is not null or (select en_escena from auditions where id = aid) is not null then raise exception 'FALLO T3: fin %', j; end if;
  if (select finished_at from audition_applications where id = a2) is null then raise exception 'FALLO T3: Beto terminó'; end if;
end $$;

select 'TODO OK';
