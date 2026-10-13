-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0031–0067 aplicadas.

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_admin@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_staff@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_uno@test.local'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_dos@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-0000000000a1';
update profiles set rol = 'staff' where id = '00000000-0000-0000-0000-0000000000c1';

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create or replace function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end $$;
create or replace function pg_temp.reset() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

do $$ declare n int; total int; fid uuid; ok boolean; begin
  select count(*) into total from darfy_faq;
  if total < 10 then raise exception 'FALLO: faltan preguntas iniciales (%)', total; end if;
  update darfy_faq set activa = false where orden = 10 returning id into fid;

  -- Público: solo activas; no escribe; puede registrar preguntas sin respuesta pero no leerlas.
  perform pg_temp.as_anon();
  select count(*) into n from darfy_faq;
  if n <> total - 1 then raise exception 'FALLO: anon ve inactivas (% de %)', n, total; end if;
  ok := false;
  begin insert into darfy_faq (pregunta, respuesta) values ('¿Hola hola?', 'x'); exception when others then ok := true; end;
  if not ok then raise exception 'FALLO: anon escribe en darfy_faq'; end if;
  perform darfy_log('  ¿Hay   estacionamiento?  ');
  perform darfy_log('a');
  ok := false;
  begin perform 1 from darfy_unanswered; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO: anon lee darfy_unanswered'; end if;

  -- Persona común: ve activas, no escribe, no lee preguntas sin respuesta.
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  select count(*) into n from darfy_faq;
  if n <> total - 1 then raise exception 'FALLO: usuario ve inactivas'; end if;
  update darfy_faq set respuesta = 'hackeado' where id <> fid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO: usuario edita darfy_faq'; end if;
  select count(*) into n from darfy_unanswered;
  if n <> 0 then raise exception 'FALLO: usuario lee darfy_unanswered'; end if;

  -- Staff: ve todo, edita y lee lo que no se contestó (texto limpio; la de 1 letra no se guardó).
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  select count(*) into n from darfy_faq;
  if n <> total then raise exception 'FALLO: staff no ve inactivas'; end if;
  insert into darfy_faq (pregunta, respuesta, palabras) values ('¿Hay estacionamiento?', 'Sí, en el teatro.', '{estacionamiento}');
  if (select updated_by from darfy_faq where pregunta = '¿Hay estacionamiento?') <> '00000000-0000-0000-0000-0000000000c1' then
    raise exception 'FALLO: updated_by'; end if;
  select count(*) into n from darfy_unanswered where pregunta = '¿Hay estacionamiento?';
  if n <> 1 then raise exception 'FALLO: darfy_log no limpió o no guardó (%)', n; end if;
  if (select count(*) from darfy_unanswered) <> 1 then raise exception 'FALLO: darfy_log guardó texto corto'; end if;
  delete from darfy_unanswered;
  perform pg_temp.reset();

  -- Push: cada quien se suscribe y solo ve lo suyo; el navegador cambia de dueño al cambiar de cuenta.
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  perform push_subscribe('https://push.example/abc', 'k1', 'a1', 'Chrome');
  perform push_subscribe('https://push.example/abc', 'k2', 'a2', 'Chrome');
  select count(*) into n from push_subscriptions;
  if n <> 1 then raise exception 'FALLO: suscripción duplicada (%)', n; end if;
  ok := false;
  begin insert into push_subscriptions (user_id, endpoint, p256dh, auth) values (auth.uid(), 'https://x', 'k', 'a'); exception when others then ok := true; end;
  if not ok then raise exception 'FALLO: insert directo a push_subscriptions'; end if;
  perform push_set_off(array['orden', 'inventado']);
  if (select apagados from push_prefs where user_id = auth.uid()) <> array['orden'] then raise exception 'FALLO: push_set_off'; end if;
  -- 0068: push_test es solo para el equipo; aquí se prueba que la notificación se crea sin pg_net.
  perform pg_temp.reset();
  insert into notifications (user_id, tipo, titulo) values ('00000000-0000-0000-0000-0000000000d1', 'prueba', 'Prueba');
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  select count(*) into n from notifications where tipo = 'prueba';
  if n <> 1 then raise exception 'FALLO: la notificación no se creó (sin pg_net no debe fallar)'; end if;

  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
  select count(*) into n from push_subscriptions;
  if n <> 0 then raise exception 'FALLO: ve suscripciones ajenas'; end if;
  delete from push_subscriptions;
  perform push_subscribe('https://push.example/abc', 'k3', 'a3', 'Safari');
  select count(*) into n from push_subscriptions;
  if n <> 1 then raise exception 'FALLO: el navegador no pasó a la nueva cuenta'; end if;
  ok := false;
  begin perform 1 from push_config; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO: usuario lee push_config'; end if;
  perform push_public_key();

  perform pg_temp.as_anon();
  ok := false;
  begin perform push_subscribe('https://push.example/z', 'k', 'a', 'x'); exception when others then ok := true; end;
  if not ok then raise exception 'FALLO: anon se suscribe'; end if;
  perform pg_temp.reset();

  -- El gancho no rompe la notificación aunque la configuración apunte a algo inválido.
  update push_config set hook_url = 'https://hook.example/push-send';
  insert into notifications (user_id, tipo, titulo) values ('00000000-0000-0000-0000-0000000000d2', 'contacto', 'x');
  if (select count(*) from push_subscriptions where user_id = '00000000-0000-0000-0000-0000000000d2') <> 1 then
    raise exception 'FALLO: estado inesperado'; end if;

  raise exception 'OK: 0067 DARFY y push';
end $$;
