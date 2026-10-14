-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0098 aplicadas.

insert into auth.users (id, instance_id, aud, role, email)
values ('00000000-0000-0000-0000-0000000009c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't98_comprador@test.local'),
       ('00000000-0000-0000-0000-0000000009c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't98_admin@test.local'),
       ('00000000-0000-0000-0000-0000000009c3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't98_otro@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-0000000009c2';
update wallet_config set hook_url = 'https://ejemplo.test/wallet/apple/aviso';

create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create or replace function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end $$;
create or replace function pg_temp.as_root() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;
create temp table ctx (k text primary key, v text);
grant all on ctx to public;

-- Función con un boleto aprobado del comprador (la taquilla lo aprueba al crearlo).
do $$ declare f uuid; s uuid; j json; oid uuid; t uuid; begin
  insert into performances (production_id, starts_at, on_sale) values ('showman', now() + interval '12 days', true) returning id into f;
  insert into performance_price_categories (performance_id, price_category_id, price)
    select f, id, 200 from price_categories where production_id = 'showman'
    on conflict (performance_id, price_category_id) do update set price = 200;
  select id into s from seats where production_id = 'showman' and is_active
     and exists (select 1 from performance_price_categories p where p.performance_id = f and p.price_category_id = seats.price_category_id)
   order by seat_label limit 1;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000009c2');
  j := admin_create_seated_order(f, 'Ana Wallet', '5511111111', array[s]);
  oid := (j->>'order_id')::uuid;
  perform pg_temp.as_root();
  update orders set buyer_user_id = '00000000-0000-0000-0000-0000000009c1' where id = oid;
  select id into t from tickets where order_id = oid;
  insert into ctx values ('f', f), ('o', oid), ('t', t);
end $$;

-- T1: alta del pase: solo el dueño; el token no cambia al volver a descargar.
do $$ declare t uuid := (select v from ctx where k = 't'); a json; b json; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000009c3');
  begin perform wallet_pase_alta(t); raise exception 'FALLO T1: ajeno dio de alta';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000009c1');
  a := wallet_pase_alta(t); b := wallet_pase_alta(t);
  if a->>'serial' <> 'boleto-' || t or a->>'token' <> b->>'token' or length(a->>'token') < 32 then raise exception 'FALLO T1: %', a; end if;
  insert into ctx values ('serial', a->>'serial'), ('token', a->>'token');
  perform pg_temp.as_anon();
  begin perform wallet_pase_alta(t); raise exception 'FALLO T1: anon dio de alta';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  perform pg_temp.as_root();
end $$;

-- T2: registro del iPhone (sin sesión): token malo → null; bueno → nuevo y luego existente.
do $$ declare s text := (select v from ctx where k = 'serial'); tk text := (select v from ctx where k = 'token'); r json; begin
  perform pg_temp.as_anon();
  if wallet_dispositivo_alta('iphone1', s, 'malo', 'abc123') is not null then raise exception 'FALLO T2: token malo'; end if;
  if wallet_dispositivo_alta('iphone1', s, tk, 'abc123') <> 'nuevo' then raise exception 'FALLO T2: nuevo'; end if;
  if wallet_dispositivo_alta('iphone1', s, tk, 'abc124') <> 'existente' then raise exception 'FALLO T2: existente'; end if;
  r := wallet_series_cambiadas('iphone1', null);
  if (r->'serials'->>0) <> s then raise exception 'FALLO T2: series %', r; end if;
  insert into ctx values ('ultimo', r->>'ultimo');
  r := wallet_series_cambiadas('iphone1', (r->>'ultimo')::bigint);
  if json_array_length(r->'serials') <> 0 then raise exception 'FALLO T2: sin cambios %', r; end if;
  if wallet_pase_datos(s, 'malo') is not null then raise exception 'FALLO T2: datos con token malo'; end if;
  r := wallet_pase_datos(s, tk);
  if (r->'boleto'->>'is_active')::boolean is not true or r->'boleto'->'orders'->>'status' <> 'aprobado'
     or r->'boleto'->'orders'->'performances'->'productions'->>'nombre' is null then raise exception 'FALLO T2: datos %', r; end if;
  perform pg_temp.as_root();
end $$;

-- T3: check-in en la puerta, cambio de fecha, obra y cancelación: cada uno marca el pase (y avisa si hay pg_net).
create or replace function pg_temp.cambio(paso text) returns void language plpgsql as $$
declare r json;
begin
  perform pg_temp.as_anon();
  r := wallet_series_cambiadas('iphone1', (select v from ctx where k = 'ultimo')::bigint);
  if json_array_length(r->'serials') <> 1 then raise exception 'FALLO %: no se marcó %', paso, r; end if;
  perform pg_temp.as_root();
  update ctx set v = r->>'ultimo' where k = 'ultimo';
end $$;
do $$ begin
  update tickets set checked_in_at = now() where id = (select v from ctx where k = 't')::uuid;
  perform pg_temp.cambio('T3 check-in');
  update performances set starts_at = starts_at + interval '1 hour' where id = (select v from ctx where k = 'f')::uuid;
  perform pg_temp.cambio('T3 fecha');
  update productions set nombre = nombre || ' ' where id = 'showman';
  perform pg_temp.cambio('T3 obra');
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000009c2');
  perform admin_cancel_order((select v from ctx where k = 'o')::uuid, 'Prueba');
  perform pg_temp.cambio('T3 cancelación');
  perform pg_temp.as_anon();
  if (wallet_pase_datos((select v from ctx where k = 'serial'), (select v from ctx where k = 'token'))->'boleto'->>'is_active')::boolean then
    raise exception 'FALLO T3: sigue activo';
  end if;
  perform pg_temp.as_root();
end $$;

-- T4: credencial: alta, Club Fan y credencial nueva marcan el pase; los datos traen el QR nuevo.
do $$ declare a json; r json; tok text; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000009c1');
  perform credencial_mia();
  a := wallet_pase_alta(null);
  if a->>'serial' !~ '^cred-[0-9a-f]{24}$' then raise exception 'FALLO T4: serial %', a; end if;
  perform pg_temp.as_anon();
  perform wallet_dispositivo_alta('iphone2', a->>'serial', a->>'token', 'def456');
  r := wallet_series_cambiadas('iphone2', null);
  insert into ctx values ('ultimo2', r->>'ultimo');
  tok := wallet_pase_datos(a->>'serial', a->>'token')->'credencial'->>'token';
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000009c1');
  perform fan_join();
  perform pg_temp.as_anon();
  r := wallet_series_cambiadas('iphone2', (select v from ctx where k = 'ultimo2')::bigint);
  if json_array_length(r->'serials') <> 1 then raise exception 'FALLO T4: club no marcó'; end if;
  if wallet_pase_datos(a->>'serial', a->>'token')->'credencial'->>'nivel' <> 'club' then raise exception 'FALLO T4: nivel'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000009c1');
  perform badge_regenerar();
  perform pg_temp.as_anon();
  if wallet_pase_datos(a->>'serial', a->>'token')->'credencial'->>'token' = tok then raise exception 'FALLO T4: QR viejo'; end if;
  -- credencial_mia sigue igual para quien tiene sesión.
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000009c1');
  if credencial_mia()->>'nivel' <> 'club' then raise exception 'FALLO T4: credencial_mia'; end if;
  perform pg_temp.as_root();
end $$;

-- T5: baja del iPhone y limpieza de teléfonos inválidos (solo con el secreto).
do $$ declare s text := (select v from ctx where k = 'serial'); tk text := (select v from ctx where k = 'token'); begin
  perform pg_temp.as_anon();
  if wallet_push_baja('malo', array['def456']) <> 0 then raise exception 'FALLO T5: secreto malo'; end if;
  if wallet_dispositivo_baja('iphone1', s, 'malo') then raise exception 'FALLO T5: baja con token malo'; end if;
  if not wallet_dispositivo_baja('iphone1', s, tk) then raise exception 'FALLO T5: baja'; end if;
  perform pg_temp.as_root();
  if wallet_push_baja((select hook_secret from wallet_config), array['def456']) <> 1 then raise exception 'FALLO T5: push_baja'; end if;
  if exists (select 1 from wallet_registros) then raise exception 'FALLO T5: quedan registros'; end if;
  -- Las tablas no se leen directo.
  perform pg_temp.as_anon();
  begin perform 1 from wallet_pases; raise exception 'FALLO T5: anon lee wallet_pases';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  perform pg_temp.as_root();
end $$;

select 'OK 0098';
