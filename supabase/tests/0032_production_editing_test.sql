-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0029–0032 aplicadas y el contenido de DEV cargado (seed 0029).

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_admin@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_fan1@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_cont@test.local'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_dir@test.local'),
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_taq@test.local'),
  ('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't_prod@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-0000000000a1';

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- Obra borrador nueva (creada por el Director) y equipo:
-- b1 Contenido en t_new, b2 Dirección artística en t_new, b3 Taquilla en showman, b4 Producción en t_new.
do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  insert into productions (id, nombre) values ('t_new', 'Obra nueva');
  perform panel_add_member('t_new', 't_cont@test.local', 'contenido');
  perform panel_add_member('t_new', 't_dir@test.local', 'direccion');
  perform panel_add_member('showman', 't_taq@test.local', 'taquilla');
  perform panel_add_member('t_new', 't_prod@test.local', (select coalesce(max(id), 'productor') from panel_roles where id = 'direccion_general'));
  reset role;
end $$;

-- T1: el equipo ve el borrador; un fan no
do $$ declare n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
  select count(*) into n from productions where id = 't_new';
  if n <> 1 then raise exception 'FALLO T1: contenido no ve su borrador'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  select count(*) into n from productions where id = 't_new';
  if n <> 0 then raise exception 'FALLO T1: fan ve borrador'; end if;
  reset role;
end $$;

-- T2: Contenido edita textos y kit, pero no venta ni estado; no toca otras obras
do $$ declare n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
  update productions set frase = 'Nueva frase', color_fondo = '#101820' where id = 't_new';
  if (select frase from productions where id = 't_new') <> 'Nueva frase' then raise exception 'FALLO T2: no guardó'; end if;
  begin
    update productions set price = 1 where id = 't_new';
    raise exception 'FALLO T2: cambió precio';
  exception when raise_exception then
    if sqlerrm not like 'Solo taquilla%' then raise exception 'FALLO T2b: %', sqlerrm; end if;
  end;
  begin
    update productions set estado = 'oculta' where id = 't_new';
    raise exception 'FALLO T2: cambió estado';
  exception when raise_exception then
    if sqlerrm not like 'No tienes permiso para publicar%' then raise exception 'FALLO T2c: %', sqlerrm; end if;
  end;
  update productions set frase = 'hack' where id = 'mm';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO T2: editó otra obra'; end if;
  reset role;
end $$;

-- T3: Taquilla pone en venta su obra pero no edita textos
do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b3');
  update productions set price = 260 where id = 'showman';
  if (select price from productions where id = 'showman') <> 260 then raise exception 'FALLO T3: no cambió precio'; end if;
  begin
    update productions set frase = 'hack' where id = 'showman';
    raise exception 'FALLO T3: taquilla editó textos';
  exception when raise_exception then
    if sqlerrm not like 'No tienes permiso para editar%' then raise exception 'FALLO T3b: %', sqlerrm; end if;
  end;
  reset role;
end $$;

-- T4: Producción publica cuando el kit está completo
do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b4');
  begin
    update productions set estado = 'publicada' where id = 't_new';
    raise exception 'FALLO T4: publicó sin kit';
  exception when raise_exception then
    if sqlerrm not like 'No se puede publicar%' then raise exception 'FALLO T4: %', sqlerrm; end if;
  end;
  update productions set logo_path = 't_new/kit/logo.webp', ambiente_path = 't_new/kit/amb.jpg',
    color_fondo = '#08101f', color_superficie = '#0f1c36', color_texto = '#f7eedb', color_acento = '#e8be45' where id = 't_new';
  update productions set estado = 'publicada' where id = 't_new';
  if (select estado from productions where id = 't_new') <> 'publicada' then raise exception 'FALLO T4b'; end if;
  reset role;
end $$;

-- T5: Contenido agrega canciones y agradecimientos en su obra, no en otra
do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
  insert into production_songs (production_id, titulo, orden) values ('t_new', 'Obertura', 1);
  insert into production_thanks (production_id, texto) values ('t_new', 'Gracias');
  begin
    insert into production_songs (production_id, titulo) values ('mm', 'hack');
    raise exception 'FALLO T5: escribió en otra obra';
  exception when others then
    if sqlerrm not like '%row-level security%' then raise exception 'FALLO T5b: %', sqlerrm; end if;
  end;
  begin
    insert into production_media (production_id, tipo, titulo, youtube_id, visibilidad) values ('t_new', 'video', 'v', 'abcdefghijk', 'publico');
  exception when others then raise exception 'FALLO T5c: contenido no agrega video: %', sqlerrm;
  end;
  reset role;
end $$;

-- T6: Dirección artística da de alta personas y créditos, sin tocar textos; un fan no
do $$ declare pid uuid; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
  insert into people (nombre) values ('Persona Nueva') returning id into pid;
  insert into production_credits (production_id, person_id, tipo, papel, foto_path) values ('t_new', pid, 'reparto', 'Brady', 't_new/creditos/p.jpg');
  begin
    insert into production_thanks (production_id, texto) values ('t_new', 'hack');
    raise exception 'FALLO T6: dirección escribió agradecimientos';
  exception when others then
    if sqlerrm not like '%row-level security%' then raise exception 'FALLO T6b: %', sqlerrm; end if;
  end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
  begin
    insert into people (nombre) values ('Hack');
    raise exception 'FALLO T6: fan creó persona';
  exception when others then
    if sqlerrm not like '%row-level security%' then raise exception 'FALLO T6c: %', sqlerrm; end if;
  end;
  reset role;
end $$;

-- T7: archivos solo en la carpeta de su obra y su sección
do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
  insert into storage.objects (bucket_id, name, owner) values ('producciones', 't_new/kit/logo2.webp', '00000000-0000-0000-0000-0000000000b1');
  begin
    insert into storage.objects (bucket_id, name, owner) values ('producciones', 'mm/kit/hack.webp', '00000000-0000-0000-0000-0000000000b1');
    raise exception 'FALLO T7: subió a otra obra';
  exception when others then
    if sqlerrm not like '%row-level security%' then raise exception 'FALLO T7b: %', sqlerrm; end if;
  end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
  insert into storage.objects (bucket_id, name, owner) values ('producciones', 't_new/creditos/foto.jpg', '00000000-0000-0000-0000-0000000000b2');
  begin
    insert into storage.objects (bucket_id, name, owner) values ('producciones', 't_new/kit/hack.webp', '00000000-0000-0000-0000-0000000000b2');
    raise exception 'FALLO T7: dirección subió al kit';
  exception when others then
    if sqlerrm not like '%row-level security%' then raise exception 'FALLO T7c: %', sqlerrm; end if;
  end;
  reset role;
end $$;

-- T8: duplicar (solo Director) e identificador válido
do $$ declare n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b4');
  begin
    perform panel_duplicate_production('mm', 'mm-2027', 'Mamma Mia 2027', '2027');
    raise exception 'FALLO T8: productora duplicó';
  exception when raise_exception then
    if sqlerrm not like 'Solo el Director%' and sqlerrm not like 'Solo Casa DARF%' then raise exception 'FALLO T8: %', sqlerrm; end if;
  end;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  perform panel_duplicate_production('mm', 'mm-2027', 'Mamma Mia 2027', '2027', true, true, false);
  select count(*) into n from production_songs where production_id = 'mm-2027';
  if n <> 23 then raise exception 'FALLO T8: copió % canciones', n; end if;
  select count(*) into n from production_credits where production_id = 'mm-2027';
  if n <> 21 then raise exception 'FALLO T8: copió % créditos de equipo', n; end if;
  if (select estado from productions where id = 'mm-2027') <> 'borrador' then raise exception 'FALLO T8: no quedó en borrador'; end if;
  begin
    insert into productions (id, nombre) values ('Mala Obra', 'X');
    raise exception 'FALLO T8: aceptó id inválido';
  exception when raise_exception then
    if sqlerrm not like 'El identificador%' then raise exception 'FALLO T8b: %', sqlerrm; end if;
  end;
  reset role;
end $$;

do $$ begin raise exception 'OK: 0032 pruebas T1–T8 (se aborta a propósito para no persistir)'; end $$;
