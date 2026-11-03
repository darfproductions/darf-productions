-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0134 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000134a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't134_admin@test.local'),
  ('00000000-0000-0000-0000-000000134a02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't134_ana@test.local'),
  ('00000000-0000-0000-0000-000000134a03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't134_beto@test.local'),
  ('00000000-0000-0000-0000-000000134a04', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't134_juez@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-000000134a01';

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

insert into productions (id, nombre, estado) values ('t134_obra', 'Obra 134', 'borrador');

do $$
declare aid uuid; f1 uuid; ana uuid; beto uuid; caro uuid; j json; ok boolean; n int;
        adm text := '00000000-0000-0000-0000-000000134a01'; u_ana text := '00000000-0000-0000-0000-000000134a02';
        u_beto text := '00000000-0000-0000-0000-000000134a03';
begin
  insert into auditions (production_id, titulo, estado, pedir_foto) values ('t134_obra', 'Audición 134', 'abierta', true) returning id into aid;
  insert into audition_fields (audition_id, etiqueta, tipo, orden, obligatorio) values (aid, 'Experiencia', 'texto', 1, true) returning id into f1;
  insert into audition_applications (audition_id, user_id, nombre, fecha_nacimiento, telefono, consentimiento_datos_at, foto_path, respuestas)
    values (aid, u_ana::uuid, 'Ana', '2000-01-01', '551', now(), 'x.jpg', jsonb_build_object(f1::text, 'Coro')) returning id into ana;
  insert into audition_applications (audition_id, user_id, nombre, fecha_nacimiento, telefono, consentimiento_datos_at)
    values (aid, u_beto::uuid, 'Beto', '2000-01-01', '552', now()) returning id into beto;
  insert into auth.users (id, instance_id, aud, role, email) values
    ('00000000-0000-0000-0000-000000134a05', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't134_caro@test.local');
  insert into audition_applications (audition_id, user_id, nombre, fecha_nacimiento, telefono, estado)
    values (aid, '00000000-0000-0000-0000-000000134a05', 'Caro', '2000-01-01', '553', 'inscrito') returning id into caro;

  -- T1: el juez no revisa.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000134a04');
  begin perform audition_revisar(aid, ana, 'aprobar'); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T1'; end if;

  -- T2: aprobar a Ana → convocado, revisada, con aviso.
  perform pg_temp.as_user(adm);
  j := audition_revisar(aid, ana, 'aprobar');
  perform pg_temp.reset();
  if j->>'estado' <> 'convocado' or (select revisada_at from audition_applications where id = ana) is null then raise exception 'FALLO T2a: %', j; end if;
  if not exists (select 1 from notifications where user_id = u_ana::uuid and titulo = '¡Tu solicitud fue aprobada!') then raise exception 'FALLO T2b'; end if;

  -- T3: regresar a Beto con nota → pedido abierto con la nota y aviso con la nota; sin nota pero con faltantes, arma la nota sola.
  perform pg_temp.as_user(adm);
  j := audition_revisar(aid, beto, 'regresar', 'Te falta la foto de cuerpo completo');
  perform pg_temp.reset();
  if (select completar_pedido_at is null or completar_nota <> 'Te falta la foto de cuerpo completo' from audition_applications where id = beto) then raise exception 'FALLO T3a'; end if;
  if not exists (select 1 from notifications where user_id = u_beto::uuid and titulo = 'Te regresamos tu solicitud' and detalle like '%foto de cuerpo completo%') then raise exception 'FALLO T3b'; end if;
  perform pg_temp.as_user(adm);
  j := audition_revisar(aid, beto, 'regresar');
  if j->>'nota' not like 'Falta: Foto, Experiencia%' then raise exception 'FALLO T3c: %', j; end if;

  -- T4: regresar a alguien aprobado lo vuelve a revisión.
  perform audition_revisar(aid, ana, 'regresar', 'Actualiza tu teléfono');
  perform pg_temp.reset();
  if (select estado from audition_applications where id = ana) <> 'inscrito' then raise exception 'FALLO T4'; end if;

  -- T5: Beto corrige (con la inscripción cerrada) y vuelve a revisión; "aprobar completas" no toma a quien sigue con pedido.
  update auditions set estado = 'cerrada' where id = aid;
  perform pg_temp.as_user(u_beto);
  perform audition_apply(aid, jsonb_build_object('nombre', 'Beto', 'telefono', '552', 'fecha_nacimiento', '2000-01-01', 'consentimiento_datos', true,
    'respuestas', jsonb_build_object(f1::text, 'Danza'), 'foto_path', aid || '/' || u_beto || '/f.jpg'));
  perform pg_temp.reset();
  if (select estado <> 'inscrito' or completar_pedido_at is not null from audition_applications where id = beto) then raise exception 'FALLO T5a'; end if;
  perform pg_temp.as_user(adm);
  n := audition_aprobar_completas(aid);
  perform pg_temp.reset();
  -- Beto (completo, sin pedido) sí; Ana (con pedido abierto) no; Caro (sin foto ni respuesta) no.
  if n <> 1 or (select estado from audition_applications where id = beto) <> 'convocado' or (select estado from audition_applications where id = ana) <> 'inscrito' then
    raise exception 'FALLO T5b: %', n;
  end if;

  -- T6: en la entrada, alguien sin aprobar entra pero con aviso.
  update auditions set estado = 'abierta' where id = aid;
  perform pg_temp.as_user(adm);
  j := audition_checkin(aid, caro::text);
  if j->>'result' <> 'ok' or not (j->>'sin_aprobar')::boolean then raise exception 'FALLO T6a: %', j; end if;
  j := audition_checkin(aid, beto::text);
  if (j->>'sin_aprobar')::boolean then raise exception 'FALLO T6b: %', j; end if;
  perform pg_temp.reset();

  raise notice '0134 OK';
end $$;
