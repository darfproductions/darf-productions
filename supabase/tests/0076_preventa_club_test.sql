-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0076 aplicadas.

insert into auth.users (id, instance_id, aud, role, email)
values ('00000000-0000-0000-0000-0000000000a7', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_socio@test.local'),
       ('00000000-0000-0000-0000-0000000000a8', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_nosocio@test.local'),
       ('00000000-0000-0000-0000-0000000000a9', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_admin@test.local');
insert into fan_members (user_id) values ('00000000-0000-0000-0000-0000000000a7');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-0000000000a9';

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

create temp table ctx (k text primary key, v uuid);
grant all on ctx to public;

do $$ declare pf uuid; zona uuid; asientos uuid[]; begin
  -- Función en venta con preventa por 2 días, con un asiento y una zona general.
  insert into performances (production_id, starts_at, on_sale, preventa_hasta) values ('showman', now() + interval '20 days', true, now() + interval '2 days') returning id into pf;
  insert into performance_price_categories (performance_id, price_category_id, price)
    select pf, id, 100 from price_categories where production_id = 'showman' on conflict do nothing;
  insert into price_categories (production_id, nombre, cupo) values ('showman', 'General prueba', 10) returning id into zona;
  insert into performance_price_categories (performance_id, price_category_id, price) values (pf, zona, 80) on conflict (performance_id, price_category_id) do update set price = 80;
  insert into ctx values ('pf', pf), ('zona', zona);
end $$;

-- T1: en preventa, el no socio no aparta (asientos ni general); el socio sí.
do $$ declare pf uuid := (select v from ctx where k = 'pf'); zona uuid := (select v from ctx where k = 'zona'); s1 uuid; s2 uuid; begin
  select id into s1 from seats where production_id = 'showman' and is_active order by seat_label limit 1;
  select id into s2 from seats where production_id = 'showman' and is_active order by seat_label offset 1 limit 1;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a8');
  begin
    perform create_seated_ticket_order(pf, 'No socio', '55', array[s1]);
    raise exception 'FALLO T1: no socio apartó asiento en preventa';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if;
    if sqlerrm not like '%preventa para el Club Fan%' then raise exception 'FALLO T1: mensaje (%)', sqlerrm; end if;
  end;
  begin
    perform create_general_ticket_order(pf, 'No socio', '55', zona, 1);
    raise exception 'FALLO T1: no socio apartó general en preventa';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if;
  end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a7');
  perform create_seated_ticket_order(pf, 'Socio', '55', array[s1]);
  perform create_general_ticket_order(pf, 'Socio', '55', zona, 1);
  perform pg_temp.as_root();
  insert into ctx values ('s2', s2);
end $$;

-- T2: taquilla no se bloquea por la preventa.
do $$ declare pf uuid := (select v from ctx where k = 'pf'); zona uuid := (select v from ctx where k = 'zona'); begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a9');
  perform admin_create_general_order(pf, 'Taquilla', '55', zona, 1);
  perform pg_temp.as_root();
end $$;

-- T3: al pasar la fecha, venta normal para todos.
do $$ declare pf uuid := (select v from ctx where k = 'pf'); s2 uuid := (select v from ctx where k = 's2'); begin
  update performances set preventa_hasta = now() - interval '1 minute' where id = pf;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a8');
  perform create_seated_ticket_order(pf, 'No socio', '55', array[s2]);
  perform pg_temp.as_root();
end $$;

-- T4: recordatorio: solo socios; al abrir una función en preventa se avisa una vez.
do $$ declare pf2 uuid; n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a8');
  begin
    perform preventa_recordar('showman', true);
    raise exception 'FALLO T4: no socio activó recordatorio';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if;
  end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a7');
  perform preventa_recordar('showman', true);
  perform preventa_recordar('showman', true);
  perform pg_temp.as_root();

  insert into performances (production_id, starts_at, on_sale, preventa_hasta) values ('showman', now() + interval '30 days', false, now() + interval '3 days') returning id into pf2;
  if exists (select 1 from notifications where tipo = 'fanzone') then raise exception 'FALLO T4: avisó sin abrir la venta'; end if;
  update performances set on_sale = true where id = pf2;
  select count(*) into n from notifications where tipo = 'fanzone' and user_id = '00000000-0000-0000-0000-0000000000a7';
  if n <> 1 then raise exception 'FALLO T4: avisos (%)', n; end if;
  if exists (select 1 from preventa_recordatorios) then raise exception 'FALLO T4: no se borró el recordatorio'; end if;
  update performances set on_sale = false where id = pf2;
  update performances set on_sale = true where id = pf2;
  if (select count(*) from notifications where tipo = 'fanzone') <> 1 then raise exception 'FALLO T4: avisó dos veces'; end if;
end $$;

do $$ begin raise exception 'OK: TODAS LAS PRUEBAS PASARON (0076)'; end $$;
