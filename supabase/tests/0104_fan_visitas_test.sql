-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0104 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000f41', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't104_fan@test.local'),
  ('00000000-0000-0000-0000-000000000f42', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't104_otro@test.local');

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
create temp table t104 (k text primary key, v uuid);

-- Funciones y compras de prueba.
do $$ declare p1 uuid; p2 uuid; p3 uuid; o1 uuid; o2 uuid; o3 uuid; o4 uuid; begin
  insert into performances (production_id, starts_at, on_sale) values ('showman', now() - interval '3 days', false) returning id into p1;
  insert into performances (production_id, starts_at, on_sale) values ('showman', now() - interval '2 days', false) returning id into p2;
  insert into performances (production_id, starts_at, on_sale) values ('showman', now() - interval '1 days', false) returning id into p3;
  insert into t104 values ('p1', p1), ('p2', p2), ('p3', p3);
  -- Función 1: compra 3 boletos, entran todos (cuenta 1).
  insert into orders (order_code, performance_id, status, buyer_nombre, buyer_telefono, buyer_user_id, total)
    values ('T104A', p1, 'aprobado', 'Fan', '5512345678', '00000000-0000-0000-0000-000000000f41', 300) returning id into o1;
  insert into tickets (order_id, performance_id, unit_price, checked_in_at) select o1, p1, 100, now() from generate_series(1, 3);
  -- Función 2: compró pero no ha entrado (no cuenta todavía).
  insert into orders (order_code, performance_id, status, buyer_nombre, buyer_telefono, buyer_user_id, total)
    values ('T104B', p2, 'aprobado', 'Fan', '5512345678', '00000000-0000-0000-0000-000000000f41', 100) returning id into o2;
  insert into tickets (order_id, performance_id, unit_price) values (o2, p2, 100);
  insert into t104 values ('o2', o2);
  -- Función 3: orden rechazada con boleto escaneado (no cuenta).
  insert into orders (order_code, performance_id, status, buyer_nombre, buyer_telefono, buyer_user_id, total)
    values ('T104C', p3, 'rechazado', 'Fan', '5512345678', '00000000-0000-0000-0000-000000000f41', 100) returning id into o3;
  insert into tickets (order_id, performance_id, unit_price, checked_in_at) values (o3, p3, 100, now());
  -- Otra persona en la función 3 (no cuenta para la fan).
  insert into orders (order_code, performance_id, status, buyer_nombre, buyer_telefono, buyer_user_id, total)
    values ('T104D', p3, 'aprobado', 'Otro', '5512345679', '00000000-0000-0000-0000-000000000f42', 100) returning id into o4;
  insert into tickets (order_id, performance_id, unit_price, checked_in_at) values (o4, p3, 100, now());
end $$;

-- T1: una función con varios boletos cuenta una vez; sin entrar o rechazada no cuenta.
do $$ begin
  if fan_visitas('00000000-0000-0000-0000-000000000f41') <> 1 then raise exception 'FALLO T1: %', fan_visitas('00000000-0000-0000-0000-000000000f41'); end if;
  if fan_visitas('00000000-0000-0000-0000-000000000f42') <> 1 then raise exception 'FALLO T1: otro'; end if;
  if fan_visitas(null) <> 0 then raise exception 'FALLO T1: null'; end if;
end $$;

-- T2: al entrar a la función 2 sube a 2.
do $$ begin
  update tickets set checked_in_at = now() where order_id = (select v from t104 where k = 'o2');
  if fan_visitas('00000000-0000-0000-0000-000000000f41') <> 2 then raise exception 'FALLO T2'; end if;
end $$;

-- T3: eventos. Presencial con llegada suma; apartado sin llegar no; el de la función 1 no suma doble;
-- el de la función 3 (sin boleto escaneado suyo) sí suma como esa función.
do $$ declare e1 uuid; e2 uuid; e3 uuid; e4 uuid; begin
  insert into fan_encuentros (tipo, titulo, inicia, cupo, requiere_boleto) values ('presencial', 'Ensayo abierto', now() - interval '1 day', 50, false) returning id into e1;
  insert into fan_encuentros (tipo, titulo, inicia, cupo, requiere_boleto) values ('presencial', 'Meet & greet', now() + interval '5 days', 50, false) returning id into e2;
  insert into fan_encuentros (tipo, production_id, performance_id, cupo) values ('funcion', 'showman', (select v from t104 where k = 'p1'), 20) returning id into e3;
  insert into fan_encuentros (tipo, production_id, performance_id, cupo) values ('funcion', 'showman', (select v from t104 where k = 'p3'), 20) returning id into e4;
  insert into fan_encuentro_lugares (encuentro_id, user_id, llegada_at) values
    (e1, '00000000-0000-0000-0000-000000000f41', now()),
    (e2, '00000000-0000-0000-0000-000000000f41', null),
    (e3, '00000000-0000-0000-0000-000000000f41', now()),
    (e4, '00000000-0000-0000-0000-000000000f41', now());
  if fan_visitas('00000000-0000-0000-0000-000000000f41') <> 4 then
    raise exception 'FALLO T3: % (esperaba 4: f1, f2, f3 y el ensayo abierto)', fan_visitas('00000000-0000-0000-0000-000000000f41');
  end if;
end $$;

-- T4: el conteo no se llama desde fuera; la credencial lleva el número.
do $$ declare ok boolean; j json; t text; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000f42');
  begin perform fan_visitas('00000000-0000-0000-0000-000000000f41'); ok := false;
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FALLO T4: fan_visitas abierta'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000f41');
  j := credencial_mia();
  perform pg_temp.as_root();
  if (j->>'fan_visitas')::int <> 4 then raise exception 'FALLO T4: credencial_mia %', j; end if;
  if (j->>'lealtad')::int <> 0 then raise exception 'FALLO T4: lealtad'; end if;
  select token into t from badges where user_id = '00000000-0000-0000-0000-000000000f41';
  if (badge_publico(t)->>'fan_visitas')::int <> 4 then raise exception 'FALLO T4: badge_publico'; end if;
end $$;

-- T5: entrar a la función marca el pase de Wallet de quien compró.
do $$ begin
  insert into wallet_pases (serial, tipo, user_id) values ('cred-000000000000000000000104', 'credencial', '00000000-0000-0000-0000-000000000f41')
    on conflict do nothing;
  update wallet_pases set cambiado_at = '2000-01-01' where serial = 'cred-000000000000000000000104';
  update tickets set checked_in_at = null where order_id = (select v from t104 where k = 'o2');
  if (select cambiado_at from wallet_pases where serial = 'cred-000000000000000000000104') = '2000-01-01' then raise exception 'FALLO T5: no marcó el pase'; end if;
end $$;

select 'OK 0104 fan_visitas' as resultado;
