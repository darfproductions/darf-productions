-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0164 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000164a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't164_inv@test.local'),
  ('00000000-0000-0000-0000-000000164a02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't164_otro@test.local');

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
declare inv text := '00000000-0000-0000-0000-000000164a01'; otro text := '00000000-0000-0000-0000-000000164a02'; aid uuid; base jsonb;
begin
  -- Convocatoria ya cerrada (por estado) y con la fecha de cierre vencida.
  insert into auditions (titulo, estado, pedir_foto, pedir_tutor, autorizacion_escuela, perfil_preguntas, elegir_horario, inscripcion_cierra)
  values ('Audición 164', 'cerrada', false, false, true, '{}', false, now() - interval '1 day') returning id into aid;
  insert into audition_invites (audition_id, email) values (aid, 't164_inv@test.local');
  base := jsonb_build_object('nombre', 'Invitada', 'telefono', '4421112233', 'fecha_nacimiento', '2000-01-01', 'consentimiento_datos', true);

  -- T1: sin invitación no se puede.
  perform pg_temp.as_user(otro);
  if not pg_temp.falla(format('select audition_apply(%L, %L::jsonb)', aid, base), 'no está abierta') then raise exception 'FALLO T1'; end if;
  -- T2: con invitación sí, y la ve en sus invitaciones.
  perform pg_temp.as_user(inv);
  if not exists (select 1 from my_audition_invites() where audition_id = aid) then raise exception 'FALLO T2a: no sale en mis invitaciones'; end if;
  perform audition_apply(aid, base);
  perform pg_temp.reset();
  if not exists (select 1 from audition_applications where audition_id = aid and user_id = inv::uuid) then raise exception 'FALLO T2b'; end if;
  -- T3: finalizada, ya no.
  update auditions set estado = 'finalizada' where id = aid;
  delete from audition_applications where audition_id = aid;
  perform pg_temp.as_user(inv);
  if not pg_temp.falla(format('select audition_apply(%L, %L::jsonb)', aid, base), 'no está abierta') then raise exception 'FALLO T3'; end if;
  perform pg_temp.reset();
end $$;

do $$ begin raise notice '0164 OK'; end $$;
