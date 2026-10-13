-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0031–0046 aplicadas.

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_admin@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_rep@test.local'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_ens@test.local'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_fan@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_dir@test.local'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_maq@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-0000000000a1';

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create temp table ctx (aviso uuid, aviso_ens uuid);
grant all on ctx to authenticated, anon;

do $$ declare p1 uuid; p2 uuid; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform panel_add_member('showman', 't_dir@test.local', 'direccion');
  perform panel_add_member('showman', 't_maq@test.local', 'maquillaje');
  perform panel_add_member('showman', 't_rep@test.local', 'integrante');
  perform panel_add_member('showman', 't_ens@test.local', 'integrante');
  reset role;
  insert into people (nombre, profile_id) values ('Rep', '00000000-0000-0000-0000-0000000000c1') returning id into p1;
  insert into people (nombre, profile_id) values ('Ens', '00000000-0000-0000-0000-0000000000c2') returning id into p2;
  insert into production_credits (production_id, person_id, tipo, papel) values ('showman', p1, 'reparto', 'Barnum'), ('showman', p2, 'ensamble', null);
end $$;

-- T1: materiales por grupo; maquillaje (materiales.ver) ve todo; fuera nadie; archivos privados
do $$ declare n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  insert into materials (production_id, titulo, tipo, archivo_path) values ('showman', 'Libreto', 'libreto', 'showman/libreto.pdf');
  insert into materials (production_id, titulo, tipo, url, audiencia, grupos) values ('showman', 'Coreo ensamble', 'coreografia', 'https://youtu.be/x', 'grupos', '{ensamble}');
  insert into materials (production_id, titulo, tipo, archivo_path, audiencia, personas) values ('showman', 'Pista Barnum', 'pista', 'showman/barnum.mp3', 'personas', array['00000000-0000-0000-0000-0000000000c1'::uuid]);
  begin
    insert into materials (production_id, titulo, url) values ('showman', 'Mal', 'http://inseguro');
    raise exception 'FALLO T1: aceptó un enlace sin https';
  exception when check_violation then null;
  end;
  begin
    insert into materials (production_id, titulo, archivo_path) values ('showman', 'Ajeno', 'mm/x.pdf');
    raise exception 'FALLO T1: archivo en carpeta de otra obra';
  exception when check_violation then null;
  end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  select count(*) into n from materials;
  if n <> 2 then raise exception 'FALLO T1a: reparto ve % materiales (libreto y su pista)', n; end if;
  if not can_read_material_object('showman/barnum.mp3') then raise exception 'FALLO T1b: no abre su pista'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
  select count(*) into n from materials;
  if n <> 2 then raise exception 'FALLO T1c: ensamble ve % materiales (libreto y coreo)', n; end if;
  if can_read_material_object('showman/barnum.mp3') then raise exception 'FALLO T1d: ensamble abre la pista de Barnum'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
  select count(*) into n from materials;
  if n <> 3 then raise exception 'FALLO T1e: maquillaje ve % materiales', n; end if;
  begin
    insert into materials (production_id, titulo, url) values ('showman', 'X', 'https://x.y');
    raise exception 'FALLO T1: maquillaje subió material';
  exception when others then
    if sqlerrm not like '%row-level security%' then raise exception 'FALLO T1f: %', sqlerrm; end if;
  end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
  select count(*) into n from materials;
  if n <> 0 then raise exception 'FALLO T1g: alguien fuera ve materiales'; end if;
  if can_read_material_object('showman/libreto.pdf') then raise exception 'FALLO T1h: alguien fuera abre el libreto'; end if;
  reset role;
end $$;

-- T2: comunicados con lectura
do $$ declare a uuid; b uuid; n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  insert into announcements (production_id, titulo, cuerpo, importante) values ('showman', 'Ensayo general', 'Se recorre a las 5', true) returning id into a;
  insert into announcements (production_id, titulo, cuerpo, audiencia, grupos) values ('showman', 'Ensamble', 'Traer tenis', 'grupos', '{ensamble}') returning id into b;
  insert into ctx values (a, b);
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  select sin_leer into n from my_unread_announcements() where production_id = 'showman';
  if n <> 1 then raise exception 'FALLO T2a: reparto tiene % sin leer (esperado 1)', n; end if;
  insert into announcement_reads (announcement_id, user_id) values (a, auth.uid());
  begin
    insert into announcement_reads (announcement_id, user_id) values (b, auth.uid());
    raise exception 'FALLO T2: marcó leído un aviso que no era para él';
  exception when others then
    if sqlerrm not like '%row-level security%' then raise exception 'FALLO T2b: %', sqlerrm; end if;
  end;
  begin
    perform announcement_read_status(a);
    raise exception 'FALLO T2: un integrante vio quién leyó';
  exception when raise_exception then
    if sqlerrm not like 'No autorizado%' then raise exception 'FALLO T2c: %', sqlerrm; end if;
  end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  select count(*) into n from announcement_read_status(a) where leido_at is not null;
  if n <> 1 then raise exception 'FALLO T2d: % leídos', n; end if;
  select count(*) into n from announcement_read_status(a) where leido_at is null;
  if n <> 1 then raise exception 'FALLO T2e: % pendientes', n; end if;
  reset role;
end $$;

-- T3: quien se da de baja deja de recibir
do $$ declare n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  perform member_withdraw('showman', '00000000-0000-0000-0000-0000000000c2', null, 'Se fue');
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
  select count(*) into n from materials;
  if n <> 0 then raise exception 'FALLO T3a: con baja sigue viendo % materiales', n; end if;
  select count(*) into n from announcements;
  if n <> 0 then raise exception 'FALLO T3b: con baja sigue viendo avisos'; end if;
  reset role;
end $$;

do $$ begin raise exception 'OK: 0046 pruebas T1–T3 (se aborta a propósito para no persistir)'; end $$;
