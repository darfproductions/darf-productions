-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0031–0071 aplicadas.

insert into auth.users (id, instance_id, aud, role, email)
values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_fan@test.local');

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

do $$ declare ok boolean := false; n int; begin
  if has_function_privilege('anon', 'push_test()', 'execute') then raise exception 'FALLO: anon puede probar'; end if;
  -- Alguien sin panel (fan o elenco) ya puede probar su teléfono, y la prueba lleva a Mi cuenta.
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  for n in 1 .. 5 loop perform push_test(); end loop;
  if (select count(*) from notifications where tipo = 'prueba' and href = '/cuenta/notificaciones') <> 5 then raise exception 'FALLO: pruebas'; end if;
  -- La sexta en una hora no.
  begin perform push_test(); exception when others then ok := true; end;
  if not ok then raise exception 'FALLO: más de 5 pruebas por hora'; end if;
  reset role;
  raise exception 'OK: 0071 probar notificaciones desde Mi cuenta';
end $$;
