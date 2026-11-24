-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada). Precede: 0001–0168 aplicadas.
-- a1 es Dirección general. Vale y Luis tienen cuenta.
insert into auth.users (id, instance_id, aud, role, email)
select ('00000000-0000-0000-0000-000000168' || s)::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't168_' || s || '@test.local'
  from unnest(array['0a1','0b1','0b2']) s;
insert into productions (id, nombre, estado) values ('t168_obra', 'Obra 168', 'borrador');
insert into production_members (production_id, user_id, role_id) values ('t168_obra', '00000000-0000-0000-0000-0000001680a1', 'direccion_general') on conflict do nothing;
create or replace function pg_temp.as_user(s text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', ('00000000-0000-0000-0000-000000168' || s)::uuid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create or replace function pg_temp.as_root() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true); end $$;
create temp table ctx (k text primary key, v uuid);
grant all on ctx to public;
create or replace function pg_temp.c(k text) returns uuid language sql as $$ select v from ctx where ctx.k = $1 $$;

do $$ declare aid uuid; pc uuid; rb uuid; vale uuid; luis uuid; begin
  insert into production_characters (production_id, nombre, orden, categoria) values ('t168_obra', 'Butchy', 1, 'apoyo') returning id into pc;
  insert into auditions (production_id, titulo, estado, modalidad, visibilidad, fase) values ('t168_obra', 'Aud 168', 'cerrada', 'en_linea', 'enlace', 'ajuste') returning id into aid;
  insert into audition_roles (audition_id, nombre, orden, character_id) values (aid, 'Butchy', 1, pc) returning id into rb;
  insert into audition_applications (audition_id, user_id, nombre, fecha_nacimiento, telefono, estado) values (aid, '00000000-0000-0000-0000-0000001680b1', 'Vale', '2010-01-01', '1', 'convocado') returning id into vale;
  insert into audition_applications (audition_id, user_id, nombre, fecha_nacimiento, telefono, estado) values (aid, '00000000-0000-0000-0000-0000001680b2', 'Luis', '2010-01-01', '2', 'convocado') returning id into luis;
  insert into ctx values ('aid', aid), ('rb', rb), ('vale', vale), ('luis', luis);
end $$;

-- T1: la categoría sale del personaje de la obra; se crea un grupo de ensamble y se le asigna a alguien.
do $$ declare j json; g uuid; begin
  perform pg_temp.as_user('0a1');
  g := audition_cast_personaje(pg_temp.c('aid'), 'Surfistas', pg_temp.c('vale'), 'ensamble');
  begin perform audition_cast_personaje(pg_temp.c('aid'), 'Otro', null, 'jefe'); raise exception 'FALLO T1: categoría inválida';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  perform audition_cast_move(pg_temp.c('aid'), pg_temp.c('luis'), pg_temp.c('rb')::text);
  j := audition_cast_board(pg_temp.c('aid'));
  if (j->'roles'->0->>'nombre') <> 'Butchy' or (j->'roles'->0->>'categoria') <> 'apoyo' then raise exception 'FALLO T1: Butchy %', j->'roles'->0; end if;
  if (j->'roles'->1->>'nombre') <> 'Surfistas' or (j->'roles'->1->>'categoria') <> 'ensamble' then raise exception 'FALLO T1: grupo %', j->'roles'->1; end if;
  -- T2: al mandar, el grupo va como oferta de Ensamble con el nombre del grupo.
  perform audition_cast_enviar(pg_temp.c('aid'), null, null);
  perform pg_temp.as_root();
  if (select string_agg(tipo || ':' || coalesce(papel, '-'), ',' order by tipo) from casting_offers where application_id in (pg_temp.c('vale'), pg_temp.c('luis')))
     <> 'ensamble:Surfistas,reparto:Butchy' then
    raise exception 'FALLO T2: %', (select string_agg(tipo || ':' || coalesce(papel, '-'), ',') from casting_offers where application_id in (pg_temp.c('vale'), pg_temp.c('luis')));
  end if;
end $$;

do $$ begin raise notice '0168 OK'; end $$;
