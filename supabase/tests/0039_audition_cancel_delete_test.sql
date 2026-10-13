-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0031–0039 aplicadas.

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_admin@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_fan1@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_dir@test.local'),
  ('00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_gestor@test.local');
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

create temp table ctx (vacia uuid, llena uuid, obra uuid, app uuid);
grant all on ctx to authenticated, anon;

do $$ declare v uuid; l uuid; o uuid; r json; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform panel_add_member('showman', 't_dir@test.local', 'direccion');
  insert into auditions (titulo) values ('Mal hecha') returning id into v;
  insert into auditions (titulo, estado) values ('Con inscritos', 'abierta') returning id into l;
  perform audition_add_member(v, 't_gestor@test.local', 'direccion');
  perform audition_add_member(l, 't_gestor@test.local', 'direccion');
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  insert into auditions (production_id, titulo, estado) values ('showman', 'De obra', 'abierta') returning id into o;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  r := audition_apply(l, jsonb_build_object('nombre', 'Ana', 'telefono', '55', 'fecha_nacimiento', '1995-01-01', 'consentimiento_datos', true));
  perform audition_apply(o, jsonb_build_object('nombre', 'Ana', 'telefono', '55', 'fecha_nacimiento', '1995-01-01', 'consentimiento_datos', true));
  insert into ctx values (v, l, o, (r->>'application_id')::uuid);
  reset role;
end $$;

-- T1: sin inscritos, el gestor propio la borra
do $$ declare n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d4');
  delete from auditions where id = (select vacia from ctx);
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALLO T1: no pudo borrar una convocatoria sin inscritos'; end if;
  reset role;
end $$;

-- T2: con inscritos, el gestor propio NO la borra (puede cancelarla); el Director sí
do $$ declare n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d4');
  begin
    delete from auditions where id = (select llena from ctx);
    raise exception 'FALLO T2: el gestor propio borró una con inscritos';
  exception when raise_exception then
    if sqlerrm not like 'Esta convocatoria ya tiene inscritos%' then raise exception 'FALLO T2a: %', sqlerrm; end if;
  end;
  update auditions set estado = 'cancelada' where id = (select llena from ctx);
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALLO T2b: no pudo cancelar'; end if;
  -- El inscrito sigue viendo la convocatoria (cancelada) y no puede volver a inscribirse
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  select count(*) into n from auditions where id = (select llena from ctx) and estado = 'cancelada';
  if n <> 1 then raise exception 'FALLO T2c: el inscrito no ve que se canceló'; end if;
  begin
    perform audition_apply((select llena from ctx), jsonb_build_object('nombre', 'Ana', 'telefono', '55', 'fecha_nacimiento', '1995-01-01', 'consentimiento_datos', true));
    raise exception 'FALLO T2: se inscribió en una cancelada';
  exception when raise_exception then
    if sqlerrm not like '%no está abierta%' then raise exception 'FALLO T2d: %', sqlerrm; end if;
  end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  delete from auditions where id = (select llena from ctx);
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALLO T2e: el Director no pudo borrar'; end if;
  reset role;
  select count(*) into n from audition_applications where id = (select app from ctx);
  if n <> 0 then raise exception 'FALLO T2f: quedaron inscripciones sueltas'; end if;
  select count(*) into n from audit_log where tabla = 'auditions' and accion = 'delete';
  if n < 2 then raise exception 'FALLO T2g: la bitácora no registró los borrados'; end if;
end $$;

-- T3: de obra con inscritos: la Dirección de la obra no la borra; quien da permisos (Director) sí. Un aspirante nunca.
do $$ declare n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  delete from auditions where id = (select obra from ctx);
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO T3: un aspirante borró una convocatoria'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  begin
    delete from auditions where id = (select obra from ctx);
    raise exception 'FALLO T3: Dirección de obra borró una con inscritos';
  exception when raise_exception then
    if sqlerrm not like '%quien da permisos en la obra%' then raise exception 'FALLO T3a: %', sqlerrm; end if;
  end;
  perform pg_temp.as_anon();
  select count(*) into n from auditions where id = (select obra from ctx);
  if n <> 1 then raise exception 'FALLO T3b: un visitante no ve la abierta'; end if;
  reset role;
end $$;

do $$ begin raise exception 'OK: 0039 pruebas T1–T3 (se aborta a propósito para no persistir)'; end $$;
