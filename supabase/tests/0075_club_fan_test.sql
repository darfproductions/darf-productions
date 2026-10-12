-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0075 aplicadas.

insert into auth.users (id, instance_id, aud, role, email)
values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_socio@test.local'),
       ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_nosocio@test.local'),
       ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_socio2@test.local');

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

create temp table ctx (k text primary key, v uuid);
grant all on ctx to public;

-- T1: unirse da número consecutivo, es idempotente y marca fundador.
do $$ declare j json; j2 json; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
  if fan_me() is not null then raise exception 'FALLO T1: socio sin unirse'; end if;
  j := fan_join();
  j2 := fan_join();
  if (j->>'numero') <> (j2->>'numero') then raise exception 'FALLO T1: cambió el número al repetir'; end if;
  if not (j->>'fundador')::boolean then raise exception 'FALLO T1: debería ser fundador'; end if;
  if not is_fan_member() then raise exception 'FALLO T1: no quedó como socio'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000f3');
  j2 := fan_join();
  if (j2->>'numero')::int <= (j->>'numero')::int then raise exception 'FALLO T1: número no consecutivo'; end if;
  perform pg_temp.as_root();
end $$;

-- T2: contenidos solo para socios y bloqueados por fecha.
do $$ declare hoy uuid; despues uuid; n int; begin
  insert into fanzone_items (production_id, tipo, titulo, youtube_id, categoria) values ('showman', 'video', 'Ensayo general', 'abcdefghijk', 'ensayo') returning id into hoy;
  insert into fanzone_items (production_id, tipo, titulo, youtube_id, categoria, disponible_desde) values ('showman', 'video', 'Revelación', 'bbcdefghijk', 'making', now() + interval '3 days') returning id into despues;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
  if (select count(*) from fanzone_items where id in (hoy, despues)) <> 0 then raise exception 'FALLO T2: un no socio vio contenidos'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
  if not exists (select 1 from fanzone_items where id = hoy) then raise exception 'FALLO T2: el socio no ve el contenido'; end if;
  if exists (select 1 from fanzone_items where id = despues) then raise exception 'FALLO T2: entregó contenido bloqueado'; end if;
  select count(*) into n from fanzone_proximos('showman') where id = despues;
  if n <> 1 then raise exception 'FALLO T2: no aparece en lo que viene'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
  if (select count(*) from fanzone_proximos('showman')) <> 0 then raise exception 'FALLO T2: lo que viene a no socio'; end if;
  perform pg_temp.as_root();
  update fanzone_items set disponible_desde = now() - interval '1 minute' where id = despues;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
  if not exists (select 1 from fanzone_items where id = despues) then raise exception 'FALLO T2: no se desbloqueó'; end if;
  perform pg_temp.as_root();
end $$;

-- T3: anuncios solo Club Fan: el socio sí ve el contenido.
do $$ declare c uuid; begin
  insert into anuncios (lugar, tipo, titulo, contenido, solo_club, publicado) values ('fanzone', 'general', 'Secreto', 'Solo socios', true, true) returning id into c;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
  if (select contenido from anuncios_publicos('fanzone') where id = c) is distinct from 'Solo socios' then raise exception 'FALLO T3: el socio no ve el contenido del club'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
  if (select contenido from anuncios_publicos('fanzone') where id = c) is not null then raise exception 'FALLO T3: el no socio lo ve'; end if;
  perform pg_temp.as_root();
end $$;

-- T4: foto con el elenco: socio + boleto aprobado, cupo y cancelar.
do $$ declare pf uuid; e uuid; begin
  insert into performances (production_id, starts_at, on_sale) values ('showman', now() + interval '10 days', true) returning id into pf;
  insert into fan_encuentros (production_id, performance_id, cupo) values ('showman', pf, 1) returning id into e;
  insert into ctx values ('e', e), ('pf', pf);

  -- Sin boleto: no.
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
  begin
    perform fan_encuentro_apartar(e, true);
    raise exception 'FALLO T4: apartó sin boleto';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if;
  end;
  perform pg_temp.as_root();
  insert into orders (performance_id, buyer_nombre, buyer_telefono, buyer_user_id, total, status) values (pf, 'Ana', '55', '00000000-0000-0000-0000-0000000000f1', 100, 'aprobado');
  insert into orders (performance_id, buyer_nombre, buyer_telefono, buyer_user_id, total, status) values (pf, 'Beto', '55', '00000000-0000-0000-0000-0000000000f3', 100, 'aprobado');
  insert into orders (performance_id, buyer_nombre, buyer_telefono, buyer_user_id, total, status) values (pf, 'No socio', '55', '00000000-0000-0000-0000-0000000000f2', 100, 'aprobado');

  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
  perform fan_encuentro_apartar(e, true);
  perform fan_encuentro_apartar(e, true);
  if (select libres from fan_encuentros_lista('showman') where id = e) <> 0 then raise exception 'FALLO T4: libres'; end if;
  if not (select apartado from fan_encuentros_lista('showman') where id = e) then raise exception 'FALLO T4: apartado'; end if;

  -- Cupo lleno.
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000f3');
  begin
    perform fan_encuentro_apartar(e, true);
    raise exception 'FALLO T4: pasó el cupo';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if;
  end;
  -- No socio, aunque tenga boleto.
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
  begin
    perform fan_encuentro_apartar(e, true);
    raise exception 'FALLO T4: apartó sin ser socio';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if;
  end;
  if (select count(*) from fan_encuentros_lista(null)) <> 0 then raise exception 'FALLO T4: lista a no socio'; end if;

  -- Cancelar libera el lugar.
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
  perform fan_encuentro_apartar(e, false);
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000f3');
  perform fan_encuentro_apartar(e, true);
  -- Un fan no ve la lista de personas.
  if (select count(*) from fan_encuentro_personas(e)) <> 0 then raise exception 'FALLO T4: fan vio la lista'; end if;
  perform pg_temp.as_root();
end $$;

do $$ begin raise exception 'OK: TODAS LAS PRUEBAS PASARON (0075)'; end $$;
