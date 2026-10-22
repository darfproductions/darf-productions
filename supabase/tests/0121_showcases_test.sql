-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0121 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't121_admin@test.local'),
  ('00000000-0000-0000-0000-000000000d02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't121_nadie@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-000000000d01';

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

do $$ declare pl uuid; r json; ok boolean; n int; begin
  select id into pl from showcase_planes order by orden limit 1;
  -- T1: el público ve planes y página; manda solicitud sin cuenta y recibe el WhatsApp.
  perform pg_temp.as_anon();
  if (select count(*) from showcase_planes) < 1 or (select count(*) from showcase_ajustes) <> 1 then raise exception 'FALLO T1: lectura'; end if;
  r := showcase_solicitar(pl, 'Ana Pérez', '442 123 4567', null, (now() + interval '30 days')::date, '18:00', 'Querétaro', 'Escuela', 120, 'Festival');
  if r->>'whatsapp' is null then raise exception 'FALLO T1: whatsapp'; end if;
  if (select count(*) from showcase_solicitudes) <> 0 then raise exception 'FALLO T1: anon ve solicitudes'; end if;
  -- T2: validaciones (fecha pasada, teléfono) y tope diario.
  begin perform showcase_solicitar(pl, 'Ana', '4421234567', null, '2020-01-01', null, null, null, null, null); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T2: fecha pasada'; end if;
  begin perform showcase_solicitar(pl, 'Ana', '123', null, null, null, null, null, null, null); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T2: teléfono'; end if;
  for n in 1..4 loop perform showcase_solicitar(pl, 'Ana', '4421234567', null, null, null, null, null, null, null); end loop;
  begin perform showcase_solicitar(pl, 'Ana', '4421234567', null, null, null, null, null, null, null); ok := false; exception when others then ok := true; end;
  if not ok then raise exception 'FALLO T2: tope'; end if;
  -- T3: Casa DARF (admin) ve la bandeja y cambia el estado; alguien sin permiso no.
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000d01');
  if (select count(*) from showcase_solicitudes) <> 5 then raise exception 'FALLO T3: bandeja'; end if;
  update showcase_solicitudes set estado = 'cotizada' where nombre = 'Ana Pérez';
  update showcase_planes set precio = 3600 where id = pl;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000d02');
  if (select count(*) from showcase_solicitudes) <> 0 then raise exception 'FALLO T3: sin permiso ve'; end if;
  update showcase_planes set precio = 1 where id = pl;
  perform pg_temp.as_root();
  if (select precio from showcase_planes where id = pl) <> 3600 then raise exception 'FALLO T3: precio'; end if;
  if (select estado from showcase_solicitudes where nombre = 'Ana Pérez') <> 'cotizada' then raise exception 'FALLO T3: estado'; end if;
  -- T4: plan inactivo: no se ve ni se solicita.
  update showcase_planes set activo = false where id = pl;
  perform pg_temp.as_anon();
  if exists (select 1 from showcase_planes where id = pl) then raise exception 'FALLO T4: se ve'; end if;
  begin perform showcase_solicitar(pl, 'Luis', '4429999999', null, null, null, null, null, null, null); ok := false; exception when others then ok := true; end;
  perform pg_temp.as_root();
  if not ok then raise exception 'FALLO T4: se solicita'; end if;
end $$;

select 'TODO OK';
