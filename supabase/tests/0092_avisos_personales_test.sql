-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0092 aplicadas.

insert into auth.users (id, instance_id, aud, role, email)
values ('00000000-0000-0000-0000-0000000009c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't92_integrante@test.local'),
       ('00000000-0000-0000-0000-0000000009c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't92_fan@test.local');
insert into production_members (production_id, user_id, role_id) values ('showman', '00000000-0000-0000-0000-0000000009c1', 'integrante');

create or replace function pg_temp.n(uid uuid, t text) returns int language sql as $$
  select count(*)::int from notifications where user_id = uid and titulo = t
$$;

-- T1: comunicado a todos: le llega al integrante, no a un fan.
do $$ begin
  insert into announcements (production_id, titulo, cuerpo, audiencia) values ('showman', 'Ensayo general', 'Lleguen temprano', 'todos');
  if pg_temp.n('00000000-0000-0000-0000-0000000009c1', 'Nuevo comunicado') <> 1 then raise exception 'FALLO T1: integrante'; end if;
  if pg_temp.n('00000000-0000-0000-0000-0000000009c2', 'Nuevo comunicado') <> 0 then raise exception 'FALLO T1: fan'; end if;
end $$;

-- T2: ensayos: nuevo, serie con un solo aviso, cancelar varios con un solo aviso, cambio de fecha.
do $$ declare s uuid := gen_random_uuid(); r1 uuid; begin
  insert into rehearsals (production_id, titulo, inicia, termina) values ('showman', 'Ensayo 92', now() + interval '3 days', now() + interval '3 days 2 hours') returning id into r1;
  if pg_temp.n('00000000-0000-0000-0000-0000000009c1', 'Nuevo ensayo') <> 1 then raise exception 'FALLO T2: nuevo'; end if;
  insert into rehearsals (production_id, titulo, inicia, termina, serie_id)
    select 'showman', 'Serie 92', now() + make_interval(days => 7 * g), now() + make_interval(days => 7 * g, hours => 2), s from generate_series(1, 3) g;
  if pg_temp.n('00000000-0000-0000-0000-0000000009c1', 'Nuevos ensayos en tu calendario') <> 1 then raise exception 'FALLO T2: serie'; end if;
  update rehearsals set estado = 'cancelado' where serie_id = s;
  if pg_temp.n('00000000-0000-0000-0000-0000000009c1', 'Se canceló un ensayo') <> 1 then raise exception 'FALLO T2: cancelar serie %', pg_temp.n('00000000-0000-0000-0000-0000000009c1', 'Se canceló un ensayo'); end if;
  update rehearsals set inicia = inicia + interval '1 hour', termina = termina + interval '1 hour' where id = r1;
  if pg_temp.n('00000000-0000-0000-0000-0000000009c1', 'Cambió un ensayo') <> 1 then raise exception 'FALLO T2: cambio'; end if;
  if pg_temp.n('00000000-0000-0000-0000-0000000009c2', 'Nuevo ensayo') <> 0 then raise exception 'FALLO T2: fan'; end if;
end $$;

-- T3: audición sin votación avisa el resultado; con votación, no (lo hace la votación).
do $$ declare a1 uuid; a2 uuid; p1 uuid; p2 uuid; begin
  insert into auditions (production_id, titulo, estado) values ('showman', 'Audición 92', 'abierta') returning id into a1;
  insert into auditions (production_id, titulo, estado, fase) values ('showman', 'Votación 92', 'abierta', 'votacion') returning id into a2;
  insert into audition_applications (audition_id, user_id, nombre, fecha_nacimiento, telefono) values (a1, '00000000-0000-0000-0000-0000000009c2', 'Fan 92', '2000-01-01', '55') returning id into p1;
  insert into audition_applications (audition_id, user_id, nombre, fecha_nacimiento, telefono) values (a2, '00000000-0000-0000-0000-0000000009c2', 'Fan 92', '2000-01-01', '55') returning id into p2;
  update audition_applications set estado = 'convocado' where id = p1;
  if pg_temp.n('00000000-0000-0000-0000-0000000009c2', 'Te convocamos a audicionar') <> 1 then raise exception 'FALLO T3: convocado'; end if;
  update audition_applications set estado = 'seleccionado' where id = p1;
  if pg_temp.n('00000000-0000-0000-0000-0000000009c2', '¡Quedaste seleccionado!') <> 1 then raise exception 'FALLO T3: seleccionado'; end if;
  update audition_applications set estado = 'no_seleccionado' where id = p2;
  if pg_temp.n('00000000-0000-0000-0000-0000000009c2', 'Gracias por audicionar') <> 0 then raise exception 'FALLO T3: votación duplicó'; end if;
end $$;

select 'OK 0092';
