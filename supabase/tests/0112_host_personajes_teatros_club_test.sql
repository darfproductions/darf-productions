-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0112 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't112_admin@test.local'),
  ('00000000-0000-0000-0000-000000000c02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't112_host@test.local'),
  ('00000000-0000-0000-0000-000000000c03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't112_aspirante@test.local'),
  ('00000000-0000-0000-0000-000000000c04', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't112_socia@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-000000000c01';
update profiles set nombre = 'Sofi Socia', telefono = '5511112222', fecha_nacimiento = '2001-05-04' where id = '00000000-0000-0000-0000-000000000c04';
insert into fan_members (user_id) values ('00000000-0000-0000-0000-000000000c04');

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
create temp table t112 (k text primary key, v uuid);
grant all on t112 to public;

insert into productions (id, nombre, estado) values ('t112_obra', 'Obra 112', 'borrador'), ('t112_otra', 'Otra 112', 'borrador');

-- T1: el host entrevista: ve la lista del día y guarda preguntas y adicional; queda en la ficha de talento.
do $$ declare aid uuid; app uuid; j json; ok boolean; begin
  insert into auditions (production_id, titulo, estado) values ('t112_obra', 'Audición 112', 'abierta') returning id into aid;
  insert into t112 values ('aid', aid);
  insert into audition_members (audition_id, user_id, role_id) values (aid, '00000000-0000-0000-0000-000000000c02', 'host');
  insert into audition_applications (audition_id, user_id, nombre, fecha_nacimiento, telefono)
  values (aid, '00000000-0000-0000-0000-000000000c03', 'Ana Aspirante', '2000-01-01', '55') returning id into app;
  insert into t112 values ('app', app);
  if (select cardinality(preguntas_entrevista) from auditions where id = aid) <> 3 then raise exception 'FALLO T1: preguntas base'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000c02');
  if (select count(*) from audition_day_list(aid)) <> 1 then raise exception 'FALLO T1: lista del día'; end if;
  if (select count(*) from audition_entrevistas_lista(aid) where not hecha) <> 1 then raise exception 'FALLO T1: lista del host'; end if;
  j := audition_entrevista(app);
  if j->>'nombre' <> 'Ana Aspirante' then raise exception 'FALLO T1: entrevista %', j; end if;
  perform audition_entrevista_guardar(app,
    '[{"pregunta": "Experiencia", "respuesta": "Coro escolar 3 años"}, {"pregunta": "¿Por qué personaje audiciona?", "respuesta": "Donna"}, {"pregunta": "¿Por qué decidió audicionar?", "respuesta": "  "}]',
    'Toca piano');
  perform pg_temp.as_root();
  if (select jsonb_array_length(entrevista) from audition_applications where id = app) <> 2 then raise exception 'FALLO T1: vacías no se guardan'; end if;
  if (select entrevista_extra from audition_applications where id = app) <> 'Toca piano' then raise exception 'FALLO T1: adicional'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000c02');
  if (select count(*) from audition_entrevistas_lista(aid) where hecha) <> 1 then raise exception 'FALLO T1: hecha'; end if;
  perform pg_temp.as_root();
  -- Ficha de talento (la ve el admin).
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000c01');
  j := talent_history('00000000-0000-0000-0000-000000000c03');
  perform pg_temp.as_root();
  if (j::jsonb->'audiciones'->0->'entrevista'->0->>'respuesta') <> 'Coro escolar 3 años' then raise exception 'FALLO T1: ficha %', j; end if;
  -- Sin rol en la audición, no.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000c04');
  begin perform audition_entrevista_guardar(app, '[]', 'x'); ok := false; exception when others then ok := true; end;
  perform pg_temp.as_root();
  if not ok then raise exception 'FALLO T1: sin permiso'; end if;
end $$;

-- T2: personajes por crédito: "A / B" se separa y se junta en el crédito; renombrar actualiza.
do $$ declare c1 uuid; c2 uuid; p uuid; cr uuid; begin
  insert into production_characters (production_id, nombre, orden) values ('t112_obra', 'Phineas', 1) returning id into c1;
  insert into production_characters (production_id, nombre, orden) values ('t112_obra', 'Barnum', 2) returning id into c2;
  insert into people (nombre) values ('Leo Doble') returning id into p;
  insert into production_credits (production_id, person_id, tipo, papel) values ('t112_obra', p, 'reparto', 'x') returning id into cr;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000c01');
  perform credito_personajes(cr, array[c2, c1]);
  perform pg_temp.as_root();
  if (select papel from production_credits where id = cr) <> 'Phineas / Barnum' then raise exception 'FALLO T2: %', (select papel from production_credits where id = cr); end if;
  update production_characters set nombre = 'P.T. Barnum' where id = c2;
  if (select papel from production_credits where id = cr) <> 'Phineas / P.T. Barnum' then raise exception 'FALLO T2: renombrar'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000c01');
  perform credito_personajes(cr, array[c1]);
  perform pg_temp.as_root();
  if (select papel from production_credits where id = cr) <> 'Phineas' then raise exception 'FALLO T2: quitar'; end if;
end $$;

-- T3: teatros: guardar el mapa de una obra y usarlo en otra (con sus zonas).
do $$ declare z uuid; tid uuid; r jsonb; begin
  insert into price_categories (production_id, nombre, color) values ('t112_obra', 'VIP', '#ff0000') returning id into z;
  insert into seats (production_id, section, seat_row, seat_number, seat_label, lado, price_category_id) values
    ('t112_obra', null, 'A', 1, 'A1', 'central', z), ('t112_obra', null, 'A', 2, 'A2', 'central', z), ('t112_obra', null, 'B', 1, 'B1', 'central', z);
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000c01');
  tid := teatro_guardar('t112_obra', 'Teatro 112');
  if (select total from teatros_lista() where id = tid) <> 3 then raise exception 'FALLO T3: guardar'; end if;
  -- Mismo nombre: se actualiza, no se duplica.
  if teatro_guardar('t112_obra', 'teatro 112') <> tid then raise exception 'FALLO T3: duplicado'; end if;
  r := teatro_usar(tid, 't112_otra');
  perform pg_temp.as_root();
  if (r->>'asientos')::int <> 3 then raise exception 'FALLO T3: usar %', r; end if;
  if (select count(*) from seats s join price_categories pc on pc.id = s.price_category_id where s.production_id = 't112_otra' and pc.nombre = 'VIP') <> 3 then
    raise exception 'FALLO T3: zonas';
  end if;
end $$;

-- T4: base del Club Fan: solo con casa.club (el admin sí; un socio no).
do $$ declare n int; ok boolean; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000c01');
  select count(*) into n from club_socios() where nombre = 'Sofi Socia' and telefono = '5511112222' and fecha_nacimiento = '2001-05-04';
  perform pg_temp.as_root();
  if n <> 1 then raise exception 'FALLO T4: lista'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000c04');
  begin perform club_socios(); ok := false; exception when others then ok := true; end;
  perform pg_temp.as_root();
  if not ok then raise exception 'FALLO T4: sin permiso'; end if;
end $$;
