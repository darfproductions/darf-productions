-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0084 aplicadas.

insert into auth.users (id, instance_id, aud, role, email)
values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_admin@test.local'),
       ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_puerta@test.local'),
       ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_cobros@test.local'),
       ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_organiza@test.local'),
       ('00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_fan@test.local'),
       ('00000000-0000-0000-0000-0000000000c6', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_nadie@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-0000000000c1';
insert into fan_members (user_id) values ('00000000-0000-0000-0000-0000000000c5');
create temp table cod as select codigo from fan_members where user_id = '00000000-0000-0000-0000-0000000000c5';
grant select on cod to public;

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

-- T1: evento de DARF (sin obra) con costo; el Director arma el equipo.
do $$ declare e uuid; e2 uuid; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  insert into fan_encuentros (tipo, titulo, inicia, lugar, acceso, requiere_registro, requiere_boleto, precio)
  values ('presencial', 'Showcase DARF', now() + interval '3 days', 'Foro', 'cuenta', true, false, 100) returning id into e;
  insert into fan_encuentros (tipo, titulo, inicia, lugar, acceso, requiere_registro, requiere_boleto)
  values ('presencial', 'Otro evento', now() + interval '3 days', 'Foro', 'cuenta', true, false) returning id into e2;
  insert into ctx values ('e', e), ('e2', e2);
  perform evento_equipo_poner(e, 't_puerta@test.local', 'puerta');
  perform evento_equipo_poner(e, 'T_COBROS@test.local ', 'cobros');
  perform evento_equipo_poner(e, 't_organiza@test.local', 'puerta');
  perform evento_equipo_poner(e, 't_organiza@test.local', 'organiza');
  begin perform evento_equipo_poner(e, 'no-existe@test.local', 'puerta'); raise exception 'FALLO T1: correo sin cuenta';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin perform evento_equipo_poner(e, 't_fan@test.local', 'jefe'); raise exception 'FALLO T1: papel inválido';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  if (select count(*) from evento_equipo_lista(e)) <> 3 then raise exception 'FALLO T1: lista del equipo'; end if;
  perform pg_temp.as_root();
  if (select papel from evento_equipo where encuentro_id = e and user_id = '00000000-0000-0000-0000-0000000000c4') <> 'organiza' then raise exception 'FALLO T1: cambiar papel'; end if;
  if not exists (select 1 from notifications where user_id = '00000000-0000-0000-0000-0000000000c2' and titulo = 'Te sumaron al equipo de un evento') then raise exception 'FALLO T1: aviso'; end if;
  -- Solo quien edita el evento arma el equipo (ni organiza).
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c4');
  begin perform evento_equipo_poner(e, 't_fan@test.local', 'puerta'); raise exception 'FALLO T1: organiza armó equipo';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
end $$;

-- T2: qué ve y qué puede cada papel.
do $$ declare e uuid := (select v::uuid from ctx where k = 'e'); e2 uuid := (select v::uuid from ctx where k = 'e2'); n int; o uuid; j json; begin
  -- Ven el evento en el panel (y solo ese).
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
  select count(*) into n from fan_encuentros where id in (e, e2);
  if n <> 1 then raise exception 'FALLO T2: puerta ve % eventos', n; end if;
  if (select count(*) from my_evento_access()) <> 1 then raise exception 'FALLO T2: my_evento_access'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c6');
  select count(*) into n from fan_encuentros where id in (e, e2);
  if n <> 0 then raise exception 'FALLO T2: alguien sin papel ve el evento'; end if;
  -- La socia aparta (queda pendiente) y alguien de la puerta no puede aprobar.
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c5');
  perform fan_encuentro_apartar(e, true);
  perform pg_temp.as_root();
  select id into o from evento_ordenes where encuentro_id = e;
  if not exists (select 1 from notifications where user_id = '00000000-0000-0000-0000-0000000000c3' and titulo = 'Pago de evento por revisar') then raise exception 'FALLO T2: aviso a cobros'; end if;
  if exists (select 1 from notifications where user_id = '00000000-0000-0000-0000-0000000000c2' and titulo = 'Pago de evento por revisar') then raise exception 'FALLO T2: aviso a la puerta'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
  begin perform evento_orden_revisar(o, true); raise exception 'FALLO T2: la puerta aprobó';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  if (select count(*) from evento_ordenes where id = o) <> 0 then raise exception 'FALLO T2: la puerta ve órdenes'; end if;
  j := fan_checkin(e, (select codigo from cod));
  if j->>'resultado' <> 'sin_pago' then raise exception 'FALLO T2: puerta valida sin pago %', j; end if;
  begin perform evento_abrir(e, false); raise exception 'FALLO T2: la puerta cerró el registro';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  -- Cobros aprueba, pero no valida en la entrada.
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
  if (select count(*) from fan_encuentro_personas(e)) <> 1 then raise exception 'FALLO T2: cobros no ve la lista'; end if;
  begin perform fan_checkin(e, 'FAN-ZZZZ'); raise exception 'FALLO T2: cobros validó';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  perform evento_orden_revisar(o, true);
  -- Ahora la puerta deja pasar y marca a mano.
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
  j := fan_checkin(e, (select codigo from cod));
  if j->>'resultado' <> 'ok' then raise exception 'FALLO T2: puerta con pago %', j; end if;
  perform evento_marcar(e, '00000000-0000-0000-0000-0000000000c5', false);
  -- Organiza: cierra el registro y valida; no ve el otro evento.
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c4');
  perform evento_abrir(e, false);
  j := fan_checkin(e, (select codigo from cod));
  if j->>'resultado' <> 'ok' then raise exception 'FALLO T2: organiza valida %', j; end if;
  begin perform evento_abrir(e2, false); raise exception 'FALLO T2: organiza tocó otro evento';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin delete from fan_encuentros where id = e; exception when others then null; end;
  perform pg_temp.as_root();
  if (select abierto from fan_encuentros where id = e) then raise exception 'FALLO T2: no se cerró'; end if;
  if not exists (select 1 from fan_encuentros where id = e) then raise exception 'FALLO T2: organiza borró el evento'; end if;
end $$;

-- T3: quitar del equipo le quita el acceso; en eventos de obra siguen los roles de la obra.
do $$ declare e uuid := (select v::uuid from ctx where k = 'e'); n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  perform evento_equipo_quitar(e, '00000000-0000-0000-0000-0000000000c2');
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
  if evento_puede(e, 'puerta') then raise exception 'FALLO T3: sigue en la puerta'; end if;
  perform pg_temp.as_root();
  insert into production_members (production_id, user_id, role_id) values ('showman', '00000000-0000-0000-0000-0000000000c6', 'puerta');
  insert into fan_encuentros (production_id, tipo, titulo, inicia, lugar, acceso, requiere_registro, requiere_boleto)
  values ('showman', 'presencial', 'Ensayo abierto', now() + interval '3 days', 'Foro', 'club', true, false) returning id into e;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c6');
  if not evento_puede(e, 'puerta') or evento_puede(e, 'cobros') or evento_puede(e, 'editar') then raise exception 'FALLO T3: rol Puerta de la obra'; end if;
  select count(*) into n from fan_encuentros where id = e;
  if n <> 1 then raise exception 'FALLO T3: la puerta de la obra no ve el evento'; end if;
end $$;

select 'OK 0084' as resultado;
