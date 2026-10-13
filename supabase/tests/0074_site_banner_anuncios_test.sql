-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0074 aplicadas.

insert into auth.users (id, instance_id, aud, role, email)
values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_admin@test.local'),
       ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_fan@test.local'),
       ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_fan2@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-0000000000e1';

create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create or replace function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
end $$;
create or replace function pg_temp.as_root() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

create temp table ctx (k text primary key, v uuid);
grant all on ctx to public;

-- T1: franja del sitio: el Director la guarda; un fan no; todos la leen.
do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
  perform panel_set_site_banner('fija', '#d7bb5f', true, '[{"texto":"Preventa Showman","enlace":"/fan-zone","boton":"Ver"},{"texto":"   "}]');
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
  begin
    perform panel_set_site_banner('corre', null, true, '[]');
    raise exception 'FALLO T1: un fan editó la franja del sitio';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  perform pg_temp.as_anon();
  if (select count(*) from site_banner_items) <> 1 then raise exception 'FALLO T1: avisos de la franja (%)', (select count(*) from site_banner_items); end if;
  if (select estilo from site_banner) <> 'fija' then raise exception 'FALLO T1: estilo'; end if;
  perform pg_temp.as_root();
end $$;

-- T2: anuncio con revelación: antes de la fecha no se entrega el contenido.
do $$ declare a uuid; b uuid; r record; begin
  insert into anuncios (lugar, production_id, tipo, titulo, adelanto, contenido, enlace, boton, revela_at, registro, publicado)
  values ('obra', 'showman', 'elenco', 'Revelación del elenco', 'Muy pronto', 'Protagonista: Ana', '/producciones/showman', 'Ver', now() + interval '2 days', true, true)
  returning id into a;
  insert into anuncios (lugar, tipo, titulo, contenido, publicado) values ('inicio', 'general', 'Hola', 'Bienvenidos', true) returning id into b;
  insert into anuncios (lugar, tipo, titulo, contenido, publicado) values ('inicio', 'general', 'Borrador', 'x', false);
  insert into ctx values ('a', a), ('b', b);

  perform pg_temp.as_anon();
  select * into r from anuncios_publicos('obra', 'showman') where id = a;
  if r.contenido is not null or r.enlace is not null or not r.bloqueado or r.revelado then raise exception 'FALLO T2: entregó el contenido antes de tiempo'; end if;
  if r.adelanto <> 'Muy pronto' then raise exception 'FALLO T2: adelanto'; end if;
  if (select count(*) from anuncios_publicos('inicio')) <> 1 then raise exception 'FALLO T2: mostró el borrador'; end if;
  if (select contenido from anuncios_publicos('inicio')) <> 'Bienvenidos' then raise exception 'FALLO T2: contenido revelado'; end if;
  -- El público no lee la tabla directamente.
  if (select count(*) from anuncios) <> 0 then raise exception 'FALLO T2: anon leyó la tabla'; end if;
  perform pg_temp.as_root();
end $$;

-- T3: "Avísame" y aviso al revelarse (una sola vez).
do $$ declare a uuid := (select v from ctx where k = 'a'); n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
  perform anuncio_registro(a, true);
  perform anuncio_registro(a, true);
  if not (select apuntado from anuncios_publicos('obra', 'showman') where id = a) then raise exception 'FALLO T3: no quedó apuntado'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e3');
  perform anuncio_registro(a, true);
  perform anuncio_registro(a, false);
  perform pg_temp.as_anon();
  begin
    perform anuncio_registro(a, true);
    raise exception 'FALLO T3: anon se apuntó';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  perform pg_temp.as_root();

  perform notify_anuncios();
  if (select count(*) from notifications where tipo = 'anuncio') <> 0 then raise exception 'FALLO T3: avisó antes de tiempo'; end if;
  update anuncios set revela_at = now() - interval '1 minute' where id = a;
  perform notify_anuncios();
  perform notify_anuncios();
  select count(*) into n from notifications where tipo = 'anuncio';
  if n <> 1 then raise exception 'FALLO T3: avisos (% en vez de 1)', n; end if;
  if (select user_id from notifications where tipo = 'anuncio') <> '00000000-0000-0000-0000-0000000000e2' then raise exception 'FALLO T3: avisó a quien se quitó'; end if;
  if (select href from notifications where tipo = 'anuncio') <> '/producciones/showman' then raise exception 'FALLO T3: liga'; end if;

  -- Ya revelado: se entrega el contenido y no acepta registros nuevos.
  perform pg_temp.as_anon();
  if (select contenido from anuncios_publicos('obra', 'showman') where id = a) <> 'Protagonista: Ana' then raise exception 'FALLO T3: no reveló'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e3');
  begin
    perform anuncio_registro(a, true);
    raise exception 'FALLO T3: se apuntó después de revelarse';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  perform pg_temp.as_root();
end $$;

-- T4: solo Club Fan: sin ser socio, el contenido queda bloqueado aunque ya se haya revelado.
do $$ declare c uuid; begin
  insert into anuncios (lugar, tipo, titulo, contenido, solo_club, publicado) values ('fanzone', 'general', 'Secreto', 'Solo socios', true, true) returning id into c;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
  if (select contenido from anuncios_publicos('fanzone') where id = c) is not null then raise exception 'FALLO T4: entregó contenido del club'; end if;
  perform pg_temp.as_root();
end $$;

-- T5: permisos de edición: un fan no crea anuncios; el Director sí.
do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
  begin
    insert into anuncios (lugar, tipo, titulo, publicado) values ('inicio', 'general', 'Hack', true);
    raise exception 'FALLO T5: un fan creó un anuncio';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
  insert into anuncios (lugar, tipo, titulo, publicado) values ('inicio', 'fechas', 'Nuevas fechas', true);
  perform pg_temp.as_root();
end $$;

-- T6: los tipos nuevos se pueden apagar en el teléfono.
do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
  perform push_set_off(array['anuncio', 'fanzone', 'inventado']);
  perform pg_temp.as_root();
  if (select apagados from push_prefs where user_id = '00000000-0000-0000-0000-0000000000e2') <> array['anuncio', 'fanzone'] then raise exception 'FALLO T6: tipos apagados'; end if;
end $$;

do $$ begin raise exception 'OK: TODAS LAS PRUEBAS PASARON (0074)'; end $$;
