-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada). Precede: 0001–0167 aplicadas.
-- a1 es Dirección general, b1 es Dirección artística (gestiona), c1–c3 son jueces.
insert into auth.users (id, instance_id, aud, role, email)
select ('00000000-0000-0000-0000-000000167' || s)::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't167_' || s || '@test.local'
  from unnest(array['0a1','0b1','0c1','0c2','0c3']) s;
update profiles set nombre = 'Juez ' || right(id::text, 1) where id::text like '00000000-0000-0000-0000-0000001670c%';
insert into productions (id, nombre, estado) values ('t167_obra', 'Obra 167', 'borrador');
insert into production_members (production_id, user_id, role_id) values
  ('t167_obra', '00000000-0000-0000-0000-0000001670a1', 'direccion_general'),
  ('t167_obra', '00000000-0000-0000-0000-0000001670b1', 'direccion'),
  ('t167_obra', '00000000-0000-0000-0000-0000001670c1', 'juez'),
  ('t167_obra', '00000000-0000-0000-0000-0000001670c2', 'juez'),
  ('t167_obra', '00000000-0000-0000-0000-0000001670c3', 'juez')
on conflict do nothing;

create or replace function pg_temp.as_user(s text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', ('00000000-0000-0000-0000-000000167' || s)::uuid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create or replace function pg_temp.as_root() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;
create or replace function pg_temp.j(s text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-0000001670' || s)::uuid $$;
create temp table ctx (k text primary key, v uuid);
grant all on ctx to public;
create or replace function pg_temp.c(k text) returns uuid language sql as $$ select v from ctx where ctx.k = $1 $$;

-- Brady (más importante), Butchy, McKenzie. Mateo gana Brady y también es el más votado en Butchy (pasa a Luis).
-- McKenzie: Sofía y Vale empatan a 1; Sofía tiene una «Opción 1» de un juez y Vale no.
do $$ declare aid uuid; rb uuid; rt uuid; rm uuid; mateo uuid; luis uuid; sofia uuid; vale uuid; begin
  insert into auditions (production_id, titulo, estado, modalidad, visibilidad, con_callback, fase) values ('t167_obra', 'Aud 167', 'cerrada', 'en_linea', 'enlace', false, 'votacion') returning id into aid;
  insert into audition_roles (audition_id, nombre, orden) values (aid, 'Brady', 1) returning id into rb;
  insert into audition_roles (audition_id, nombre, orden) values (aid, 'Butchy', 2) returning id into rt;
  insert into audition_roles (audition_id, nombre, orden) values (aid, 'McKenzie', 3) returning id into rm;
  insert into audition_applications (audition_id, walk_in, nombre, fecha_nacimiento, telefono, estado) values (aid, true, 'Mateo', '2010-01-01', '1', 'convocado') returning id into mateo;
  insert into audition_applications (audition_id, walk_in, nombre, fecha_nacimiento, telefono, estado) values (aid, true, 'Luis', '2010-01-01', '2', 'convocado') returning id into luis;
  insert into audition_applications (audition_id, walk_in, nombre, fecha_nacimiento, telefono, estado) values (aid, true, 'Sofia', '2010-01-01', '3', 'convocado') returning id into sofia;
  insert into audition_applications (audition_id, walk_in, nombre, fecha_nacimiento, telefono, estado) values (aid, true, 'Vale', '2010-01-01', '4', 'convocado') returning id into vale;
  insert into ctx values ('aid', aid), ('rb', rb), ('rt', rt), ('rm', rm), ('mateo', mateo), ('luis', luis), ('sofia', sofia), ('vale', vale);
  insert into audition_picks (application_id, judge_id, ronda, opcion, role_id, ensamble) values (sofia, pg_temp.j('c1'), 1, 1, rm, false);
  insert into audition_votes (audition_id, role_id, judge_id, application_id) values
    (aid, rb, pg_temp.j('c1'), mateo), (aid, rb, pg_temp.j('c2'), mateo), (aid, rb, pg_temp.j('c3'), luis),
    (aid, rt, pg_temp.j('c1'), mateo), (aid, rt, pg_temp.j('c2'), mateo), (aid, rt, pg_temp.j('c3'), luis),
    (aid, rm, pg_temp.j('c1'), sofia), (aid, rm, pg_temp.j('c2'), vale), (aid, rm, pg_temp.j('c3'), null);
end $$;

-- T1: cerrar la votación arma la propuesta con segundo lugar y desempate, y anota por qué.
do $$ declare n jsonb; begin
  perform pg_temp.as_user('0b1');
  perform audition_fase(pg_temp.c('aid'), 'siguiente');
  perform pg_temp.as_root();
  if (select application_id from audition_cast where role_id = pg_temp.c('rb')) <> pg_temp.c('mateo') then raise exception 'FALLO T1: Brady'; end if;
  if (select application_id from audition_cast where role_id = pg_temp.c('rt')) <> pg_temp.c('luis') then raise exception 'FALLO T1: Butchy no pasó al segundo'; end if;
  if (select count(*) from audition_cast where role_id = pg_temp.c('rm')) <> 1
     or (select application_id from audition_cast where role_id = pg_temp.c('rm')) <> pg_temp.c('sofia') then raise exception 'FALLO T1: desempate McKenzie % %', (select array_agg(ap.nombre) from audition_cast c join audition_applications ap on ap.id = c.application_id where c.role_id = pg_temp.c('rm')), (select propuesta_notas from auditions where id = pg_temp.c('aid')); end if;
  n := (select propuesta_notas from auditions where id = pg_temp.c('aid'));
  if n ? pg_temp.c('rb')::text then raise exception 'FALLO T1: Brady no debía tener nota'; end if;
  if n->>pg_temp.c('rt')::text not like 'Mateo ya quedó en Brady%Luis%' then raise exception 'FALLO T1: nota Butchy %', n; end if;
  if n->>pg_temp.c('rm')::text not like '%Empate a 1 voto con Vale%Opción 1%' then raise exception 'FALLO T1: nota McKenzie %', n; end if;
end $$;

-- T2: Dirección artística ve el tablero y los resultados pero no mueve, no agrega ni regresa; un juez ve los resultados.
do $$ declare j json; begin
  perform pg_temp.as_user('0b1');
  j := audition_cast_board(pg_temp.c('aid'));
  if (j->>'puede_mover')::boolean then raise exception 'FALLO T2: artística puede mover'; end if;
  if (j->'roles'->1->>'nota') is null then raise exception 'FALLO T2: sin nota en el tablero'; end if;
  begin perform audition_cast_move(pg_temp.c('aid'), pg_temp.c('vale'), pg_temp.c('rm')::text); raise exception 'FALLO T2: artística movió';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin perform audition_cast_personaje(pg_temp.c('aid'), 'Surfista 3'); raise exception 'FALLO T2: artística agregó';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin perform audition_fase(pg_temp.c('aid'), 'anterior'); raise exception 'FALLO T2: artística regresó';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  perform pg_temp.as_user('0c2');
  j := audition_resultados(pg_temp.c('aid'));
  if (j->>'jueces')::int <> 3 then raise exception 'FALLO T2: jueces %', j->>'jueces'; end if;
  if (j->'roles'->0->'ranking'->0->>'nombre') <> 'Mateo' or (j->'roles'->0->'ranking'->0->>'votos')::int <> 2 then raise exception 'FALLO T2: ranking %', j->'roles'->0; end if;
  if (j->'roles'->2->>'abstenciones')::int <> 1 or json_array_length(j->'roles'->2->'por_juez') <> 3 then raise exception 'FALLO T2: McKenzie %', j->'roles'->2; end if;
  perform pg_temp.as_root();
end $$;

-- T3: Dirección general agrega un personaje con alguien, mueve, quita un personaje vacío y manda.
do $$ declare nuevo uuid; vacio uuid; begin
  perform pg_temp.as_user('0a1');
  if not (audition_cast_board(pg_temp.c('aid'))->>'puede_mover')::boolean then raise exception 'FALLO T3: general no puede mover'; end if;
  nuevo := audition_cast_personaje(pg_temp.c('aid'), 'Surfista 3', pg_temp.c('vale'));
  perform pg_temp.as_root();
  if (select role_id from audition_cast where application_id = pg_temp.c('vale')) is distinct from nuevo then raise exception 'FALLO T3: no asignó al nuevo personaje'; end if;
  perform pg_temp.as_user('0a1');
  begin perform audition_cast_personaje(pg_temp.c('aid'), 'surfista 3'); raise exception 'FALLO T3: duplicó personaje';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  vacio := audition_cast_personaje(pg_temp.c('aid'), 'Lifeguard');
  begin perform audition_cast_quitar_personaje(pg_temp.c('aid'), nuevo); raise exception 'FALLO T3: quitó uno con gente';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin perform audition_cast_quitar_personaje(pg_temp.c('aid'), pg_temp.c('rb')); raise exception 'FALLO T3: quitó uno votado';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  perform audition_cast_move(pg_temp.c('aid'), pg_temp.c('mateo'), 'fuera');
  perform audition_cast_move(pg_temp.c('aid'), pg_temp.c('mateo'), pg_temp.c('rb')::text);
  perform audition_cast_quitar_personaje(pg_temp.c('aid'), vacio);
  perform pg_temp.as_root();
  if exists (select 1 from audition_roles where id = vacio) then raise exception 'FALLO T3: no quitó el vacío'; end if;
  perform pg_temp.as_user('0a1');
  perform audition_cast_enviar(pg_temp.c('aid'), null, null);
  perform pg_temp.as_root();
  if (select fase from auditions where id = pg_temp.c('aid')) <> 'enviado' then raise exception 'FALLO T3: no se mandó'; end if;
  perform pg_temp.as_root();
end $$;

-- T4: regresar del ajuste (Dirección general) limpia el cast y las notas.
do $$ begin
  update auditions set fase = 'ajuste' where id = pg_temp.c('aid');
  perform pg_temp.as_user('0a1');
  perform audition_fase(pg_temp.c('aid'), 'anterior');
  perform pg_temp.as_root();
  if exists (select 1 from audition_cast where audition_id = pg_temp.c('aid')) then raise exception 'FALLO T4: quedó cast'; end if;
  if (select propuesta_notas from auditions where id = pg_temp.c('aid')) <> '{}' then raise exception 'FALLO T4: quedaron notas'; end if;
end $$;

do $$ begin raise notice '0167 OK'; end $$;
