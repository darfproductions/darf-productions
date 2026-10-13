-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0095 aplicadas.

insert into auth.users (id, instance_id, aud, role, email)
values ('00000000-0000-0000-0000-0000000009e1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't95_fan@test.local');

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

-- T1: unirse, pedir recordatorio de preventa y salir: deja de ser socio y se borra el recordatorio.
do $$ declare antes int; despues int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000009e1');
  antes := (fan_join()->>'numero')::int;
  perform preventa_recordar('showman', true);
  perform fan_leave();
  if is_fan_member() then raise exception 'FALLO T1: sigue siendo socio'; end if;
  perform pg_temp.as_root();
  if exists (select 1 from preventa_recordatorios where user_id = '00000000-0000-0000-0000-0000000009e1') then raise exception 'FALLO T1: recordatorio'; end if;
  -- T2: volver a unirse da un número nuevo.
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000009e1');
  despues := (fan_join()->>'numero')::int;
  if despues <= antes then raise exception 'FALLO T2: mismo número'; end if;
  perform pg_temp.as_root();
end $$;

-- T3: quien no es socio no puede "salir"; sin sesión, tampoco.
do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000009e1');
  perform fan_leave();
  begin
    perform fan_leave();
    raise exception 'FALLO T3: salió dos veces';
  exception when others then
    if sqlerrm not like 'No estás en el Club Fan%' then raise exception 'FALLO T3: %', sqlerrm; end if;
  end;
  perform pg_temp.as_root();
end $$;

select 'OK 0095';
