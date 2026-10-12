-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0031–0064 aplicadas.

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_admin@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_prod@test.local'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_taq@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_ana@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-0000000000a1';

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

do $$ declare perm uuid; otra uuid; f uuid; r json; app uuid; n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform panel_add_member('mm', 't_prod@test.local', 'productor');
  perform panel_add_member('mm', 't_taq@test.local', 'taquilla');
  insert into auditions (titulo, estado, modalidad, permanente) values ('Registro permanente de talento', 'abierta', 'en_linea', true) returning id into perm;
  insert into audition_fields (audition_id, etiqueta, tipo, obligatorio) values (perm, 'Video o portafolio', 'enlace', true) returning id into f;
  insert into auditions (titulo, estado, modalidad) values ('Bailarines (general)', 'abierta', 'en_linea') returning id into otra;

  -- T1: solo uno, sin obra y en línea
  begin insert into auditions (titulo, estado, modalidad, permanente) values ('Otro', 'abierta', 'en_linea', true); raise exception 'FALLO T1a';
  exception when unique_violation then null; end;
  begin insert into auditions (production_id, titulo, modalidad, permanente) values ('mm', 'De obra', 'en_linea', true); raise exception 'FALLO T1b';
  exception when check_violation then null; end;

  -- T2: una persona se registra, se da de baja y vuelve
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  r := audition_apply(perm, jsonb_build_object('nombre', 'Ana', 'telefono', '55', 'fecha_nacimiento', '1995-01-01', 'consentimiento_datos', true,
        'respuestas', jsonb_build_object(f::text, 'https://youtu.be/ana')));
  app := (r->>'application_id')::uuid;
  perform audition_cancel_mine(app);
  r := audition_apply(perm, jsonb_build_object('nombre', 'Ana', 'telefono', '55', 'fecha_nacimiento', '1995-01-01', 'consentimiento_datos', true,
        'respuestas', jsonb_build_object(f::text, 'https://youtu.be/ana2')));
  if (select estado from audition_applications where audition_id = perm and user_id = '00000000-0000-0000-0000-0000000000c1') <> 'inscrito' then raise exception 'FALLO T2'; end if;
  app := (select id from audition_applications where audition_id = perm and user_id = '00000000-0000-0000-0000-0000000000c1');

  -- T3: Producción de una obra ve y trabaja el permanente…
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
  if (select count(*) from audition_applications where audition_id = perm) <> 1 then raise exception 'FALLO T3a: no ve las solicitudes'; end if;
  update audition_applications set estado = 'callback' where id = app;
  if (select estado from audition_applications where id = app) <> 'callback' then raise exception 'FALLO T3b'; end if;
  select count(*) into n from audition_judge_queue(perm, 1);
  if n <> 1 then raise exception 'FALLO T3c: no puede calificar (%)', n; end if;
  if not can_view_talent('00000000-0000-0000-0000-0000000000c1') then raise exception 'FALLO T3d: no ve la ficha de talento'; end if;
  -- …pero no lo configura ni lo borra
  update auditions set titulo = 'Cambiado' where id = perm;
  delete from auditions where id = perm;
  begin insert into audition_fields (audition_id, etiqueta, tipo) values (perm, 'Extra', 'texto'); raise exception 'FALLO T3e';
  exception when insufficient_privilege then null; end;
  perform set_config('role', 'postgres', true);
  if (select titulo from auditions where id = perm) <> 'Registro permanente de talento' then raise exception 'FALLO T3f: lo configuró o borró'; end if;

  -- T4: no ve otras convocatorias generales; taquilla no ve el permanente
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  r := audition_apply(otra, jsonb_build_object('nombre', 'Ana', 'telefono', '55', 'fecha_nacimiento', '1995-01-01', 'consentimiento_datos', true));
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
  if (select count(*) from audition_applications where audition_id = otra) <> 0 then raise exception 'FALLO T4a: ve otra general'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
  if (select count(*) from audition_applications where audition_id = perm) <> 0 then raise exception 'FALLO T4b: taquilla ve el permanente'; end if;

  -- T5: el Director sí lo configura
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  update auditions set descripcion = 'Déjanos tu perfil' where id = perm;
  if (select descripcion from auditions where id = perm) is null then raise exception 'FALLO T5'; end if;

  raise exception 'OK: 0064 registro permanente';
end $$;
