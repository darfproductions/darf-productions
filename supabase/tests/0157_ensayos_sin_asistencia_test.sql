-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0157 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000157a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't157_dir@test.local'),
  ('00000000-0000-0000-0000-000000157a02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't157_ana@test.local');
insert into productions (id, nombre, estado) values ('t157_obra', 'Obra 157', 'borrador');
insert into production_members (production_id, user_id, role_id) values
  ('t157_obra', '00000000-0000-0000-0000-000000157a01', 'direccion'),
  ('t157_obra', '00000000-0000-0000-0000-000000157a02', 'integrante');

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

do $$
declare dir text := '00000000-0000-0000-0000-000000157a01'; ana uuid := '00000000-0000-0000-0000-000000157a02';
        rs uuid; rn uuid; ok boolean; tk text;
begin
  insert into rehearsals (production_id, titulo, inicia, sin_asistencia) values ('t157_obra', 'Lectura', now() - interval '10 min', true) returning id into rs;
  insert into rehearsals (production_id, titulo, inicia) values ('t157_obra', 'Normal', now() - interval '10 min') returning id into rn;
  perform pg_temp.as_user(dir);

  -- T1: sin asistencia: nadie pasa lista, no se abre, no se marca ni se cierra con faltas.
  if puede_pasar_lista(rs) then raise exception 'FALLO T1a: pasa lista'; end if;
  if not puede_pasar_lista(rn) then raise exception 'FALLO T1b: el normal sí'; end if;
  begin perform ensayo_abrir(rs); ok := false; exception when others then ok := sqlerrm like '%no lleva asistencia%'; end;
  if not ok then raise exception 'FALLO T1c: se abrió'; end if;
  begin perform ensayo_marcar(rs, ana, 'falta', null); ok := false; exception when others then ok := true; raise notice 'T1d: %', sqlerrm; end;
  if not ok then raise exception 'FALLO T1d: se marcó'; end if;
  begin perform ensayo_cerrar(rs); ok := false; exception when others then ok := true; end;
  set local role postgres;
  if exists (select 1 from rehearsal_attendance where rehearsal_id = rs) then raise exception 'FALLO T1e: hay asistencia'; end if;

  -- T2: el normal sigue igual; con asistencia ya no se puede marcar como sin asistencia.
  perform pg_temp.as_user(dir);
  perform ensayo_marcar(rn, ana, 'presente', null);
  set local role postgres;
  begin update rehearsals set sin_asistencia = true where id = rn; ok := false; exception when others then ok := sqlerrm like '%ya tiene asistencia%'; end;
  if not ok then raise exception 'FALLO T2: se marcó sin asistencia con lista'; end if;

  -- T3: sí sale en el calendario de Ana (0156).
  perform pg_temp.as_user(ana::text);
  tk := mi_calendario_liga();
  set local role postgres;
  if not exists (select 1 from json_array_elements(calendario_eventos(tk)->'eventos') e where e->>'uid' = 'ensayo-' || rs) then raise exception 'FALLO T3: no sale en el calendario'; end if;
end $$;

do $$ begin raise notice '0157 OK'; end $$;
