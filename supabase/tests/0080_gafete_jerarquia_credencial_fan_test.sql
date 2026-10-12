-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0080 aplicadas.

insert into auth.users (id, instance_id, aud, role, email)
values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_ceo@test.local'),
       ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_dir@test.local'),
       ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_staff@test.local'),
       ('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_elenco@test.local'),
       ('00000000-0000-0000-0000-0000000000e5', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_fan@test.local'),
       ('00000000-0000-0000-0000-0000000000e6', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_fan2@test.local'),
       ('00000000-0000-0000-0000-0000000000e7', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_vocal@test.local');
update profiles set rol = 'admin', nombre = 'Diego Ceo' where id = '00000000-0000-0000-0000-0000000000e1';
update profiles set nombre = 'Fernanda López Ruiz', telefono = '4420001111' where id = '00000000-0000-0000-0000-0000000000e5';
-- El CEO también dirige una obra; el director solo dirige; staff de obra; elenco; vocal por crédito.
insert into production_members (production_id, user_id, role_id) values
  ('showman', '00000000-0000-0000-0000-0000000000e1', 'direccion'),
  ('hsm', '00000000-0000-0000-0000-0000000000e2', 'direccion'),
  ('hsm', '00000000-0000-0000-0000-0000000000e2', 'integrante'),
  ('mm', '00000000-0000-0000-0000-0000000000e3', 'staff'),
  ('showman', '00000000-0000-0000-0000-0000000000e4', 'integrante');
do $$ declare pe uuid; begin
  select id into pe from people where profile_id = '00000000-0000-0000-0000-0000000000e1';
  if pe is null then insert into people (nombre, profile_id) values ('Diego Ceo', '00000000-0000-0000-0000-0000000000e1') returning id into pe; end if;
  insert into team_members (person_id, cargo) values (pe, 'CEO');
  select id into pe from people where profile_id = '00000000-0000-0000-0000-0000000000e7';
  if pe is null then insert into people (nombre, profile_id) values ('Vale Vocal', '00000000-0000-0000-0000-0000000000e7') returning id into pe; end if;
  insert into production_credits (production_id, person_id, tipo, papel) values ('mm', pe, 'creativo', 'Dirección Vocal'), ('mm', pe, 'reparto', 'Donna');
end $$;

create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create or replace function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
end $$;
create or replace function pg_temp.as_root() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;
create or replace function pg_temp.gaf(uid uuid) returns json language plpgsql as $$
declare j json; begin
  perform pg_temp.as_user(uid);
  j := badge_mio();
  perform pg_temp.as_root();
  return j;
end $$;

create temp table ctx (k text primary key, v text);
grant all on ctx to public;

-- T1: jerarquía del gafete, sin obra.
do $$ declare j json; begin
  j := pg_temp.gaf('00000000-0000-0000-0000-0000000000e1');
  if j->>'papel' <> 'CEO' or j->>'franja' <> 'staff' then raise exception 'FALLO T1: CEO (%)', j; end if;
  if (j::jsonb) ? 'obra' or (j::jsonb) ? 'temporada' then raise exception 'FALLO T1: todavía trae la obra'; end if;
  j := pg_temp.gaf('00000000-0000-0000-0000-0000000000e2');
  if j->>'papel' <> 'Dirección artística' or j->>'franja' <> 'equipo' then raise exception 'FALLO T1: director (%)', j; end if;
  j := pg_temp.gaf('00000000-0000-0000-0000-0000000000e3');
  if j->>'papel' <> 'Staff' or j->>'franja' <> 'equipo' then raise exception 'FALLO T1: staff de obra (%)', j; end if;
  j := pg_temp.gaf('00000000-0000-0000-0000-0000000000e4');
  if j->>'papel' <> 'Elenco' or j->>'franja' <> 'elenco' then raise exception 'FALLO T1: elenco (%)', j; end if;
  j := pg_temp.gaf('00000000-0000-0000-0000-0000000000e7');
  if j->>'papel' <> 'Dirección Vocal' or j->>'franja' <> 'equipo' then raise exception 'FALLO T1: crédito creativo gana a reparto (%)', j; end if;
  if pg_temp.gaf('00000000-0000-0000-0000-0000000000e5') is not null then raise exception 'FALLO T1: un fan tiene gafete'; end if;
  -- La página pública dice lo mismo.
  insert into ctx values ('gceo', (select token from badges where user_id = '00000000-0000-0000-0000-0000000000e1'));
  perform pg_temp.as_anon();
  if badge_publico((select v from ctx where k = 'gceo'))->>'papel' <> 'CEO' then raise exception 'FALLO T1: público'; end if;
  perform pg_temp.as_root();
end $$;

-- T2: credencial del Club Fan: token, código, verificación pública sin contacto, regenerar.
do $$ declare j json; t text; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e5');
  j := fan_join();
  if j->>'codigo' !~ '^FAN-[2-9A-HJ-NP-Z]{4}$' or char_length(j->>'token') < 24 then raise exception 'FALLO T2: credencial (%)', j; end if;
  if fan_me()->>'token' <> j->>'token' then raise exception 'FALLO T2: fan_me'; end if;
  t := j->>'token';
  insert into ctx values ('t5', t), ('c5', j->>'codigo');
  perform pg_temp.as_anon();
  j := fan_publico(t);
  if j->>'nombre' <> 'Fernanda L.' or (j->>'numero') is null then raise exception 'FALLO T2: público (%)', j; end if;
  if j::text like '%4420001111%' or j::text like '%t_fan@%' then raise exception 'FALLO T2: expuso contacto'; end if;
  if fan_publico('no-existe-este-token-000000000') is not null then raise exception 'FALLO T2: token falso'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e6');
  insert into ctx values ('t6', fan_join()->>'token');
  -- Regenerar invalida la anterior.
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e6');
  perform fan_regenerar();
  perform pg_temp.as_anon();
  if fan_publico((select v from ctx where k = 't6')) is not null then raise exception 'FALLO T2: la credencial vieja sigue sirviendo'; end if;
  perform pg_temp.as_root();
  update ctx set v = (select token from fan_members where user_id = '00000000-0000-0000-0000-0000000000e6') where k = 't6';
  if exists (select 1 from fan_members where token is null or codigo is null) then raise exception 'FALLO T2: socios sin credencial'; end if;
end $$;

-- T3: eventos y validación en la entrada.
do $$ declare pf uuid; foto uuid; ev uuid; abierto uuid; j json; begin
  insert into performances (production_id, starts_at, on_sale) values ('showman', now() + interval '10 days', true) returning id into pf;
  insert into fan_encuentros (production_id, performance_id, cupo) values ('showman', pf, 10) returning id into foto;
  insert into fan_encuentros (production_id, tipo, titulo, lugar, inicia, cupo, requiere_boleto) values ('showman', 'evento', 'Ensayo abierto', 'Teatro', now() + interval '5 days', 10, false) returning id into ev;
  insert into fan_encuentros (production_id, tipo, titulo, inicia, cupo, requiere_registro, requiere_boleto) values ('showman', 'evento', 'Meet & greet', now() + interval '6 days', 1, false, false) returning id into abierto;
  -- Un evento sin título no se puede crear.
  begin
    insert into fan_encuentros (production_id, tipo, inicia, cupo, requiere_boleto) values ('showman', 'evento', now() + interval '1 day', 5, false);
    raise exception 'FALLO T3: evento sin título';
  exception when check_violation then null; end;

  -- La socia aparta el evento con registro; la lista lo muestra.
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e5');
  perform fan_encuentro_apartar(ev, true);
  if (select count(*) from fan_encuentros_lista('showman') where tipo = 'evento') <> 2 then raise exception 'FALLO T3: lista de eventos'; end if;
  begin perform fan_encuentro_apartar(abierto, true); raise exception 'FALLO T3: apartó un evento sin registro';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;

  -- Un fan no valida credenciales.
  begin perform fan_checkin(ev, (select v from ctx where k = 't5')); raise exception 'FALLO T3: un fan validó';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;

  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
  j := fan_checkin(ev, 'https://darf.mx/f/' || (select v from ctx where k = 't5'));
  if j->>'resultado' <> 'ok' or (j->>'numero') is null then raise exception 'FALLO T3: ok (%)', j; end if;
  j := fan_checkin(ev, lower((select v from ctx where k = 'c5')));
  if j->>'resultado' <> 'ya' then raise exception 'FALLO T3: repetido (%)', j; end if;
  if fan_checkin(ev, (select v from ctx where k = 't6'))->>'resultado' <> 'sin_lugar' then raise exception 'FALLO T3: sin lugar'; end if;
  if fan_checkin(foto, (select v from ctx where k = 't5'))->>'resultado' <> 'sin_boleto' then raise exception 'FALLO T3: foto sin boleto'; end if;
  if fan_checkin(ev, 'FAN-ZZZZ')->>'resultado' <> 'no_encontrado' then raise exception 'FALLO T3: código falso'; end if;
  -- Evento sin registro: entra el primero, el segundo ya no cabe (cupo 1).
  if fan_checkin(abierto, (select v from ctx where k = 't5'))->>'resultado' <> 'ok' then raise exception 'FALLO T3: evento abierto'; end if;
  if fan_checkin(abierto, (select v from ctx where k = 't6'))->>'resultado' <> 'lleno' then raise exception 'FALLO T3: lleno'; end if;
  if (select count(*) from fan_encuentro_personas(ev) where llegada_at is not null) <> 1 then raise exception 'FALLO T3: lista con llegada'; end if;
  perform pg_temp.as_root();

  -- Ya marcada su llegada, no puede liberar su lugar.
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e5');
  perform fan_encuentro_apartar(ev, false);
  perform pg_temp.as_root();
  if not exists (select 1 from fan_encuentro_lugares where encuentro_id = ev and user_id = '00000000-0000-0000-0000-0000000000e5') then
    raise exception 'FALLO T3: se borró una llegada';
  end if;
end $$;

do $$ begin raise exception 'OK: TODAS LAS PRUEBAS PASARON (0080)'; end $$;
