-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0077 aplicadas.

insert into auth.users (id, instance_id, aud, role, email)
values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_borrar@test.local'),
       ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_staff@test.local');
update profiles set rol = 'staff' where id = '00000000-0000-0000-0000-0000000000b2';
insert into fan_members (user_id) values ('00000000-0000-0000-0000-0000000000b1');

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

do $$ declare pasada uuid; futura uuid; o_pend uuid; o_fut uuid; o_vieja uuid; begin
  insert into performances (production_id, starts_at) values ('showman', now() - interval '10 days') returning id into pasada;
  insert into performances (production_id, starts_at) values ('showman', now() + interval '10 days') returning id into futura;
  insert into orders (performance_id, buyer_nombre, buyer_telefono, buyer_user_id, total, status) values (pasada, 'Ana', '4421', '00000000-0000-0000-0000-0000000000b1', 100, 'aprobado') returning id into o_vieja;
  insert into orders (performance_id, buyer_nombre, buyer_telefono, buyer_user_id, total) values (futura, 'Ana', '4421', '00000000-0000-0000-0000-0000000000b1', 100) returning id into o_pend;

  -- T1: confirmación escrita y orden pendiente.
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
  begin perform account_delete('si'); raise exception 'FALLO T1: sin ELIMINAR';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin perform account_delete('ELIMINAR'); raise exception 'FALLO T1: con orden pendiente';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if;
    if sqlerrm not like '%pendiente%' then raise exception 'FALLO T1: mensaje (%)', sqlerrm; end if; end;

  -- T2: boletos para una función futura.
  perform pg_temp.as_root();
  update orders set status = 'aprobado' where id = o_pend;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
  begin perform account_delete('ELIMINAR'); raise exception 'FALLO T2: con boletos futuros';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;

  -- T3: del equipo, no.
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
  begin perform account_delete('ELIMINAR'); raise exception 'FALLO T3: staff se borró';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;

  -- T4: sin pendientes ni funciones futuras: se borra; la orden vieja queda anónima.
  perform pg_temp.as_root();
  update orders set status = 'rechazado' where id = o_pend;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
  perform account_delete('ELIMINAR');
  perform pg_temp.as_root();
  if exists (select 1 from auth.users where id = '00000000-0000-0000-0000-0000000000b1') then raise exception 'FALLO T4: sigue la cuenta'; end if;
  if exists (select 1 from profiles where id = '00000000-0000-0000-0000-0000000000b1') then raise exception 'FALLO T4: sigue el perfil'; end if;
  if exists (select 1 from fan_members where user_id = '00000000-0000-0000-0000-0000000000b1') then raise exception 'FALLO T4: sigue en el club'; end if;
  if (select buyer_nombre from orders where id = o_vieja) <> 'Cuenta eliminada' or (select buyer_user_id from orders where id = o_vieja) is not null then
    raise exception 'FALLO T4: la orden no quedó anónima';
  end if;
end $$;

do $$ begin raise exception 'OK: TODAS LAS PRUEBAS PASARON (0077)'; end $$;
