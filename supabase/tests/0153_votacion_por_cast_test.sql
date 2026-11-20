-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada). Precede: 0001–0153 aplicadas.
-- Mismo arranque que la prueba de 0089 (personajes, aspirantes y opciones de los jueces).

-- Personas: f1 dirige (gestiona, evalúa y arma el elenco), f2 y f3 son jueces, f4 no tiene nada que ver.
-- Aspirantes con cuenta: Petra (a1), Ana (a2), Lucía (a3), Beto (a4), Carla (a5).
insert into auth.users (id, instance_id, aud, role, email)
select ('00000000-0000-0000-0000-0000000000' || s)::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't89_' || s || '@test.local'
  from unnest(array['f1','f2','f3','f4','a1','a2','a3','a4','a5']) s;
update profiles set nombre = 'Juez ' || right(id::text, 2) where id::text like '00000000-0000-0000-0000-0000000000f%';
insert into production_members (production_id, user_id, role_id) values
  ('showman', '00000000-0000-0000-0000-0000000000f1', 'direccion'),
  ('showman', '00000000-0000-0000-0000-0000000000f2', 'juez'),
  ('showman', '00000000-0000-0000-0000-0000000000f3', 'juez');

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
create or replace function pg_temp.u(s text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-0000000000' || s)::uuid $$;

create temp table ctx (k text primary key, v uuid);
grant all on ctx to public;
create or replace function pg_temp.c(k text) returns uuid language sql as $$ select v from ctx where ctx.k = $1 $$;

-- T1: personajes de la obra, importación a la convocatoria y orden.
do $$ declare aid uuid; n int; begin
  perform pg_temp.as_user(pg_temp.u('f1'));
  insert into production_characters (production_id, nombre, orden) values ('showman', 'Donna', 1), ('showman', 'Sophie', 2), ('showman', 'Sam', 3);
  perform pg_temp.as_user(pg_temp.u('f4'));
  begin insert into production_characters (production_id, nombre) values ('showman', 'Intruso'); raise exception 'FALLO T1: externo creó personaje';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  perform pg_temp.as_root();
  insert into auditions (production_id, titulo, estado, modalidad, visibilidad) values ('showman', 'Casting 89', 'abierta', 'en_linea', 'enlace') returning id into aid;
  insert into ctx values ('aid', aid);
  perform pg_temp.as_user(pg_temp.u('f1'));
  n := audition_import_characters(aid);
  if n <> 3 then raise exception 'FALLO T1: importó %', n; end if;
  if audition_import_characters(aid) <> 0 then raise exception 'FALLO T1: duplicó personajes'; end if;
  perform audition_role_move((select id from audition_roles where audition_id = aid and nombre = 'Sam'), -1);
  if (select string_agg(nombre, ',' order by orden) from audition_roles where audition_id = aid) <> 'Donna,Sam,Sophie' then raise exception 'FALLO T1: mover'; end if;
  perform audition_role_move((select id from audition_roles where audition_id = aid and nombre = 'Sam'), 1);
  if (select string_agg(nombre, ',' order by orden) from audition_roles where audition_id = aid) <> 'Donna,Sophie,Sam' then raise exception 'FALLO T1: regresar'; end if;
  perform pg_temp.as_root();
  insert into ctx select 'r_' || lower(nombre), id from audition_roles where audition_id = aid;
end $$;

-- T2: invitación a una convocatoria cerrada avisa a quien tiene cuenta.
do $$ begin
  perform pg_temp.as_user(pg_temp.u('f1'));
  insert into audition_invites (audition_id, email) values (pg_temp.c('aid'), 't89_a5@test.local');
  perform pg_temp.as_root();
  if not exists (select 1 from notifications where user_id = pg_temp.u('a5') and titulo = 'Te invitaron a audicionar') then raise exception 'FALLO T2: aviso de invitación'; end if;
end $$;

-- Aspirantes (en línea: no necesitan llegada) y uno sin cuenta.
do $$ declare s text; begin
  foreach s in array array['a1','a2','a3','a4','a5'] loop
    insert into audition_applications (audition_id, user_id, nombre, fecha_nacimiento, telefono)
    values (pg_temp.c('aid'), pg_temp.u(s), case s when 'a1' then 'Petra' when 'a2' then 'Ana' when 'a3' then 'Lucía' when 'a4' then 'Beto' else 'Carla' end, '2000-01-01', '55');
  end loop;
  insert into audition_applications (audition_id, user_id, walk_in, nombre, fecha_nacimiento, telefono) values (pg_temp.c('aid'), null, true, 'Sin cuenta', '2000-01-01', '55');
  insert into ctx select 'p_' || lower(left(translate(nombre, 'í', 'i'), 5)), id from audition_applications where audition_id = pg_temp.c('aid');
end $$;

-- T3: opciones de los jueces: máximo 3, sin repetir, solo jueces; el externo no.
do $$ begin
  perform pg_temp.as_user(pg_temp.u('f4'));
  begin perform audition_picks_set(pg_temp.c('p_petra'), 1, '[{"opcion":1,"role_id":"ensamble"}]'); raise exception 'FALLO T3: externo eligió';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  perform pg_temp.as_user(pg_temp.u('f1'));
  begin perform audition_picks_set(pg_temp.c('p_petra'), 1, format('[{"opcion":1,"role_id":"%s"},{"opcion":2,"role_id":"%s"}]', pg_temp.c('r_donna'), pg_temp.c('r_donna'))::jsonb);
        raise exception 'FALLO T3: repitió personaje';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  -- Juez 1: Petra (Donna, Sophie), Beto (Ensamble).
  perform audition_picks_set(pg_temp.c('p_petra'), 1, format('[{"opcion":1,"role_id":"%s"},{"opcion":2,"role_id":"%s"}]', pg_temp.c('r_donna'), pg_temp.c('r_sophie'))::jsonb);
  perform audition_picks_set(pg_temp.c('p_beto'), 1, '[{"opcion":1,"role_id":"ensamble"}]');
  -- Juez 2: Petra (Sophie, Donna), Ana (Donna).
  perform pg_temp.as_user(pg_temp.u('f2'));
  perform audition_picks_set(pg_temp.c('p_petra'), 1, format('[{"opcion":1,"role_id":"%s"},{"opcion":2,"role_id":"%s"}]', pg_temp.c('r_sophie'), pg_temp.c('r_donna'))::jsonb);
  perform audition_picks_set(pg_temp.c('p_ana'), 1, format('[{"opcion":1,"role_id":"%s"}]', pg_temp.c('r_donna'))::jsonb);
  -- Juez 3: Lucía (Sophie), Carla (Sam).
  perform pg_temp.as_user(pg_temp.u('f3'));
  perform audition_picks_set(pg_temp.c('p_lucia'), 1, format('[{"opcion":1,"role_id":"%s"}]', pg_temp.c('r_sophie'))::jsonb);
  perform audition_picks_set(pg_temp.c('p_carla'), 1, format('[{"opcion":1,"role_id":"%s"}]', pg_temp.c('r_sam'))::jsonb);
  -- El juez no lee opciones ajenas.
  if (select count(*) from audition_picks) <> 2 then raise exception 'FALLO T3: juez ve opciones ajenas (%)', (select count(*) from audition_picks); end if;
  perform pg_temp.as_root();
end $$;

-- A: con la votación abierta, el juez puede votar por cualquiera que audicionó, aunque nadie lo haya marcado.
do $$ declare j json; n int; begin
  perform pg_temp.as_user(pg_temp.u('f1'));
  perform audition_fase(pg_temp.c('aid'), 'siguiente');
  perform pg_temp.as_user(pg_temp.u('f2'));
  -- Su cast de una vez: Donna = Lucía (nadie la marcó para Donna), Sophie = Petra, Sam = me abstengo.
  n := audition_vote_cast(pg_temp.c('aid'), format('[{"rol":"%s","app":"%s"},{"rol":"%s","app":"%s"},{"rol":"%s","app":""}]',
        pg_temp.c('r_donna'), pg_temp.c('p_lucia'), pg_temp.c('r_sophie'), pg_temp.c('p_petra'), pg_temp.c('r_sam'))::jsonb);
  if n <> 3 then raise exception 'FALLO A: guardó %', n; end if;
  j := audition_voting(pg_temp.c('aid'));
  if (select x->>'mi_voto' from json_array_elements(j->'roles') x where x->>'nombre' = 'Donna') <> pg_temp.c('p_lucia')::text then raise exception 'FALLO A: mi voto Donna'; end if;
  if (select x->>'mi_voto' from json_array_elements(j->'roles') x where x->>'nombre' = 'Sam') <> 'abstencion' then raise exception 'FALLO A: abstención'; end if;
  -- Lucía aparece en Donna para quien la votó (con Petra y Ana), sin conteos.
  if (select count(*) from json_array_elements((select x from json_array_elements(j->'roles') x where x->>'nombre' = 'Donna')->'candidatos')) <> 3 then raise exception 'FALLO A: candidatos Donna (f2)'; end if;
  -- Todos los audicionantes, para el desplegable.
  if json_array_length(j->'aspirantes') <> 6 then raise exception 'FALLO A: aspirantes %', json_array_length(j->'aspirantes'); end if;
  -- Mi opción como referencia: f2 puso a Petra opción 2 para Donna y a Ana opción 1.
  if (select c->>'mi_opcion' from json_array_elements(j->'roles') x, json_array_elements(x->'candidatos') c where x->>'nombre' = 'Donna' and c->>'id' = pg_temp.c('p_petra')::text) <> '2' then raise exception 'FALLO A: mi opción Petra'; end if;
  if (select c->>'mi_opcion' from json_array_elements(j->'roles') x, json_array_elements(x->'candidatos') c where x->>'nombre' = 'Donna' and c->>'id' = pg_temp.c('p_lucia')::text) is not null then raise exception 'FALLO A: mi opción Lucía'; end if;
  -- Otro juez no ve a Lucía en Donna (el voto de f2 es secreto).
  perform pg_temp.as_user(pg_temp.u('f3'));
  j := audition_voting(pg_temp.c('aid'));
  if (select count(*) from json_array_elements((select x from json_array_elements(j->'roles') x where x->>'nombre' = 'Donna')->'candidatos')) <> 2 then raise exception 'FALLO A: voto ajeno visible'; end if;
  perform pg_temp.as_root();
end $$;

-- B: no se puede votar por alguien cancelado ni por alguien de otra convocatoria.
do $$ begin
  update audition_applications set estado = 'cancelado' where id = pg_temp.c('p_carla');
  perform pg_temp.as_user(pg_temp.u('f3'));
  begin perform audition_vote(pg_temp.c('aid'), pg_temp.c('r_sam'), pg_temp.c('p_carla')); raise exception 'FALLO B: votó por cancelada';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin perform audition_vote(pg_temp.c('aid'), pg_temp.c('r_sam'), gen_random_uuid()); raise exception 'FALLO B: votó por desconocido';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  perform pg_temp.as_root();
end $$;

-- C: al cerrar, la propuesta toma el voto aunque nadie la haya marcado: Donna = Lucía (f1 y f2) contra Ana (f3).
do $$ declare j json; begin
  perform pg_temp.as_user(pg_temp.u('f1'));
  perform audition_vote(pg_temp.c('aid'), pg_temp.c('r_donna'), pg_temp.c('p_lucia'));
  perform pg_temp.as_user(pg_temp.u('f3'));
  perform audition_vote(pg_temp.c('aid'), pg_temp.c('r_donna'), pg_temp.c('p_ana'));
  perform pg_temp.as_user(pg_temp.u('f1'));
  perform audition_fase(pg_temp.c('aid'), 'siguiente');
  perform pg_temp.as_root();
  if (select application_id from audition_cast c join audition_roles r on r.id = c.role_id where r.nombre = 'Donna' and c.audition_id = pg_temp.c('aid')) <> pg_temp.c('p_lucia') then raise exception 'FALLO C: Donna'; end if;
  perform pg_temp.as_user(pg_temp.u('f2'));
  j := audition_voting(pg_temp.c('aid'));
  if (select (c->>'votos')::int from json_array_elements(j->'roles') x, json_array_elements(x->'candidatos') c where x->>'nombre' = 'Donna' and c->>'id' = pg_temp.c('p_lucia')::text) <> 2 then raise exception 'FALLO C: conteo Lucía'; end if;
  perform pg_temp.as_root();
end $$;

do $$ begin raise notice '0153 OK'; end $$;
