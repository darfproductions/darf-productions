-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0089 aplicadas.

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

-- T4: sin callback, "Siguiente" va directo a votación; votar antes no se puede; solo candidatos.
do $$ declare j json; begin
  perform pg_temp.as_user(pg_temp.u('f2'));
  begin perform audition_vote(pg_temp.c('aid'), pg_temp.c('r_donna'), pg_temp.c('p_ana')); raise exception 'FALLO T4: votó antes de abrir';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin perform audition_fase(pg_temp.c('aid'), 'siguiente'); raise exception 'FALLO T4: juez movió la fase';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  perform pg_temp.as_user(pg_temp.u('f1'));
  if audition_fase(pg_temp.c('aid'), 'siguiente') <> 'votacion' then raise exception 'FALLO T4: fase'; end if;
  perform pg_temp.as_user(pg_temp.u('f2'));
  begin perform audition_vote(pg_temp.c('aid'), pg_temp.c('r_donna'), pg_temp.c('p_lucia')); raise exception 'FALLO T4: votó por no candidato';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  -- Donna: Petra y Ana como candidatas, con sus opciones.
  j := audition_voting(pg_temp.c('aid'));
  if (select count(*) from json_array_elements((select x from json_array_elements(j->'roles') x where x->>'nombre' = 'Donna')->'candidatos')) <> 2 then raise exception 'FALLO T4: candidatos de Donna'; end if;
  perform pg_temp.as_root();
end $$;

-- T5: votos (ejemplo de Diego): Donna empate Petra/Ana; Sophie la gana Petra; Sam sin votos.
do $$ declare j json; begin
  perform pg_temp.as_user(pg_temp.u('f1'));
  perform audition_vote(pg_temp.c('aid'), pg_temp.c('r_donna'), pg_temp.c('p_petra'));
  perform audition_vote(pg_temp.c('aid'), pg_temp.c('r_sophie'), pg_temp.c('p_petra'));
  perform audition_vote(pg_temp.c('aid'), pg_temp.c('r_sam'), null);
  perform pg_temp.as_user(pg_temp.u('f2'));
  perform audition_vote(pg_temp.c('aid'), pg_temp.c('r_donna'), pg_temp.c('p_ana'));
  perform audition_vote(pg_temp.c('aid'), pg_temp.c('r_sophie'), pg_temp.c('p_petra'));
  perform pg_temp.as_user(pg_temp.u('f3'));
  perform audition_vote(pg_temp.c('aid'), pg_temp.c('r_donna'), null);
  perform audition_vote(pg_temp.c('aid'), pg_temp.c('r_sophie'), pg_temp.c('p_lucia'));
  -- Secretos: aún no hay conteos; el juez no ve la tabla de votos.
  j := audition_voting(pg_temp.c('aid'));
  if exists (select 1 from json_array_elements(j->'roles') r, json_array_elements(r->'candidatos') c where c->>'votos' is not null) then raise exception 'FALLO T5: conteos visibles'; end if;
  begin perform 1 from audition_votes; raise exception 'FALLO T5: lee votos directo';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  -- Quien gestiona ve quién votó.
  perform pg_temp.as_user(pg_temp.u('f1'));
  j := audition_voting(pg_temp.c('aid'));
  if json_array_length(j->'votaron') <> 3 then raise exception 'FALLO T5: votaron %', j->'votaron'; end if;
  perform pg_temp.as_root();
end $$;

-- T6: cerrar votación → propuesta con las reglas.
do $$ declare j json; donna json; sophie json; sam json; begin
  perform pg_temp.as_user(pg_temp.u('f1'));
  if audition_fase(pg_temp.c('aid'), 'siguiente') <> 'ajuste' then raise exception 'FALLO T6: fase'; end if;
  j := audition_cast_board(pg_temp.c('aid'));
  select x into donna from json_array_elements(j->'roles') x where x->>'nombre' = 'Donna';
  select x into sophie from json_array_elements(j->'roles') x where x->>'nombre' = 'Sophie';
  select x into sam from json_array_elements(j->'roles') x where x->>'nombre' = 'Sam';
  if (select string_agg(a->>'nombre', ',' order by a->>'nombre') from json_array_elements(donna->'asignados') a) <> 'Ana,Petra' then raise exception 'FALLO T6: Donna %', donna; end if;
  if json_array_length(sophie->'asignados') <> 0 then raise exception 'FALLO T6: Sophie no quedó vacía %', sophie; end if;
  if (sophie->'pista'->0->>'nombre') <> 'Lucía' then raise exception 'FALLO T6: pista de Sophie %', sophie->'pista'; end if;
  if json_array_length(sam->'asignados') <> 0 then raise exception 'FALLO T6: Sam'; end if;
  if (j->'ensamble'->0->>'nombre') <> 'Beto' then raise exception 'FALLO T6: ensamble %', j->'ensamble'; end if;
  if not exists (select 1 from json_array_elements(j->'fuera') f where f->>'nombre' = 'Carla') then raise exception 'FALLO T6: Carla fuera'; end if;
  -- Conteos ya visibles.
  j := audition_voting(pg_temp.c('aid'));
  if not exists (select 1 from json_array_elements(j->'roles') r, json_array_elements(r->'candidatos') c where (c->>'votos')::int > 0) then raise exception 'FALLO T6: conteos ocultos'; end if;
  perform pg_temp.as_root();
end $$;

-- T7: ajuste: Lucía a Sophie, Carla a Ensamble y el de sin cuenta también; un juez no mueve.
do $$ begin
  perform pg_temp.as_user(pg_temp.u('f2'));
  begin perform audition_cast_move(pg_temp.c('aid'), pg_temp.c('p_lucia'), pg_temp.c('r_sophie')::text); raise exception 'FALLO T7: juez movió';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  perform pg_temp.as_user(pg_temp.u('f1'));
  perform audition_cast_move(pg_temp.c('aid'), pg_temp.c('p_lucia'), pg_temp.c('r_sophie')::text);
  perform audition_cast_move(pg_temp.c('aid'), pg_temp.c('p_carla'), 'ensamble');
  perform audition_cast_move(pg_temp.c('aid'), pg_temp.c('p_sin c'), 'ensamble');
  perform audition_cast_move(pg_temp.c('aid'), pg_temp.c('p_carla'), 'fuera');
  perform audition_cast_move(pg_temp.c('aid'), pg_temp.c('p_carla'), 'ensamble');
  perform pg_temp.as_root();
  if (select count(*) from audition_cast where audition_id = pg_temp.c('aid')) <> 6 then raise exception 'FALLO T7: cast %', (select count(*) from audition_cast where audition_id = pg_temp.c('aid')); end if;
end $$;

-- T8: mandar: ofertas a quien tiene cuenta (con aviso), sin cuenta reportado; ya no se puede mover.
do $$ declare j json; begin
  perform pg_temp.as_user(pg_temp.u('f2'));
  begin perform audition_cast_enviar(pg_temp.c('aid'), null, null); raise exception 'FALLO T8: juez mandó';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  perform pg_temp.as_user(pg_temp.u('f1'));
  j := audition_cast_enviar(pg_temp.c('aid'), '¡Bienvenida!', null);
  if (j->>'ofertas')::int <> 5 or (j->>'sin_cuenta')::int <> 1 then raise exception 'FALLO T8: resumen %', j; end if;
  begin perform audition_cast_move(pg_temp.c('aid'), pg_temp.c('p_beto'), 'fuera'); raise exception 'FALLO T8: movió después de mandar';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  perform pg_temp.as_root();
  if (select string_agg(tipo || ':' || coalesce(papel, '-'), ',' order by tipo, papel) from casting_offers where application_id in (select id from audition_applications where audition_id = pg_temp.c('aid')))
     <> 'ensamble:-,ensamble:-,reparto:Donna,reparto:Donna,reparto:Sophie' then
    raise exception 'FALLO T8: ofertas %', (select string_agg(tipo || ':' || coalesce(papel, '-'), ',') from casting_offers);
  end if;
  if not exists (select 1 from notifications where user_id = pg_temp.u('a1') and titulo like 'Tienes una oferta en%' and detalle like 'Donna%') then raise exception 'FALLO T8: aviso de oferta'; end if;
  if (select fase from auditions where id = pg_temp.c('aid')) <> 'enviado' then raise exception 'FALLO T8: fase'; end if;
end $$;

-- T9: con callback: elegir quién pasa, copiar opciones a la ronda 2 y avisar; votación en ronda 2.
do $$ declare aid uuid; p1 uuid; p2 uuid; j json; begin
  insert into auditions (production_id, titulo, estado, modalidad, con_callback) values ('showman', 'Casting 89 B', 'abierta', 'en_linea', true) returning id into aid;
  perform pg_temp.as_user(pg_temp.u('f1'));
  perform audition_import_characters(aid);
  perform pg_temp.as_root();
  insert into audition_applications (audition_id, user_id, nombre, fecha_nacimiento, telefono) values (aid, pg_temp.u('a1'), 'Petra', '2000-01-01', '55') returning id into p1;
  insert into audition_applications (audition_id, user_id, nombre, fecha_nacimiento, telefono) values (aid, pg_temp.u('a2'), 'Ana', '2000-01-01', '55') returning id into p2;
  perform pg_temp.as_user(pg_temp.u('f2'));
  perform audition_picks_set(p1, 1, format('[{"opcion":1,"role_id":"%s"}]', (select id from audition_roles where audition_id = aid and nombre = 'Donna'))::jsonb);
  perform audition_picks_set(p2, 1, format('[{"opcion":1,"role_id":"%s"}]', (select id from audition_roles where audition_id = aid and nombre = 'Donna'))::jsonb);
  perform pg_temp.as_user(pg_temp.u('f1'));
  if audition_fase(aid, 'siguiente') <> 'seleccion_callback' then raise exception 'FALLO T9: fase 1'; end if;
  begin perform audition_fase(aid, 'siguiente'); raise exception 'FALLO T9: pasó sin elegir callback';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  update audition_applications set estado = 'callback' where id = p1;
  if audition_fase(aid, 'siguiente') <> 'callback' then raise exception 'FALLO T9: fase 2'; end if;
  perform pg_temp.as_root();
  if (select ronda from audition_applications where id = p1) <> 2 then raise exception 'FALLO T9: ronda'; end if;
  if not exists (select 1 from audition_picks where application_id = p1 and ronda = 2) then raise exception 'FALLO T9: copia de opciones'; end if;
  if not exists (select 1 from notifications where user_id = pg_temp.u('a1') and titulo = '¡Pasaste a callback!') then raise exception 'FALLO T9: aviso callback'; end if;
  perform pg_temp.as_user(pg_temp.u('f1'));
  if audition_fase(aid, 'siguiente') <> 'votacion' then raise exception 'FALLO T9: fase 3'; end if;
  j := audition_voting(aid);
  -- Solo Petra (pasó a callback) es candidata; Ana no.
  if (select count(*) from json_array_elements((select x from json_array_elements(j->'roles') x where x->>'nombre' = 'Donna')->'candidatos')) <> 1 then raise exception 'FALLO T9: candidatos ronda 2'; end if;
  -- Regresar a callback se permite.
  if audition_fase(aid, 'anterior') <> 'callback' then raise exception 'FALLO T9: regresar'; end if;
  perform pg_temp.as_root();
end $$;

-- T10: sin personajes no hay fases.
do $$ declare aid uuid; begin
  insert into auditions (production_id, titulo, estado) values ('showman', 'Sin personajes', 'abierta') returning id into aid;
  perform pg_temp.as_user(pg_temp.u('f1'));
  begin perform audition_fase(aid, 'siguiente'); raise exception 'FALLO T10: fases sin personajes';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  perform pg_temp.as_root();
end $$;

select 'OK 0089' as resultado;
