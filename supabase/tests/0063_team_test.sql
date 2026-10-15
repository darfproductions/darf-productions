-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0031–0063 aplicadas.

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_admin@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_prod@test.local');
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

do $$ declare ana uuid; beto uuid; caro uuid; n int; r record; begin
  insert into people (nombre) values ('Ana Directora') returning id into ana;
  insert into people (nombre) values ('Beto Productor') returning id into beto;
  insert into people (nombre) values ('Caro Oculta') returning id into caro;
  insert into pro_profiles (person_id, slug, publico, retrato_path, semblanza) values (ana, 'ana-directora', true, ana::text || '/r.jpg', 'Fundadora');
  insert into pro_profiles (person_id, slug, publico, retrato_path) values (beto, 'beto-productor', false, beto::text || '/r.jpg');

  -- T1: Producción de una obra (no Director) no edita el equipo
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform panel_add_member('mm', 't_prod@test.local', 'productor');
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
  begin
    insert into team_members (person_id, cargo) values (ana, 'Directora');
    raise exception 'FALLO T1: no-Director agregó';
  exception when insufficient_privilege then null;
  end;

  -- T2: el Director arma el equipo
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  insert into team_members (person_id, cargo, orden) values (ana, 'Directora general', 1), (beto, 'Producción ejecutiva', 2);
  insert into team_members (person_id, cargo, orden, visible) values (caro, 'Asistente', 3, false);
  begin
    insert into team_members (person_id, cargo) values (ana, 'Otra vez');
    raise exception 'FALLO T2a: duplicó persona';
  exception when unique_violation then null;
  end;
  update team_members set cargo = 'Directora general y fundadora' where person_id = ana;
  if (select count(*) from audit_log where tabla = 'team_members') < 4 then raise exception 'FALLO T2b: bitácora'; end if;

  -- T3: desde 0105 "Conoce al equipo" sale de Casa DARF (ver 0105_buscar_nosotros_casa_test.sql);
  -- con 0105, team_members ya no se muestra. Antes de 0105 se comprueba lo de siempre.
  if to_regprocedure('public.buscar_cuentas(text)') is null then
    perform pg_temp.as_anon();
    select count(*) into n from team_public();
    if n <> 2 then raise exception 'FALLO T3a: % visibles', n; end if;
    select * into r from team_public() where nombre = 'Ana Directora';
    if r.slug <> 'ana-directora' or r.retrato_path is null or r.cargo <> 'Directora general y fundadora' then raise exception 'FALLO T3b'; end if;
    select * into r from team_public() where nombre = 'Beto Productor';
    if r.slug is not null or r.retrato_path is not null then raise exception 'FALLO T3c: mostró perfil privado'; end if;
    if (select nombre from team_public() order by 1 limit 1) = 'Caro Oculta' then raise exception 'FALLO T3d'; end if;
  end if;
  perform pg_temp.as_anon();
  begin
    perform 1 from team_members;
    raise exception 'FALLO T3e: anónimo leyó la tabla';
  exception when insufficient_privilege then null;
  end;

  -- T4: el Director quita
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  delete from team_members where person_id = beto;
  if exists (select 1 from team_members where person_id = beto) then raise exception 'FALLO T4'; end if;

  raise exception 'OK: 0063 equipo DARF';
end $$;
