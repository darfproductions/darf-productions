-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0031–0072 aplicadas.

insert into auth.users (id, instance_id, aud, role, email)
values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_fan@test.local'),
       ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_fan2@test.local');

create temp table ctx (k text primary key, v uuid);

do $$ declare pf uuid; pf2 uuid; o uuid; n int; t text; fan uuid := '00000000-0000-0000-0000-0000000000c1'; begin
  insert into performances (production_id, starts_at, on_sale) values ('showman', now() + interval '20 days', true) returning id into pf;
  insert into performances (production_id, starts_at, on_sale) values ('showman', now() + interval '5 hours', true) returning id into pf2;

  -- T1: aprobar avisa al comprador "¡Tus boletos están listos!"; a una compra sin cuenta, no.
  insert into orders (performance_id, buyer_nombre, buyer_telefono, buyer_user_id, total) values (pf, 'Ana', '55', fan, 100) returning id into o;
  update orders set status = 'aprobado', approved_at = now() where id = o;
  select count(*) into n from notifications where user_id = fan and tipo = 'boletos' and titulo = '¡Tus boletos están listos!';
  if n <> 1 then raise exception 'FALLO T1: aviso de aprobada (%)', n; end if;
  insert into orders (performance_id, buyer_nombre, buyer_telefono, total) values (pf, 'Sin cuenta', '55', 100) returning id into o;
  update orders set status = 'aprobado' where id = o;
  if (select count(*) from notifications where tipo = 'boletos') <> 1 then raise exception 'FALLO T1: avisó sin cuenta'; end if;

  -- T2: cancelada por la producción y vencida por no pagar (expire_due_orders).
  insert into orders (performance_id, buyer_nombre, buyer_telefono, buyer_user_id, total) values (pf, 'Ana', '55', fan, 100) returning id into o;
  update orders set status = 'rechazado', rejected_at = now() where id = o;
  if not exists (select 1 from notifications where user_id = fan and titulo = 'Tu orden fue cancelada') then raise exception 'FALLO T2: cancelada'; end if;
  insert into orders (performance_id, buyer_nombre, buyer_telefono, buyer_user_id, total) values (pf, 'Ana', '55', fan, 100) returning id into o;
  update orders set expires_at = now() - interval '1 minute' where id = o;
  perform expire_due_orders();
  if not exists (select 1 from notifications where user_id = fan and titulo = 'Tu apartado venció' and href = '/producciones/showman') then raise exception 'FALLO T2: vencida'; end if;

  -- T3: apartado por vencer: avisa una sola vez; si se apartó hace menos de 30 min, todavía no.
  insert into orders (performance_id, buyer_nombre, buyer_telefono, buyer_user_id, total, created_at) values (pf, 'Ana', '55', fan, 100, now() - interval '20 hours') returning id into o;
  update orders set expires_at = now() + interval '90 minutes' where id = o;
  insert into ctx values ('vence', o);
  insert into orders (performance_id, buyer_nombre, buyer_telefono, buyer_user_id, total) values (pf, 'Beto', '55', '00000000-0000-0000-0000-0000000000c2', 100) returning id into o;
  update orders set expires_at = now() + interval '90 minutes' where id = o;
  perform notify_buyer_reminders();
  perform notify_buyer_reminders();
  select count(*) into n from notifications where user_id = fan and titulo = 'Tu apartado vence pronto';
  if n <> 1 then raise exception 'FALLO T3: avisos de vencimiento (%)', n; end if;
  if exists (select 1 from notifications where user_id = '00000000-0000-0000-0000-0000000000c2') then raise exception 'FALLO T3: avisó una orden recién hecha'; end if;

  -- T4: recordatorio de la función (5 h antes): una vez y solo si tiene boletos activos.
  insert into orders (performance_id, buyer_nombre, buyer_telefono, buyer_user_id, total) values (pf2, 'Ana', '55', fan, 100) returning id into o;
  insert into tickets (order_id, seat_id, unit_price) values (o, (select id from seats where production_id = 'showman' order by seat_label limit 1), 100);
  update orders set status = 'aprobado', approved_at = now() where id = o;
  perform notify_buyer_reminders();
  perform notify_buyer_reminders();
  select count(*), max(titulo) into n, t from notifications where user_id = fan and titulo like 'Tu función es %';
  if n <> 1 then raise exception 'FALLO T4: recordatorios (%)', n; end if;
  if t not like 'Tu función es hoy a las %' and t not like 'Tu función es mañana a las %' then raise exception 'FALLO T4: texto (%)', t; end if;

  -- T5: nadie de afuera puede disparar los recordatorios.
  if has_function_privilege('authenticated', 'notify_buyer_reminders()', 'execute') or has_function_privilege('anon', 'notify_buyer_reminders()', 'execute') then
    raise exception 'FALLO T5: recordatorios ejecutables desde la web'; end if;

  raise exception 'OK: 0072 avisos para quien compra';
end $$;
