-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0086 aplicadas.

insert into auth.users (id, instance_id, aud, role, email)
values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_admin@test.local'),
       ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_elenco@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-0000000000a1';
insert into production_members (production_id, user_id, role_id) values ('showman', '00000000-0000-0000-0000-0000000000a2', 'integrante');

do $$ declare n int; begin
  -- T1: hoy_mx() es la fecha de Ciudad de México.
  if hoy_mx() <> (now() at time zone 'America/Mexico_City')::date then raise exception 'FALLO T1: hoy_mx'; end if;
  -- T2: el ingreso al elenco se registra con la fecha de México.
  if (select ingreso from member_enrollment where production_id = 'showman' and user_id = '00000000-0000-0000-0000-0000000000a2') <> hoy_mx() then
    raise exception 'FALLO T2: ingreso';
  end if;
  -- T3: una baja "hoy" (sin fecha) deja a la persona inactiva al momento, a cualquier hora.
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000000a1', 'role', 'authenticated')::text, true);
  perform member_withdraw('showman', '00000000-0000-0000-0000-0000000000a2', null, 'Prueba');
  if (select baja_at from member_enrollment where production_id = 'showman' and user_id = '00000000-0000-0000-0000-0000000000a2') <> hoy_mx() then raise exception 'FALLO T3: fecha de baja'; end if;
  if is_active_member('showman', '00000000-0000-0000-0000-0000000000a2') then raise exception 'FALLO T3: sigue activa'; end if;
  -- T4: ninguna función de la app usa la fecha UTC (current_date).
  select count(*) into n from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosrc ilike '%current_date%';
  if n <> 0 then raise exception 'FALLO T4: % funciones con current_date', n; end if;
  select count(*) into n from information_schema.columns where table_schema = 'public' and column_default ilike '%current_date%';
  if n <> 0 then raise exception 'FALLO T4: % columnas con current_date', n; end if;
  select count(*) into n from pg_constraint c join pg_namespace s on s.oid = c.connamespace where s.nspname = 'public' and pg_get_constraintdef(c.oid) ilike '%current_date%';
  if n <> 0 then raise exception 'FALLO T4: % reglas con current_date', n; end if;
end $$;

select 'OK 0086' as resultado;
