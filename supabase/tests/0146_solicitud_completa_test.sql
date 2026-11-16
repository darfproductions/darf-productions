-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0147 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000146a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't146_ana@test.local');

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
create or replace function pg_temp.falla(sql text, txt text) returns boolean language plpgsql as $$
begin
  execute sql;
  return false;
exception when others then
  if position(lower(txt) in lower(sqlerrm)) = 0 then raise exception 'mensaje inesperado: % (esperaba "%")', sqlerrm, txt; end if;
  return true;
end $$;

do $$
declare ana text := '00000000-0000-0000-0000-000000146a01'; aid uuid; fq uuid; fc uuid; r1 uuid; base jsonb; app uuid; ok boolean;
begin
  insert into auditions (titulo, estado, pedir_foto, pedir_tutor, perfil_preguntas, elegir_horario)
  values ('Audición 146', 'abierta', true, true, '{tesitura,canto,habilidades}', false) returning id into aid;
  -- Dos preguntas obligatorias (desde 0147 cada pregunta se marca obligatoria u opcional en el panel).
  insert into audition_fields (audition_id, etiqueta, tipo, orden, obligatorio) values (aid, '¿Qué canción traes?', 'texto', 1, true) returning id into fq;
  insert into audition_fields (audition_id, etiqueta, tipo, orden, sistema, obligatorio) values (aid, '¿Pasas con alguien?', 'texto', 2, 'companeros', true) returning id into fc;
  insert into audition_roles (audition_id, nombre, orden) values (aid, 'Mirabel', 1) returning id into r1;

  base := jsonb_build_object('nombre', 'Ana López', 'telefono', '4421112233', 'fecha_nacimiento', '2000-05-01', 'consentimiento_datos', true,
            'respuestas', jsonb_build_object(fq::text, 'Surface Pressure', fc::text, 'Solo'), 'roles', jsonb_build_array(r1::text),
            'foto_path', aid::text || '/' || ana || '/foto.jpg', 'perfil', jsonb_build_object('tesitura', 'no_se', 'canto', 'basico', 'habilidades', jsonb_build_array('Ninguna')));
  perform pg_temp.as_user(ana);

  -- T1: cada cosa que falte bloquea la solicitud, con un mensaje claro.
  if not pg_temp.falla(format('select audition_apply(%L, %L::jsonb)', aid, base - 'foto_path'), 'sube tu foto') then raise exception 'FALLO T1a'; end if;
  if not pg_temp.falla(format('select audition_apply(%L, %L::jsonb)', aid, jsonb_set(base, '{roles}', '[]')), 'al menos un personaje') then raise exception 'FALLO T1b'; end if;
  if not pg_temp.falla(format('select audition_apply(%L, %L::jsonb)', aid, jsonb_set(base, '{respuestas}', '{}')), 'falta responder') then raise exception 'FALLO T1c'; end if;
  if not pg_temp.falla(format('select audition_apply(%L, %L::jsonb)', aid, jsonb_set(base, '{perfil,canto}', '""')), 'perfil artístico: canto') then raise exception 'FALLO T1d'; end if;
  if not pg_temp.falla(format('select audition_apply(%L, %L::jsonb)', aid, base - 'perfil'), 'perfil artístico: tesitura') then raise exception 'FALLO T1e'; end if;
  if not pg_temp.falla(format('select audition_apply(%L, %L::jsonb)', aid, jsonb_set(base, '{perfil,habilidades}', '[]')), 'habilidades especiales') then raise exception 'FALLO T1g'; end if;
  if not pg_temp.falla(format('select audition_apply(%L, %L::jsonb)', aid, jsonb_set(base, '{respuestas}', jsonb_build_object(fq::text, 'x'))), 'falta responder: ¿pasas con alguien?') then raise exception 'FALLO T1h'; end if;
  -- Menor de edad: también el correo del tutor.
  if not pg_temp.falla(format('select audition_apply(%L, %L::jsonb)', aid, base || jsonb_build_object('fecha_nacimiento', (hoy_mx() - interval '14 years')::date::text,
       'tutor_nombre', 'Mamá', 'tutor_telefono', '55', 'consentimiento_tutor', true)), 'correo de tu madre') then raise exception 'FALLO T1i'; end if;
  if exists (select 1 from audition_applications where audition_id = aid) then raise exception 'FALLO T1f: se guardó algo incompleto'; end if;

  -- T2: completa se guarda, con su perfil (habilidades incluidas).
  app := (audition_apply(aid, base)->>'application_id')::uuid;
  perform pg_temp.reset();
  if (select perfil_tesitura || '/' || perfil_canto || '/' || array_to_string(perfil_habilidades, ',') from audition_applications where id = app) <> 'no_se/basico/Ninguna' then raise exception 'FALLO T2a'; end if;
  if cardinality(_audition_faltantes((select x from audition_applications x where x.id = app))) <> 0 then raise exception 'FALLO T2b'; end if;

  -- T3: al editar, la foto que ya había subido cuenta; no hay que volver a subirla.
  perform pg_temp.as_user(ana);
  perform audition_apply(aid, base - 'foto_path');
  perform pg_temp.reset();
  if (select foto_path from audition_applications where id = app) is null then raise exception 'FALLO T3'; end if;

  -- T4: «qué le falta» cuenta personaje y perfil (para solicitudes viejas que quedaron incompletas).
  update audition_applications set roles = '{}', perfil_canto = null where id = app;
  if _audition_faltantes((select x from audition_applications x where x.id = app)) <> array['Personaje', 'Canto'] then
    raise exception 'FALLO T4: %', _audition_faltantes((select x from audition_applications x where x.id = app));
  end if;

  raise notice '0146 OK';
end $$;
