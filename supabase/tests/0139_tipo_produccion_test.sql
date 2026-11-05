-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0139 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000139a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't139_editor@test.local'),
  ('00000000-0000-0000-0000-000000139a02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't139_otro@test.local');

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create or replace function pg_temp.reset() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

insert into productions (id, nombre, estado) values ('t139_obra', 'Obra 139', 'borrador');
insert into production_members (production_id, user_id, role_id) values ('t139_obra', '00000000-0000-0000-0000-000000139a01', 'productor');

do $$
declare ed text := '00000000-0000-0000-0000-000000139a01'; otro text := '00000000-0000-0000-0000-000000139a02'; ok boolean; n int;
begin
  -- T1: una obra nueva nace profesional y con boletería (nada cambia para las que ya existen).
  if (select tipo from productions where id = 't139_obra') <> 'profesional' then raise exception 'FALLO T1a'; end if;
  if not (select con_boleteria from productions where id = 't139_obra') then raise exception 'FALLO T1b'; end if;

  -- T2: solo los cuatro tipos.
  begin update productions set tipo = 'circo' where id = 't139_obra'; ok := false; exception when check_violation then ok := true; end;
  if not ok then raise exception 'FALLO T2'; end if;

  -- T3: quien edita la obra cambia el tipo y apaga la boletería; alguien ajeno no cambia nada.
  perform pg_temp.as_user(ed);
  update productions set tipo = 'escuela', con_boleteria = false where id = 't139_obra';
  get diagnostics n = row_count;
  perform pg_temp.reset();
  if n <> 1 then raise exception 'FALLO T3a'; end if;
  if (select tipo from productions where id = 't139_obra') <> 'escuela' or (select con_boleteria from productions where id = 't139_obra') then raise exception 'FALLO T3b'; end if;
  perform pg_temp.as_user(otro);
  update productions set tipo = 'taller' where id = 't139_obra';
  get diagnostics n = row_count;
  perform pg_temp.reset();
  if n <> 0 then raise exception 'FALLO T3c'; end if;

  raise notice '0139 OK';
end $$;
