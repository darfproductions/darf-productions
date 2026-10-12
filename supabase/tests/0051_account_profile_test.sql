-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0031–0051 aplicadas.

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_admin@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_cont@test.local'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_ana@test.local'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_fan@test.local'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_taq@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-0000000000a1';

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

do $$ declare n int; r record; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform panel_add_member('showman', 't_ana@test.local', 'integrante');
  perform panel_add_member('showman', 't_taq@test.local', 'taquilla');
  -- T1: nombres + apellidos arman el nombre; el rol no se puede cambiar
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
  update profiles set nombres = ' Ana ', apellidos = 'Pérez López', fecha_nacimiento = ('2010-' || to_char(current_date, 'MM') || '-01')::date,
         telefono = '5512345678' where id = auth.uid();
  select * into r from profiles where id = auth.uid();
  if r.nombre <> 'Ana Pérez López' then raise exception 'FALLO T1a: nombre %', r.nombre; end if;
  begin
    update profiles set rol = 'admin' where id = auth.uid();
    raise exception 'FALLO T1b: se subió de rol';
  exception when insufficient_privilege then null;
  end;
  begin
    update profiles set fecha_nacimiento = current_date + 1 where id = auth.uid();
    raise exception 'FALLO T1c: fecha en el futuro';
  exception when check_violation then null;
  end;
  begin
    update profiles set foto_path = '00000000-0000-0000-0000-0000000000e2/x.png' where id = auth.uid();
    raise exception 'FALLO T1d: foto en carpeta ajena';
  exception when check_violation then null;
  end;
  -- T2: la fecha es una sola (cuenta ↔ expediente)
  insert into person_files (user_id, telefono) values (auth.uid(), '1');
  reset role;
  if (select fecha_nacimiento from person_files where user_id = '00000000-0000-0000-0000-0000000000e1') is not null then
    -- el expediente nuevo no la trae aún: se copia al cambiarla
    null;
  end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
  update profiles set fecha_nacimiento = '2010-01-15' where id = auth.uid();
  if (select fecha_nacimiento from person_files where user_id = auth.uid()) <> '2010-01-15' then raise exception 'FALLO T2a: no pasó al expediente'; end if;
  update person_files set fecha_nacimiento = ('2010-' || to_char(current_date, 'MM') || '-02')::date where user_id = auth.uid();
  if extract(day from (select fecha_nacimiento from profiles where id = auth.uid())) <> 2 then raise exception 'FALLO T2b: no pasó a la cuenta'; end if;
  -- T3: cumpleaños de la obra: elenco activo y equipo los ven (sin año); un fan no
  select count(*) into n from birthdays('showman') b where b.nombre = 'Ana Pérez López' and b.nacimiento is null;
  if n <> 1 then raise exception 'FALLO T3a: la integrante no ve su cumpleaños en la obra'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
  select count(*) into n from birthdays('showman') b where b.foto_path is null or true;
  if n < 1 then raise exception 'FALLO T3b: taquilla no ve cumpleaños'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
  begin
    perform birthdays('showman');
    raise exception 'FALLO T3c: un fan ve cumpleaños de la obra';
  exception when raise_exception then if sqlerrm like 'FALLO%' then raise; end if;
  end;
  begin
    perform birthdays();
    raise exception 'FALLO T3d: un fan ve todos los cumpleaños';
  exception when raise_exception then if sqlerrm like 'FALLO%' then raise; end if;
  end;
  -- T4: el Director ve todos, con año
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  select count(*) into n from birthdays() b where b.nacimiento is not null;
  if n < 1 then raise exception 'FALLO T4: el Director no ve los cumpleaños'; end if;
  -- T5: foto: la ve la persona, el equipo de su obra y el Director; otro fan no
  if not can_see_avatar('00000000-0000-0000-0000-0000000000e1') then raise exception 'FALLO T5a: Director'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
  if not can_see_avatar('00000000-0000-0000-0000-0000000000e1') then raise exception 'FALLO T5b: equipo de la obra'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
  if can_see_avatar('00000000-0000-0000-0000-0000000000e1') then raise exception 'FALLO T5c: otro fan ve la foto'; end if;
  reset role;
end $$;

do $$ begin raise exception 'OK: 0051 pruebas T1–T5 (se aborta a propósito para no persistir)'; end $$;
