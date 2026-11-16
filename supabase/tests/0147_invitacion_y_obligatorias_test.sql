-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0147 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000147a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't147_nina@test.local'),
  ('00000000-0000-0000-0000-000000147a02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't147_otra@test.local');

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
declare nina text := '00000000-0000-0000-0000-000000147a01'; otra text := '00000000-0000-0000-0000-000000147a02';
        aid uuid; fo uuid; fr uuid; fc uuid; base jsonb; tutor jsonb;
begin
  -- Convocatoria para mayores de 18 que no pide datos de tutor (la escuela autoriza), sin foto ni perfil.
  insert into auditions (titulo, estado, pedir_foto, pedir_tutor, autorizacion_escuela, perfil_preguntas, elegir_horario, edad_min)
  values ('Audición 147', 'abierta', false, false, true, '{}', false, 18) returning id into aid;
  -- T0: una pregunta nueva nace opcional; se puede marcar obligatoria; «¿Con quién pasas?» nace opcional.
  insert into audition_fields (audition_id, etiqueta, tipo, orden) values (aid, 'Redes sociales', 'texto', 1) returning id into fo;
  if (select obligatorio from audition_fields where id = fo) then raise exception 'FALLO T0a'; end if;
  insert into audition_fields (audition_id, etiqueta, tipo, orden, obligatorio) values (aid, 'Canción', 'texto', 2, true) returning id into fr;
  if not (select obligatorio from audition_fields where id = fr) then raise exception 'FALLO T0b'; end if;

  base := jsonb_build_object('nombre', 'Nina', 'telefono', '4421112233', 'fecha_nacimiento', (hoy_mx() - interval '17 years')::date::text,
            'consentimiento_datos', true, 'respuestas', jsonb_build_object(fr::text, 'Let it go'));
  tutor := jsonb_build_object('tutor_nombre', 'Mamá', 'tutor_telefono', '55', 'tutor_email', 'mama@test.local', 'consentimiento_tutor', true);

  -- T1: sin invitación, a los 17 no puede.
  perform pg_temp.as_user(nina);
  if not pg_temp.falla(format('select audition_apply(%L, %L::jsonb)', aid, base || tutor), 'mayores de 18') then raise exception 'FALLO T1'; end if;
  perform pg_temp.reset();

  -- T2: con invitación directa sí, pero siendo menor tiene que dar los datos y la autorización del tutor.
  insert into audition_invites (audition_id, email) values (aid, 't147_nina@test.local');
  perform pg_temp.as_user(nina);
  if not pg_temp.falla(format('select audition_apply(%L, %L::jsonb)', aid, base), 'madre, padre o tutor') then raise exception 'FALLO T2a'; end if;
  if not pg_temp.falla(format('select audition_apply(%L, %L::jsonb)', aid, base || (tutor - 'consentimiento_tutor')), 'debe autorizar') then raise exception 'FALLO T2b'; end if;
  perform audition_apply(aid, base || tutor);
  perform pg_temp.reset();
  if (select tutor_email from audition_applications where audition_id = aid and user_id = nina::uuid) <> 'mama@test.local' then raise exception 'FALLO T2c'; end if;
  -- La pregunta opcional quedó vacía y no falta nada.
  if cardinality(_audition_faltantes((select x from audition_applications x where x.audition_id = aid and x.user_id = nina::uuid))) <> 0 then raise exception 'FALLO T2d'; end if;

  -- T3: la invitación es de Nina: otra persona de 17 sigue sin poder.
  perform pg_temp.as_user(otra);
  if not pg_temp.falla(format('select audition_apply(%L, %L::jsonb)', aid, base || tutor), 'mayores de 18') then raise exception 'FALLO T3a'; end if;
  -- La obligatoria sí bloquea (ya con 20 años).
  if not pg_temp.falla(format('select audition_apply(%L, %L::jsonb)', aid, jsonb_set(base, '{fecha_nacimiento}', to_jsonb((hoy_mx() - interval '20 years')::date::text)) || jsonb_build_object('respuestas', '{}'::jsonb)), 'falta responder: canción') then raise exception 'FALLO T3b'; end if;
  perform pg_temp.reset();

  raise notice '0147 OK';
end $$;
