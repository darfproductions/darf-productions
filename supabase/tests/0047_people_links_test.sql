-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0031–0047 aplicadas.

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_admin@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_diego@test.local'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_fan@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_dir@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-0000000000a1';
update profiles set nombre = 'Diego Romero' where id = '00000000-0000-0000-0000-0000000000c1';

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create temp table ctx (persona uuid);
grant all on ctx to authenticated, anon;

do $$ declare p uuid; begin
  insert into people (nombre) values ('Diego Romero') returning id into p;
  insert into production_credits (production_id, person_id, tipo, papel) values ('mm', p, 'reparto', 'Sam');
  insert into ctx values (p);
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform panel_add_member('mm', 't_dir@test.local', 'direccion');
  reset role;
end $$;

-- T1: ficha de una persona sin cuenta: la ven el Director y la Dirección de la obra; un fan no
do $$ declare h jsonb; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  h := person_history((select persona from ctx));
  if h->'obras'->0->>'papel' <> 'Sam' then raise exception 'FALLO T1a: %', h; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
  begin
    perform person_history((select persona from ctx));
    raise exception 'FALLO T1: un fan vio la ficha';
  exception when raise_exception then
    if sqlerrm not like 'No autorizado%' then raise exception 'FALLO T1b: %', sqlerrm; end if;
  end;
  reset role;
end $$;

-- T2: sugerencia de liga por nombre (sin acentos); al ligar desaparece y la ficha completa trae la obra
do $$ declare n int; h jsonb; begin
  update people set nombre = 'Diego Romeró' where id = (select persona from ctx);
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  begin
    perform people_link_suggestions();
    raise exception 'FALLO T2: Dirección vio sugerencias';
  exception when raise_exception then
    if sqlerrm not like 'Solo el Director%' then raise exception 'FALLO T2a: %', sqlerrm; end if;
  end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  select count(*) into n from people_link_suggestions() where person_id = (select persona from ctx) and user_id = '00000000-0000-0000-0000-0000000000c1';
  if n <> 1 then raise exception 'FALLO T2b: no sugirió la liga'; end if;
  perform people_link_account((select persona from ctx), 't_diego@test.local');
  select count(*) into n from people_link_suggestions() where person_id = (select persona from ctx);
  if n <> 0 then raise exception 'FALLO T2c: sigue sugiriendo una ficha ya ligada'; end if;
  h := talent_history('00000000-0000-0000-0000-0000000000c1');
  if jsonb_array_length(h->'obras') <> 1 then raise exception 'FALLO T2d: %', h; end if;
  reset role;
end $$;

-- T3: compras solo las ve el Director
do $$ declare n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  select count(*) into n from talent_purchases('00000000-0000-0000-0000-0000000000c2');
  if n <> 0 then raise exception 'FALLO T3a'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  begin
    perform talent_purchases('00000000-0000-0000-0000-0000000000c2');
    raise exception 'FALLO T3: Dirección vio compras';
  exception when raise_exception then
    if sqlerrm not like 'Solo el Director%' then raise exception 'FALLO T3b: %', sqlerrm; end if;
  end;
  reset role;
end $$;

do $$ begin raise exception 'OK: 0047 pruebas T1–T3 (se aborta a propósito para no persistir)'; end $$;
