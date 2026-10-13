-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0083 aplicadas.

insert into auth.users (id, instance_id, aud, role, email)
values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_admin@test.local'),
       ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_fan@test.local'),
       ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_cuenta@test.local'),
       ('00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_elenco@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-0000000000d1';
update profiles set nombre = 'Fernanda López' where id = '00000000-0000-0000-0000-0000000000d2';

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

create temp table ctx (k text primary key, v text);
grant all on ctx to public;

-- T1: credencial de cuenta → socio → equipo, siempre el mismo QR y número.
do $$ declare c json; t text; cod text; n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
  c := credencial_mia();
  if c->>'nivel' <> 'cuenta' or c->'socio' is not null and json_typeof(c->'socio') <> 'null' then raise exception 'FALLO T1: nivel cuenta %', c; end if;
  t := c->>'token'; cod := c->>'codigo';
  if cod !~ '^DRF-' then raise exception 'FALLO T1: código %', cod; end if;
  if (credencial_mia())->>'token' <> t then raise exception 'FALLO T1: credencial_mia creó otra'; end if;
  perform pg_temp.as_root();
  insert into fan_members (user_id) values ('00000000-0000-0000-0000-0000000000d2');
  select count(*) into n from fan_members where user_id = '00000000-0000-0000-0000-0000000000d2' and token = t and codigo = cod;
  if n <> 1 then raise exception 'FALLO T1: el socio no reutilizó el QR'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
  c := credencial_mia();
  if c->>'nivel' <> 'club' or (c->'socio'->>'numero') is null then raise exception 'FALLO T1: nivel club %', c; end if;
  insert into ctx values ('numero', c->'socio'->>'numero'), ('token', t), ('codigo', cod);
  -- Entra al elenco: sube a equipo y conserva todo.
  perform pg_temp.as_root();
  insert into production_members (production_id, user_id, role_id) values ('showman', '00000000-0000-0000-0000-0000000000d2', 'integrante');
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
  c := credencial_mia();
  if c->>'nivel' <> 'equipo' or c->>'token' <> t or c->'socio'->>'numero' <> (select v from ctx where k = 'numero') or c->>'papel' is null then
    raise exception 'FALLO T1: nivel equipo %', c;
  end if;
  perform pg_temp.as_root();
  select count(*) into n from badges where user_id = '00000000-0000-0000-0000-0000000000d2';
  if n <> 1 then raise exception 'FALLO T1: % credenciales', n; end if;
  c := badge_publico(t);
  if c->>'nivel' <> 'equipo' or c->'socio'->>'numero' is null then raise exception 'FALLO T1: público equipo %', c; end if;
end $$;

-- T2: un socio que ya era socio (FAN-XXXX viejo) sigue entrando con su código; el equipo cuenta como socio.
do $$ declare u uuid; b boolean; c json; begin
  perform pg_temp.as_root();
  insert into fan_members (user_id, token, codigo) values ('00000000-0000-0000-0000-0000000000d3', repeat('ab', 16), 'FAN-2345');
  if credencial_resolver('FAN-2345') <> '00000000-0000-0000-0000-0000000000d3' then raise exception 'FALLO T2: FAN-'; end if;
  if credencial_resolver('https://darf.mx/f/' || repeat('ab', 16) || '?x=1') <> '00000000-0000-0000-0000-0000000000d3' then raise exception 'FALLO T2: liga /f/'; end if;
  if credencial_resolver('https://darf.mx/g/' || (select v from ctx where k = 'token')) <> '00000000-0000-0000-0000-0000000000d2' then raise exception 'FALLO T2: liga /g/'; end if;
  if credencial_resolver(lower((select v from ctx where k = 'codigo'))) <> '00000000-0000-0000-0000-0000000000d2' then raise exception 'FALLO T2: código en minúsculas'; end if;
  if credencial_resolver('DRF-ZZZZ') is not null or credencial_resolver('hola') is not null then raise exception 'FALLO T2: código falso'; end if;
  c := badge_publico(repeat('ab', 16));
  if c->>'nivel' <> 'club' or c::jsonb ? 'telefono' then raise exception 'FALLO T2: público club %', c; end if;
  if (fan_publico((select v from ctx where k = 'token'))->>'numero') is null then raise exception 'FALLO T2: /f/ con QR personal'; end if;
  -- Elenco sin unirse al club: cuenta como socio.
  insert into production_members (production_id, user_id, role_id) values ('showman', '00000000-0000-0000-0000-0000000000d4', 'integrante');
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d4');
  if not is_fan_member() then raise exception 'FALLO T2: el elenco no cuenta como socio'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d3');
  perform badge_regenerar();
  perform pg_temp.as_root();
  if credencial_resolver('FAN-2345') is not null then raise exception 'FALLO T2: el código viejo sigue tras regenerar'; end if;
  if (select token from badges where user_id = '00000000-0000-0000-0000-0000000000d3') <> (select token from fan_members where user_id = '00000000-0000-0000-0000-0000000000d3') then
    raise exception 'FALLO T2: regenerar desincronizó';
  end if;
end $$;

-- T3: evento con costo y precio de socio; cupo de los primeros N.
do $$ declare e uuid; o evento_ordenes; r record; begin
  perform pg_temp.as_root();
  insert into auth.users (id, instance_id, aud, role, email)
  values ('00000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_otro@test.local');
  begin
    insert into fan_encuentros (tipo, titulo, inicia, lugar, acceso, requiere_registro, requiere_boleto, precio) values ('presencial', 'X', now() + interval '3 days', 'Foro', 'cuenta', false, false, 100);
    raise exception 'FALLO T3: costo sin registro';
  exception when check_violation then null; end;
  begin
    insert into fan_encuentros (tipo, titulo, inicia, lugar, acceso, requiere_registro, requiere_boleto, precio, precio_socio) values ('presencial', 'X', now() + interval '3 days', 'Foro', 'cuenta', true, false, 100, 150);
    raise exception 'FALLO T3: precio socio mayor';
  exception when check_violation then null; end;
  insert into fan_encuentros (tipo, titulo, inicia, lugar, acceso, requiere_registro, requiere_boleto, precio, precio_socio, cupo)
  values ('presencial', 'Meet & greet', now() + interval '3 days', 'Foro', 'cuenta', true, false, 200, 150, 2) returning id into e;
  insert into ctx values ('ev', e);
  -- Sin socio: precio completo y orden pendiente con vencimiento.
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d5');
  select * into r from fan_encuentros_lista(null) where id = e;
  if r.mi_precio <> 200 then raise exception 'FALLO T3: mi precio %', r.mi_precio; end if;
  perform fan_encuentro_apartar(e, true);
  perform pg_temp.as_root();
  select * into o from evento_ordenes where encuentro_id = e and user_id = '00000000-0000-0000-0000-0000000000d5';
  if o.status <> 'pendiente' or o.monto <> 200 or o.codigo !~ '^EV-[0-9A-F]{6}$' or o.expires_at <= now() + interval '23 hours' then raise exception 'FALLO T3: orden %', row_to_json(o); end if;
  if not exists (select 1 from notifications where user_id = '00000000-0000-0000-0000-0000000000d1' and titulo = 'Pago de evento por revisar') then raise exception 'FALLO T3: aviso al equipo'; end if;
  -- Socio (y equipo): precio de socio.
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
  perform fan_encuentro_apartar(e, true);
  perform pg_temp.as_root();
  if (select monto from evento_ordenes where encuentro_id = e and user_id = '00000000-0000-0000-0000-0000000000d2') <> 150 then raise exception 'FALLO T3: precio socio'; end if;
  -- Cupo lleno (2): el tercero no entra.
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d4');
  begin perform fan_encuentro_apartar(e, true); raise exception 'FALLO T3: pasó el cupo';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  -- Quien no tiene permiso no aprueba.
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d4');
  begin perform evento_orden_revisar(o.id, true); raise exception 'FALLO T3: aprobó sin permiso';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  -- La lista dice que está pendiente y no pagado.
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d5');
  select * into r from fan_encuentros_lista(null) where id = e;
  if r.orden_status <> 'pendiente' or r.pagado or r.orden_codigo <> o.codigo then raise exception 'FALLO T3: lista con orden'; end if;
end $$;

-- T4: aprobar, vencer, rechazar; liberar el lugar y validar en la entrada.
do $$ declare e uuid := (select v::uuid from ctx where k = 'ev'); o1 uuid; o2 uuid; j json; n int; begin
  perform pg_temp.as_root();
  select id into o1 from evento_ordenes where encuentro_id = e and user_id = '00000000-0000-0000-0000-0000000000d5';
  select id into o2 from evento_ordenes where encuentro_id = e and user_id = '00000000-0000-0000-0000-0000000000d2';
  -- En la entrada, sin pago: no pasa.
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  j := fan_checkin(e, (select v from ctx where k = 'codigo'));
  if j->>'resultado' <> 'sin_pago' then raise exception 'FALLO T4: sin pago %', j; end if;
  perform evento_orden_revisar(o2, true);
  begin perform evento_orden_revisar(o2, false); raise exception 'FALLO T4: revisó dos veces';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  j := fan_checkin(e, 'https://darf.mx/g/' || (select v from ctx where k = 'token'));
  if j->>'resultado' <> 'ok' or j->>'nivel' <> 'equipo' then raise exception 'FALLO T4: entrada pagada %', j; end if;
  perform pg_temp.as_root();
  if not exists (select 1 from notifications where user_id = '00000000-0000-0000-0000-0000000000d2' and titulo = '¡Tu lugar está confirmado!') then raise exception 'FALLO T4: aviso de aprobado'; end if;
  -- Ya pagado: no lo cancela solo.
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
  begin perform fan_encuentro_apartar(e, false); raise exception 'FALLO T4: canceló pagado';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  -- Vence el apartado sin pago: se libera el lugar y se avisa.
  perform pg_temp.as_root();
  update evento_ordenes set expires_at = now() - interval '1 minute' where id = o1;
  if expire_evento_ordenes() <> 1 then raise exception 'FALLO T4: no venció'; end if;
  if exists (select 1 from fan_encuentro_lugares where encuentro_id = e and user_id = '00000000-0000-0000-0000-0000000000d5') then raise exception 'FALLO T4: no liberó'; end if;
  if not exists (select 1 from notifications where user_id = '00000000-0000-0000-0000-0000000000d5' and titulo = 'Tu apartado venció') then raise exception 'FALLO T4: aviso de vencido'; end if;
  -- Hay lugar otra vez: aparta de nuevo y el equipo lo rechaza.
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d5');
  perform fan_encuentro_apartar(e, true);
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  select count(*) into n from fan_encuentro_personas(e) where orden_status = 'pendiente';
  if n <> 1 then raise exception 'FALLO T4: personas pendientes %', n; end if;
  perform evento_orden_revisar((select orden_id from fan_encuentro_personas(e) where user_id = '00000000-0000-0000-0000-0000000000d5'), false);
  perform pg_temp.as_root();
  if exists (select 1 from fan_encuentro_lugares where encuentro_id = e and user_id = '00000000-0000-0000-0000-0000000000d5') then raise exception 'FALLO T4: rechazo no liberó'; end if;
  -- Cancelar uno mismo un apartado pendiente: rechaza la orden y libera.
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d5');
  perform fan_encuentro_apartar(e, true);
  perform fan_encuentro_apartar(e, false);
  perform pg_temp.as_root();
  if exists (select 1 from evento_ordenes where encuentro_id = e and user_id = '00000000-0000-0000-0000-0000000000d5' and status = 'pendiente') then raise exception 'FALLO T4: cancelar dejó orden'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d5');
  select count(*) into n from mis_eventos() where id = e;
  if n <> 1 then raise exception 'FALLO T4: mis eventos %', n; end if;
end $$;

-- T5: club sin ser socio en la entrada; precio de socio 0 = aprobado al instante; liga en línea pide pago.
do $$ declare e uuid; j json; r record; begin
  perform pg_temp.as_root();
  insert into fan_encuentros (tipo, titulo, inicia, lugar, acceso, requiere_registro, requiere_boleto) values ('presencial', 'Solo club', now() + interval '3 days', 'Foro', 'club', false, false) returning id into e;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  j := fan_checkin(e, (select codigo from badges where user_id = '00000000-0000-0000-0000-0000000000d5'));
  if j is null or j->>'resultado' not in ('no_encontrado', 'no_socio') then raise exception 'FALLO T5: no socio %', j; end if;
  perform pg_temp.as_root();
  insert into badges (user_id, token, codigo) values ('00000000-0000-0000-0000-0000000000d5', badge_nuevo_token(), badge_nuevo_codigo()) on conflict do nothing;
  delete from ctx where k = 'cod5';
  insert into ctx values ('cod5', (select codigo from badges where user_id = '00000000-0000-0000-0000-0000000000d5'));
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  j := fan_checkin(e, (select v from ctx where k = 'cod5'));
  if j->>'resultado' <> 'no_socio' then raise exception 'FALLO T5: no socio con credencial %', j; end if;
  perform pg_temp.as_root();
  insert into fan_encuentros (tipo, titulo, inicia, termina, liga, acceso, requiere_registro, requiere_boleto, precio, precio_socio)
  values ('en_linea', 'Transmisión', now() + interval '10 minutes', now() + interval '2 hours', 'https://youtube.com/live/z', 'cuenta', true, false, 80, 0) returning id into e;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
  perform fan_encuentro_apartar(e, true);
  select * into r from fan_encuentros_lista(null) where id = e;
  if not r.pagado or r.liga is null or r.mi_precio is not null then raise exception 'FALLO T5: socio gratis %', row_to_json(r); end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d5');
  -- Se aparta antes de que falten 3 h: vence a los 30 min.
  perform fan_encuentro_apartar(e, true);
  select * into r from fan_encuentros_lista(null) where id = e;
  if r.pagado or r.liga is not null or r.mi_precio <> 80 then raise exception 'FALLO T5: liga sin pago %', row_to_json(r); end if;
  if evento_entrar(e) is not null then raise exception 'FALLO T5: entró sin pago'; end if;
  if (select precio from eventos_cartelera(50) where id = e) <> 80 then raise exception 'FALLO T5: cartelera sin precio'; end if;
end $$;

select 'OK 0083' as resultado;
