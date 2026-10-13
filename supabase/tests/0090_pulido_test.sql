-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0090 aplicadas.

insert into auth.users (id, instance_id, aud, role, email)
values ('00000000-0000-0000-0000-0000000009a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't90_integrante@test.local'),
       ('00000000-0000-0000-0000-0000000009a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't90_admin@test.local'),
       ('00000000-0000-0000-0000-0000000009a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't90_staff@test.local'),
       ('00000000-0000-0000-0000-0000000009a4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't90_fan@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-0000000009a2';
update profiles set rol = 'staff' where id = '00000000-0000-0000-0000-0000000009a3';

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

-- T1: las advertencias por mensualidades corren solas (sin sesión), una vez.
do $$ declare n int; begin
  insert into production_fees (production_id, monto, desde, hasta, dia_limite, cobrar)
  values ('showman', 500, (date_trunc('month', hoy_mx()) - interval '6 months')::date, (date_trunc('month', hoy_mx()) + interval '6 months')::date, 10, true)
  on conflict (production_id) do update set monto = 500, desde = excluded.desde, hasta = excluded.hasta, cobrar = true, dia_limite = 10;
  insert into production_members (production_id, user_id, role_id) values ('showman', '00000000-0000-0000-0000-0000000009a1', 'integrante');
  insert into member_enrollment (production_id, user_id, ingreso) values ('showman', '00000000-0000-0000-0000-0000000009a1', (date_trunc('month', hoy_mx()) - interval '6 months')::date)
  on conflict (production_id, user_id) do update set ingreso = excluded.ingreso;
  n := discipline_scan_all();
  if (select count(*) from member_incidents where user_id = '00000000-0000-0000-0000-0000000009a1' and origen = 'auto') = 0 then
    raise exception 'FALLO T1: no creó advertencias (%)', n; end if;
  n := (select count(*) from member_incidents where user_id = '00000000-0000-0000-0000-0000000009a1');
  perform discipline_scan_all();
  if (select count(*) from member_incidents where user_id = '00000000-0000-0000-0000-0000000009a1') <> n then raise exception 'FALLO T1: repitió advertencias'; end if;
  -- Nadie de fuera la puede llamar.
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000009a4');
  begin perform discipline_scan_all(); raise exception 'FALLO T1: un fan corrió el escaneo';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin perform discipline_scan_fees('showman'); raise exception 'FALLO T1: un fan escaneó una obra';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  perform pg_temp.as_root();
end $$;

-- T2: la bitácora no guarda valores de medidas; sí qué cambió.
do $$ declare mid uuid; a jsonb; begin
  insert into member_measures (production_id, user_id, medida, descripcion) values ('showman', '00000000-0000-0000-0000-0000000009a1', 'platica', '70 cm') returning id into mid;
  update member_measures set descripcion = '72 cm' where id = mid;
  select despues into a from audit_log where tabla = 'member_measures' and registro_id = mid::text and accion = 'update';
  if a is null or a::text like '%72 cm%' then raise exception 'FALLO T2: guardó valores (%)', a; end if;
  if not (a->'campos' ? 'descripcion') or (a->>'privado')::boolean is not true then raise exception 'FALLO T2: sin resumen (%)', a; end if;
  -- Tablas normales siguen igual.
  update productions set estado = estado where id = 'showman';
  if (select despues ? 'estado' from audit_log where tabla = 'productions' order by id desc limit 1) is not true then raise exception 'FALLO T2: productions sin detalle'; end if;
end $$;

-- T3: limpieza: bitácora vieja, notificaciones leídas viejas; lo reciente se queda.
do $$ declare r json; begin
  insert into audit_log (tabla, accion, at) values ('t90', 'insert', now() - interval '25 months'), ('t90', 'insert', now() - interval '23 months');
  insert into notifications (user_id, tipo, titulo, created_at, read_at) values
    ('00000000-0000-0000-0000-0000000009a4', 'prueba', 'vieja leída', now() - interval '100 days', now() - interval '95 days'),
    ('00000000-0000-0000-0000-0000000009a4', 'prueba', 'vieja sin leer', now() - interval '100 days', null),
    ('00000000-0000-0000-0000-0000000009a4', 'prueba', 'reciente leída', now() - interval '10 days', now() - interval '5 days');
  r := darf_limpieza();
  if (select count(*) from audit_log where tabla = 't90') <> 1 then raise exception 'FALLO T3: bitácora (%)', r; end if;
  if (select string_agg(titulo, ',' order by titulo) from notifications where user_id = '00000000-0000-0000-0000-0000000009a4' and tipo = 'prueba')
     <> 'reciente leída,vieja sin leer' then raise exception 'FALLO T3: notificaciones'; end if;
end $$;

-- T4: Contacto: mismo mensaje no se repite; el aviso va solo al Director y no se amontona.
do $$ begin
  insert into contact_messages (nombre, correo, mensaje) values ('Ana', 'ana90@test.local', 'Hola, ¿hay funciones en diciembre?');
  begin insert into contact_messages (nombre, correo, mensaje) values ('Ana', 'ANA90@test.local', 'Hola, ¿hay funciones en diciembre?  ');
    raise exception 'FALLO T4: aceptó el mensaje repetido';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  insert into contact_messages (nombre, correo, mensaje) values ('Beto', 'beto90@test.local', 'Otra pregunta');
  if (select count(*) from notifications where user_id = '00000000-0000-0000-0000-0000000009a2' and tipo = 'contacto' and created_at > now() - interval '1 minute') <> 1 then
    raise exception 'FALLO T4: el Director debe tener un solo aviso'; end if;
  if exists (select 1 from notifications where user_id = '00000000-0000-0000-0000-0000000009a3' and tipo = 'contacto' and created_at > now() - interval '1 minute') then
    raise exception 'FALLO T4: avisó a staff'; end if;
end $$;

-- T5: DARFY no repite la misma pregunta.
do $$ begin
  perform darfy_log('¿Venden   palomitas?');
  perform darfy_log('¿venden palomitas?');
  if (select count(*) from darfy_unanswered where lower(pregunta) = '¿venden palomitas?') <> 1 then raise exception 'FALLO T5'; end if;
end $$;

-- T6: fotos de audiciones: solo a convocatorias abiertas y en la carpeta propia.
do $$ declare ab uuid; ce uuid; begin
  insert into auditions (production_id, titulo, estado) values ('showman', 'Abierta 90', 'abierta') returning id into ab;
  insert into auditions (production_id, titulo, estado) values ('showman', 'Cerrada 90', 'cerrada') returning id into ce;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000009a4');
  if not audition_upload_ok(ab || '/00000000-0000-0000-0000-0000000009a4/foto.jpg') then raise exception 'FALLO T6: no deja en abierta'; end if;
  if audition_upload_ok(ce || '/00000000-0000-0000-0000-0000000009a4/foto.jpg') then raise exception 'FALLO T6: deja en cerrada'; end if;
  if audition_upload_ok(ab || '/00000000-0000-0000-0000-0000000009a1/foto.jpg') then raise exception 'FALLO T6: carpeta ajena'; end if;
  if audition_upload_ok('00000000-0000-0000-0000-000000000000/00000000-0000-0000-0000-0000000009a4/foto.jpg') then raise exception 'FALLO T6: convocatoria inexistente'; end if;
  perform pg_temp.as_root();
end $$;

-- T7: asientos ocupados en una lista; anónimo puede leerla.
do $$ declare f uuid; s uuid; a uuid[]; begin
  insert into performances (production_id, starts_at, on_sale) values ('showman', now() + interval '20 days', true) returning id into f;
  select id into s from seats where production_id = 'showman' and is_active order by seat_label limit 1;
  insert into blocked_seats (performance_id, seat_id) values (f, s);
  perform set_config('role', 'anon', true);
  a := taken_seats(f);
  perform pg_temp.as_root();
  if not (s = any(a)) then raise exception 'FALLO T7: falta el asiento bloqueado'; end if;
end $$;

-- T8: eliminar cuenta borra sus datos de la bitácora.
do $$ begin
  insert into audit_log (tabla, accion, registro_id, actor, despues)
  values ('t90b', 'update', '00000000-0000-0000-0000-0000000009a4', '00000000-0000-0000-0000-0000000009a4', '{"user_id":"00000000-0000-0000-0000-0000000009a4","telefono":"55"}');
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000009a4');
  perform account_delete('ELIMINAR');
  perform pg_temp.as_root();
  if exists (select 1 from audit_log where tabla = 't90b' and (despues is not null or actor is not null)) then raise exception 'FALLO T8'; end if;
end $$;

-- T9: aviso de evento nuevo sin la hora repetida.
do $$ declare t text; begin
  insert into fan_encuentros (tipo, titulo, inicia, lugar, acceso, requiere_registro, requiere_boleto) values ('presencial', 'Evento 90', now() + interval '3 days', 'Foro', 'cuenta', true, false);
  select detalle into t from notifications where titulo like '%Evento 90%' or detalle like '%Evento 90%' order by id desc limit 1;
  if t is not null and (t like '%a las%a las%' or t like '%A Las%') then raise exception 'FALLO T9: %', t; end if;
end $$;

-- T10: el buscador encuentra una orden con su código sin "DARF-".
do $$ declare c text; n int; f uuid; s uuid; begin
  insert into performances (production_id, starts_at, on_sale) values ('showman', now() + interval '15 days', true) returning id into f;
  insert into performance_price_categories (performance_id, price_category_id, price)
    select f, id, 100 from price_categories where production_id = 'showman'
    on conflict (performance_id, price_category_id) do update set price = 100;
  select id into s from seats where production_id = 'showman' and is_active
     and exists (select 1 from performance_price_categories p where p.performance_id = f and p.price_category_id = seats.price_category_id)
   order by seat_label limit 1;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000009a3');
  c := create_seated_ticket_order(f, 'Comprador 90', '5512345678', array[s])->>'order_code';
  perform pg_temp.as_root();
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000009a2');
  select count(*) into n from panel_buscar(substr(c, 6, 4)) r where r.titulo = c;
  perform pg_temp.as_root();
  if n = 0 then raise exception 'FALLO T10: no encontró %', c; end if;
end $$;

select 'OK 0090';
