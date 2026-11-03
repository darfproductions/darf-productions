-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0133 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000133a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't133_admin@test.local'),
  ('00000000-0000-0000-0000-000000133a02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't133_ana@test.local'),
  ('00000000-0000-0000-0000-000000133a03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't133_beto@test.local'),
  ('00000000-0000-0000-0000-000000133a04', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't133_juez@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-000000133a01';

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

insert into productions (id, nombre, estado) values ('t133_obra', 'Obra 133', 'borrador');

do $$
declare aid uuid; f1 uuid; ana uuid; beto uuid; caro uuid; dani uuid; n int; j json; ok boolean; g uuid;
        adm text := '00000000-0000-0000-0000-000000133a01'; u_ana text := '00000000-0000-0000-0000-000000133a02';
        u_beto text := '00000000-0000-0000-0000-000000133a03';
begin
  insert into auditions (production_id, titulo, estado, pedir_foto, numeracion) values ('t133_obra', 'Audición 133', 'abierta', true, 'llegada') returning id into aid;
  insert into audition_members (audition_id, user_id, role_id) values (aid, '00000000-0000-0000-0000-000000133a04', 'juez');
  -- Ana y Beto se inscribieron sin foto; luego se agregó una pregunta obligatoria.
  insert into audition_applications (audition_id, user_id, nombre, fecha_nacimiento, telefono, consentimiento_datos_at)
    values (aid, u_ana::uuid, 'Ana', '2000-01-01', '551', now()) returning id into ana;
  insert into audition_applications (audition_id, user_id, nombre, fecha_nacimiento, telefono, consentimiento_datos_at, foto_path)
    values (aid, u_beto::uuid, 'Beto', '2000-01-01', '552', now(), aid || '/' || u_beto || '/f.jpg') returning id into beto;
  insert into audition_fields (audition_id, etiqueta, tipo, orden, obligatorio) values (aid, 'Experiencia', 'texto', 1, true) returning id into f1;
  update audition_applications set respuestas = jsonb_build_object(f1::text, 'Coro') where id = beto;

  -- T1: qué le falta a cada quien.
  perform pg_temp.as_user(adm);
  if (select faltan from audition_faltantes(aid) where id = ana) <> array['Foto', 'Experiencia'] then raise exception 'FALLO T1a'; end if;
  if cardinality((select faltan from audition_faltantes(aid) where id = beto)) <> 0 then raise exception 'FALLO T1b'; end if;

  -- T2: pedir a todos los que les falta algo: solo Ana; le llega el aviso.
  n := audition_pedir_completar(aid);
  perform pg_temp.reset();
  if n <> 1 or (select completar_pedido_at from audition_applications where id = ana) is null
     or (select completar_pedido_at from audition_applications where id = beto) is not null then raise exception 'FALLO T2a: %', n; end if;
  if not exists (select 1 from notifications where user_id = u_ana::uuid and titulo = 'Completa tu inscripción') then raise exception 'FALLO T2b: aviso'; end if;

  -- T3: la inscripción cierra; Ana sí puede completar (y se quita el pedido); Beto no puede editar.
  update auditions set estado = 'cerrada' where id = aid;
  perform pg_temp.as_user(u_ana);
  perform audition_apply(aid, jsonb_build_object('nombre', 'Ana', 'telefono', '551', 'fecha_nacimiento', '2000-01-01', 'consentimiento_datos', true,
    'respuestas', jsonb_build_object(f1::text, 'Teatro escolar'), 'foto_path', aid || '/' || u_ana || '/foto.jpg'));
  perform pg_temp.reset();
  if (select completar_pedido_at is not null or completado_at is null or foto_path is null from audition_applications where id = ana) then raise exception 'FALLO T3a'; end if;
  perform pg_temp.as_user(u_beto);
  begin
    perform audition_apply(aid, jsonb_build_object('nombre', 'Beto', 'telefono', '552', 'fecha_nacimiento', '2000-01-01', 'consentimiento_datos', true,
      'respuestas', jsonb_build_object(f1::text, 'Coro')));
    ok := false;
  exception when others then ok := sqlerrm like '%no está abierta%';
  end;
  if not ok then raise exception 'FALLO T3b: Beto editó con la inscripción cerrada'; end if;
  perform pg_temp.reset();

  -- T4: grupos. Llegan Ana (1), Beto (2), Caro (3), Dani (4); Ana y Caro pasan juntas.
  insert into audition_applications (audition_id, walk_in, nombre, fecha_nacimiento, telefono) values (aid, true, 'Caro', '2000-01-01', '553') returning id into caro;
  insert into audition_applications (audition_id, walk_in, nombre, fecha_nacimiento, telefono) values (aid, true, 'Dani', '2000-01-01', '554') returning id into dani;
  perform pg_temp.as_user(adm);
  perform audition_checkin(aid, ana::text); perform audition_checkin(aid, beto::text);
  perform audition_checkin(aid, caro::text); perform audition_checkin(aid, dani::text);
  g := audition_agrupar(aid, array[ana, caro]);
  begin perform audition_agrupar(aid, array[ana]); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T4a: grupo de uno'; end if;

  -- T5: Siguiente → entra Ana y con ella Caro (cada una conserva su número).
  if (audition_siguiente(aid)->>'app')::uuid <> ana then raise exception 'FALLO T5a'; end if;
  perform pg_temp.reset();
  if (select entered_at is null from audition_applications where id = caro) then raise exception 'FALLO T5b: Caro no entró con su grupo'; end if;
  if (select numero from audition_applications where id = caro) <> 3 then raise exception 'FALLO T5c: número'; end if;

  -- T6: el juez ve a las dos en el grupo, cada una con su evaluación.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000133a04');
  j := audition_juez_actual(aid);
  if json_array_length(j->'grupo') <> 2 or (j->'grupo'->1->>'nombre') <> 'Caro' then raise exception 'FALLO T6: %', j->'grupo'; end if;

  -- T7: Siguiente → sale todo el grupo y entra Beto (no Caro).
  perform pg_temp.as_user(adm);
  if (audition_siguiente(aid)->>'app')::uuid <> beto then raise exception 'FALLO T7a'; end if;
  perform pg_temp.reset();
  if (select count(*) from audition_applications where id in (ana, caro) and finished_at is not null) <> 2 then raise exception 'FALLO T7b: no salió el grupo'; end if;
  perform pg_temp.as_user(adm);
  if (audition_siguiente(aid)->>'app')::uuid <> dani then raise exception 'FALLO T7c'; end if;

  -- T8: separar: si el grupo queda de uno, deja de ser grupo.
  update audition_applications set grupo_turno = null where id in (ana, caro);
  perform pg_temp.reset();
  g := gen_random_uuid();
  update audition_applications set grupo_turno = g where id in (beto, dani);
  perform pg_temp.as_user(adm);
  perform audition_separar(aid, beto);
  perform pg_temp.reset();
  if exists (select 1 from audition_applications where id in (beto, dani) and grupo_turno is not null) then raise exception 'FALLO T8'; end if;

  raise notice '0133 OK';
end $$;
