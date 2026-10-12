-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0031–0066 aplicadas.

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_admin@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_prod@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_maestro@test.local'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_staff@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_global@test.local');
update profiles set rol = 'admin', nombre = 'Diego' where id = '00000000-0000-0000-0000-0000000000a1';
update profiles set rol = 'staff' where id = '00000000-0000-0000-0000-0000000000c1';
update profiles set nombre = 'Mara' where id = '00000000-0000-0000-0000-0000000000d1';
update profiles set nombre = 'Sam' where id = '00000000-0000-0000-0000-0000000000d2';

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
create or replace function pg_temp.notifs(uid text, t text) returns int language sql as $$
  select count(*)::int from notifications where user_id = uid::uuid and tipo = t
$$;

do $$ declare mat uuid; mat2 uuid; n int; perf uuid; nid bigint; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform panel_add_member('showman', 't_prod@test.local', 'productor');
  perform panel_add_member('showman', 't_maestro@test.local', 'maestro');
  perform panel_add_member('showman', 't_staff@test.local', 'staff');
  perform set_config('role', 'postgres', true);
  delete from notifications;

  -- A1: el maestro sube su material; avisa al equipo y a quien lo maneja, no a él
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  insert into team_materials (production_id, titulo, url, created_by) values ('showman', 'Plan de canto', 'https://x.example', auth.uid()) returning id into mat;
  perform set_config('role', 'postgres', true);
  if pg_temp.notifs('00000000-0000-0000-0000-0000000000d2', 'equipo') <> 1 or pg_temp.notifs('00000000-0000-0000-0000-0000000000b1', 'equipo') <> 1
     or pg_temp.notifs('00000000-0000-0000-0000-0000000000a1', 'equipo') <> 1 then raise exception 'FALLO A1a: reparto del material'; end if;
  if pg_temp.notifs('00000000-0000-0000-0000-0000000000d1', 'equipo') <> 0 then raise exception 'FALLO A1b: se notificó a sí mismo'; end if;

  -- A2: staff comenta; le llega al autor
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
  insert into team_comments (material_id, cuerpo) values (mat, 'Gracias, lo reviso');
  perform set_config('role', 'postgres', true);
  if pg_temp.notifs('00000000-0000-0000-0000-0000000000d1', 'equipo') <> 1 then raise exception 'FALLO A2: el autor no supo del comentario'; end if;

  -- A3: cada quien borra lo suyo, no lo ajeno; Producción sí borra lo de otros
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
  insert into team_materials (production_id, titulo, url) values ('showman', 'Rider', 'https://y.example') returning id into mat2;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  delete from team_materials where id = mat2;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO A3a: borró material ajeno'; end if;
  begin insert into team_comments (material_id, cuerpo, autor) values (mat, 'suplanto', '00000000-0000-0000-0000-0000000000d2'); raise exception 'FALLO A3b';
  exception when insufficient_privilege then null; end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
  delete from team_materials where id = mat;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALLO A3c: Producción no pudo borrar'; end if;
  begin perform team_roster_public('hsm'); raise exception 'FALLO A3d';
  exception when raise_exception then if sqlerrm not like '%No autorizado%' then raise; end if; end;

  -- C: destacar en portada
  perform set_featured('showman');
  if not (select destacada from productions where id = 'showman') then raise exception 'FALLO C1'; end if;
  begin update productions set destacada = false where id = 'showman'; raise exception 'FALLO C2: cambió destacada directo';
  exception when raise_exception then if sqlerrm not like '%Destacar en portada%' then raise; end if; end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
  begin perform set_featured(null); raise exception 'FALLO C3';
  exception when raise_exception then if sqlerrm not like '%No autorizado%' then raise; end if; end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
  perform set_featured(null);
  if (select count(*) from productions where destacada) <> 0 then raise exception 'FALLO C4'; end if;

  -- D1: contacto → staff global y Director, no Producción
  perform pg_temp.as_anon();
  insert into contact_messages (nombre, correo, mensaje) values ('Público', 'p@x.mx', 'Hola');
  perform set_config('role', 'postgres', true);
  if pg_temp.notifs('00000000-0000-0000-0000-0000000000a1', 'contacto') <> 1 or pg_temp.notifs('00000000-0000-0000-0000-0000000000c1', 'contacto') <> 1 then raise exception 'FALLO D1a'; end if;
  if pg_temp.notifs('00000000-0000-0000-0000-0000000000b1', 'contacto') <> 0 then raise exception 'FALLO D1b'; end if;

  -- D2: orden pendiente → quien opera ventas (Producción) y Director
  insert into performances (production_id, starts_at, on_sale) values ('showman', now() + interval '5 days', true) returning id into perf;
  insert into orders (order_code, performance_id, buyer_nombre, buyer_telefono, total) values ('DARF-TEST1', perf, 'Ana', '55', 100);
  if pg_temp.notifs('00000000-0000-0000-0000-0000000000b1', 'orden') <> 1 or pg_temp.notifs('00000000-0000-0000-0000-0000000000d1', 'orden') <> 0 then raise exception 'FALLO D2'; end if;

  -- D3: cambio de permisos de Producción → al Director, no a quien lo hizo
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
  perform panel_add_member('showman', 't_global@test.local', 'puerta');
  perform set_config('role', 'postgres', true);
  if pg_temp.notifs('00000000-0000-0000-0000-0000000000a1', 'cambio') < 1 then raise exception 'FALLO D3a'; end if;
  if exists (select 1 from notifications where user_id = '00000000-0000-0000-0000-0000000000b1' and actor = '00000000-0000-0000-0000-0000000000b1') then raise exception 'FALLO D3b'; end if;

  -- D4: cada quien lee, marca y borra solo lo suyo; nadie inserta a mano
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
  if (select count(*) from notifications where user_id <> auth.uid()) <> 0 then raise exception 'FALLO D4a: ve ajenas'; end if;
  select id into nid from notifications limit 1;
  update notifications set read_at = now() where id = nid;
  if (select read_at from notifications where id = nid) is null then raise exception 'FALLO D4b'; end if;
  if notifications_unread_count() <> (select count(*) from notifications where read_at is null) then raise exception 'FALLO D4c'; end if;
  begin update notifications set titulo = 'x' where id = nid; raise exception 'FALLO D4d: cambió el título';
  exception when insufficient_privilege then null; end;
  begin insert into notifications (user_id, tipo, titulo) values (auth.uid(), 'x', 'x'); raise exception 'FALLO D4e';
  exception when insufficient_privilege then null; end;
  delete from notifications where id = nid;
  perform set_config('role', 'postgres', true);
  if exists (select 1 from notifications where id = nid) then raise exception 'FALLO D4f: no se borró'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
  update notifications set read_at = now() where user_id = '00000000-0000-0000-0000-0000000000a1';
  perform set_config('role', 'postgres', true);
  if exists (select 1 from notifications where user_id = '00000000-0000-0000-0000-0000000000a1' and read_at is not null) then raise exception 'FALLO D4g: marcó ajenas'; end if;

  raise exception 'OK: 0066 colaboración, destacada y notificaciones';
end $$;
