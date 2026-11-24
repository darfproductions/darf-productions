-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada). Precede: 0001–0166 aplicadas.
-- f1 dirige (gestiona), f2 y f3 son jueces, f4 no tiene nada que ver.
insert into auth.users (id, instance_id, aud, role, email)
select ('00000000-0000-0000-0000-000000166' || s)::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't166_' || s || '@test.local'
  from unnest(array['0f1','0f2','0f3','0f4']) s;
update profiles set nombre = 'Juez ' || right(id::text, 1) where id::text like '00000000-0000-0000-0000-0000001660f%';
insert into productions (id, nombre, estado) values ('t166_obra', 'Obra 166', 'borrador');
insert into production_members (production_id, user_id, role_id) values
  ('t166_obra', '00000000-0000-0000-0000-0000001660f1', 'direccion'),
  ('t166_obra', '00000000-0000-0000-0000-0000001660f2', 'juez'),
  ('t166_obra', '00000000-0000-0000-0000-0000001660f3', 'juez')
on conflict do nothing;

create or replace function pg_temp.as_user(s text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', ('00000000-0000-0000-0000-000000166' || s)::uuid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create or replace function pg_temp.as_root() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;
create temp table ctx (k text primary key, v uuid);
grant all on ctx to public;
create or replace function pg_temp.c(k text) returns uuid language sql as $$ select v from ctx where ctx.k = $1 $$;

do $$ declare aid uuid; r1 uuid; a1 uuid; a2 uuid; j2 uuid := '00000000-0000-0000-0000-0000001660f2'; j3 uuid := '00000000-0000-0000-0000-0000001660f3'; begin
  insert into auditions (production_id, titulo, estado, modalidad, visibilidad, con_callback) values ('t166_obra', 'Aud 166', 'abierta', 'en_linea', 'enlace', true) returning id into aid;
  insert into audition_roles (audition_id, nombre, orden) values (aid, 'Brady', 1) returning id into r1;
  insert into audition_applications (audition_id, walk_in, nombre, fecha_nacimiento, telefono, estado, numero) values (aid, true, 'Ana', '2010-01-01', '1', 'convocado', 1) returning id into a1;
  insert into audition_applications (audition_id, walk_in, nombre, fecha_nacimiento, telefono, estado, numero) values (aid, true, 'Beto', '2010-01-01', '2', 'convocado', 2) returning id into a2;
  insert into ctx values ('aid', aid), ('r1', r1), ('a1', a1), ('a2', a2);
  insert into audition_scores (application_id, judge_id, ronda, puntos, notas) values
    (a1, j2, 1, '{"canto": 5}', 'Gran voz'), (a1, j3, 1, '{"canto": 3}', null), (a2, j2, 1, '{}', 'Nervioso');
  insert into audition_picks (application_id, judge_id, ronda, opcion, role_id, ensamble) values
    (a1, j3, 1, 1, r1, false), (a1, j3, 1, 2, null, true);
end $$;

-- T1: en la audición, la dirección ve todo; un juez todavía no; un externo nunca.
do $$ declare j json; begin
  perform pg_temp.as_user('0f1');
  j := audition_evaluaciones(pg_temp.c('aid'));
  if json_array_length(j->'evaluaciones') <> 3 then raise exception 'FALLO T1: % evaluaciones', json_array_length(j->'evaluaciones'); end if;
  if json_array_length(j->'personas') <> 2 then raise exception 'FALLO T1: personas'; end if;
  if (select e->>'opciones' from json_array_elements(j->'evaluaciones') e where e->>'juez' = 'Juez 3' and (e->>'app')::uuid = pg_temp.c('a1')) <> '["Brady", "Ensamble"]'
    then raise exception 'FALLO T1: opciones %', j->'evaluaciones'; end if;
  perform pg_temp.as_user('0f2');
  begin perform audition_evaluaciones(pg_temp.c('aid')); raise exception 'FALLO T1: juez vio antes de la votación';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  perform pg_temp.as_user('0f4');
  begin perform audition_evaluaciones(pg_temp.c('aid')); raise exception 'FALLO T1: externo';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin perform audition_expediente(pg_temp.c('aid')); raise exception 'FALLO T1: externo expediente';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  perform pg_temp.as_root();
end $$;

-- T2: en la votación, el juez ve las evaluaciones de todos; el expediente aún no trae votos.
do $$ declare j json; begin
  update auditions set fase = 'votacion' where id = pg_temp.c('aid');
  update audition_applications set ronda = 2 where id = pg_temp.c('a1');
  insert into audition_votes (audition_id, role_id, judge_id, application_id) values
    (pg_temp.c('aid'), pg_temp.c('r1'), '00000000-0000-0000-0000-0000001660f2', pg_temp.c('a1')),
    (pg_temp.c('aid'), pg_temp.c('r1'), '00000000-0000-0000-0000-0000001660f3', null);
  perform pg_temp.as_user('0f2');
  j := audition_evaluaciones(pg_temp.c('aid'));
  if json_array_length(j->'evaluaciones') <> 3 then raise exception 'FALLO T2: juez ve %', json_array_length(j->'evaluaciones'); end if;
  begin perform audition_expediente(pg_temp.c('aid')); raise exception 'FALLO T2: juez vio el expediente';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  perform pg_temp.as_user('0f1');
  j := audition_expediente(pg_temp.c('aid'));
  if (j->>'votacion') is not null or (j->>'cast') is not null then raise exception 'FALLO T2: votos antes de cerrar'; end if;
  if json_array_length(j->'callback') <> 1 or json_array_length(j->'jueces') <> 2 then raise exception 'FALLO T2: callback/jueces %', j; end if;
  perform pg_temp.as_root();
end $$;

-- T3: cerrada la votación, el expediente trae votos por juez, totales, abstenciones y cast.
do $$ declare j json; v json; begin
  update auditions set fase = 'enviado' where id = pg_temp.c('aid');
  insert into audition_cast (audition_id, application_id, role_id) values (pg_temp.c('aid'), pg_temp.c('a1'), pg_temp.c('r1')), (pg_temp.c('aid'), pg_temp.c('a2'), null);
  perform pg_temp.as_user('0f1');
  j := audition_expediente(pg_temp.c('aid'));
  v := j->'votacion'->0;
  if v->>'personaje' <> 'Brady' or (v->>'abstenciones')::int <> 1 then raise exception 'FALLO T3: %', v; end if;
  if (v->'totales'->0->>'votos')::int <> 1 or v->'totales'->0->>'nombre' <> 'Ana' then raise exception 'FALLO T3: totales %', v; end if;
  if json_array_length(v->'por_juez') <> 2 or (select count(*) from json_array_elements(v->'por_juez') e where e->>'voto' like '%Ana' and e->>'juez' = 'Juez 2') <> 1
    then raise exception 'FALLO T3: por juez %', v->'por_juez'; end if;
  if (j->'cast'->0->>'personaje') <> 'Brady' or (j->'cast'->1->>'personaje') <> 'Ensamble' then raise exception 'FALLO T3: cast %', j->'cast'; end if;
  if (j->'conteos'->>'inscritos')::int <> 2 then raise exception 'FALLO T3: conteos %', j->'conteos'; end if;
  perform pg_temp.as_root();
end $$;

do $$ begin raise notice '0166 OK'; end $$;
