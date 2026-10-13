-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0081 aplicadas.

insert into auth.users (id, instance_id, aud, role, email)
values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_admin@test.local'),
       ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_contenido@test.local'),
       ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_socio@test.local'),
       ('00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_cuenta@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-0000000000f1';
insert into production_members (production_id, user_id, role_id) values ('showman', '00000000-0000-0000-0000-0000000000f2', 'contenido');
insert into fan_members (user_id) values ('00000000-0000-0000-0000-0000000000f3');

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

create temp table ctx (k text primary key, v uuid);
grant all on ctx to public;

-- T1: tipos, reglas y quién crea.
do $$ declare pf uuid; a uuid; b uuid; begin
  insert into performances (production_id, starts_at, on_sale) values ('showman', now() + interval '10 days', true) returning id into pf;
  insert into ctx values ('pf', pf);
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
  -- Dos eventos en la misma función (foto y tour).
  insert into fan_encuentros (production_id, tipo, performance_id, categoria, cupo) values ('showman', 'funcion', pf, 'Foto con el elenco', 20) returning id into a;
  insert into fan_encuentros (production_id, tipo, performance_id, categoria, cupo, acceso) values ('showman', 'funcion', pf, 'Tour por backstage', 10, 'cuenta') returning id into b;
  insert into ctx values ('foto', a), ('tour', b);
  begin
    insert into fan_encuentros (production_id, tipo, titulo, inicia, liga) values ('showman', 'en_linea', 'Sin https', now() + interval '1 day', 'http://x.com');
    raise exception 'FALLO T1: liga sin https';
  exception when check_violation then null; end;
  begin
    insert into fan_encuentros (production_id, tipo, categoria) values ('showman', 'funcion', 'Sin función');
    raise exception 'FALLO T1: por función sin función';
  exception when check_violation then null; end;
  -- Un evento de DARF (sin obra) solo lo crea el Director.
  begin
    insert into fan_encuentros (tipo, titulo, inicia, lugar, acceso) values ('presencial', 'Meet & greet', now() + interval '3 days', 'Foro', 'publico');
    raise exception 'FALLO T1: no-Director creó evento de DARF';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
  insert into fan_encuentros (tipo, titulo, inicia, lugar, acceso, requiere_registro, requiere_boleto) values ('presencial', 'Meet & greet', now() + interval '3 days', 'Foro', 'publico', false, false) returning id into a;
  insert into fan_encuentros (tipo, titulo, inicia, termina, liga, acceso, requiere_registro, requiere_boleto, categoria) values ('en_linea', 'Lanzamiento del tráiler', now() - interval '5 minutes', now() + interval '1 hour', 'https://youtube.com/live/x', 'club', false, false, 'Lanzamiento') returning id into b;
  insert into ctx values ('meet', a), ('live', b);
  insert into fan_encuentros (tipo, titulo, inicia, liga, acceso, requiere_registro, requiere_boleto) values ('en_linea', 'Transmisión con registro', now() + interval '30 minutes', 'https://youtube.com/live/y', 'cuenta', true, false) returning id into a;
  insert into ctx values ('reg', a);
  perform pg_temp.as_root();
  -- Al publicarse se avisó a los socios.
  if not exists (select 1 from notifications where user_id = '00000000-0000-0000-0000-0000000000f3' and titulo = 'Nuevo evento: Meet & greet') then
    raise exception 'FALLO T1: aviso de evento nuevo';
  end if;
end $$;

-- T2: quién ve qué (club, con cuenta, público).
do $$ declare n int; begin
  perform pg_temp.as_anon();
  select count(*) into n from fan_encuentros_lista(null) where id in (select v from ctx);
  if n <> 1 then raise exception 'FALLO T2: anónimo ve % (solo el público)', n; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000f4');
  select count(*) into n from fan_encuentros_lista(null) where id in (select v from ctx);
  if n <> 3 then raise exception 'FALLO T2: con cuenta ve % (público + con cuenta)', n; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000f3');
  select count(*) into n from fan_encuentros_lista(null) where id in (select v from ctx);
  if n <> 5 then raise exception 'FALLO T2: socio ve %', n; end if;
  -- Sin ser socio no aparta un evento del club.
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000f4');
  begin perform fan_encuentro_apartar((select v from ctx where k = 'foto'), true); raise exception 'FALLO T2: apartó sin ser socio';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  perform pg_temp.as_root();
end $$;

-- T3: en línea: la liga solo en su horario y, con registro, solo a quien apartó.
do $$ declare l text; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000f3');
  if (select liga from fan_encuentros_lista(null) where id = (select v from ctx where k = 'live')) is null then raise exception 'FALLO T3: no ve la liga en vivo'; end if;
  l := evento_entrar((select v from ctx where k = 'live'));
  if l <> 'https://youtube.com/live/x' then raise exception 'FALLO T3: entrar'; end if;
  perform pg_temp.as_root();
  if not exists (select 1 from fan_encuentro_lugares where encuentro_id = (select v from ctx where k = 'live') and llegada_at is not null) then raise exception 'FALLO T3: asistencia en línea'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000f4');
  if evento_entrar((select v from ctx where k = 'live')) is not null then raise exception 'FALLO T3: no socio entró a evento del club'; end if;
  -- Con registro: empieza en 30 min (ya dentro de los 15? no) → sin liga; aparta y aún sin liga hasta 15 min antes.
  perform fan_encuentro_apartar((select v from ctx where k = 'reg'), true);
  if evento_entrar((select v from ctx where k = 'reg')) is not null then raise exception 'FALLO T3: liga antes de tiempo'; end if;
  perform evento_recordar((select v from ctx where k = 'meet'), true);
  perform pg_temp.as_root();
end $$;

-- T4: recordatorio una hora antes, una sola vez.
do $$ declare n int; begin
  delete from notifications where tipo = 'fanzone';
  n := notify_eventos_proximos();
  if n <> 1 then raise exception 'FALLO T4: recordó % eventos (solo el de en 30 min)', n; end if;
  if not exists (select 1 from notifications where user_id = '00000000-0000-0000-0000-0000000000f4' and titulo = 'En una hora: Transmisión con registro') then raise exception 'FALLO T4: recordatorio'; end if;
  if notify_eventos_proximos() <> 0 then raise exception 'FALLO T4: recordó dos veces'; end if;
  update fan_encuentros set inicia = now() + interval '40 minutes' where id = (select v from ctx where k = 'meet');
  if notify_eventos_proximos() <> 1 then raise exception 'FALLO T4: meet & greet'; end if;
  if not exists (select 1 from notifications where user_id = '00000000-0000-0000-0000-0000000000f4' and titulo = 'En una hora: Meet & greet') then raise exception 'FALLO T4: recordatorio pedido'; end if;
end $$;

-- T5: entrada: validar credencial, en línea no se valida, llegada a mano.
do $$ declare cod text; begin
  select codigo into cod from fan_members where user_id = '00000000-0000-0000-0000-0000000000f3';
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
  if fan_checkin((select v from ctx where k = 'meet'), cod)->>'resultado' <> 'ok' then raise exception 'FALLO T5: meet & greet sin registro'; end if;
  if fan_checkin((select v from ctx where k = 'tour'), cod)->>'resultado' <> 'sin_boleto' then raise exception 'FALLO T5: tour sin boleto'; end if;
  begin perform fan_checkin((select v from ctx where k = 'live'), cod); raise exception 'FALLO T5: validó en línea';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  -- Llegada a mano de quien no trae credencial (apartó la transmisión con registro).
  perform evento_marcar((select v from ctx where k = 'reg'), '00000000-0000-0000-0000-0000000000f4', true);
  if (select llegada_at from fan_encuentro_personas((select v from ctx where k = 'reg')) where user_id = '00000000-0000-0000-0000-0000000000f4') is null then raise exception 'FALLO T5: marcar a mano'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000f4');
  begin perform evento_marcar((select v from ctx where k = 'reg'), '00000000-0000-0000-0000-0000000000f4', true); raise exception 'FALLO T5: se marcó solo';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  perform pg_temp.as_root();
end $$;

do $$ begin raise exception 'OK: TODAS LAS PRUEBAS PASARON (0081)'; end $$;
