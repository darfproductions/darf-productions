-- Ejecutar SOLO en una transacción que termina abortada (no persiste nada).
-- Precede: 0001–0113 aplicadas.

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't113_admin@test.local'),
  ('00000000-0000-0000-0000-000000000d02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't113_fan@test.local');
update profiles set rol = 'admin' where id = '00000000-0000-0000-0000-000000000d01';

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

insert into productions (id, nombre, estado) values ('t113_obra', 'Obra 113', 'borrador'), ('t113_otra', 'Otra 113', 'borrador'), ('t113_tres', 'Tres 113', 'borrador');
insert into price_categories (production_id, nombre) values ('t113_obra', 'General');

-- T1: mapa libre con posiciones y diseño; repetidos y sin permiso, no.
do $$ declare z uuid; ok boolean; r jsonb; begin
  select id into z from price_categories where production_id = 't113_obra' and nombre = 'General';
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000d01');
  r := seat_map_disenar('t113_obra', '{"version": 1, "bloques": [{"id": "b1"}]}',
    jsonb_build_array(
      jsonb_build_object('fila', 'A', 'numero', 1, 'lado', 'central', 'etiqueta', 'A1', 'zona', z, 'x', 100, 'y', 200.5, 'seccion', 'Centro'),
      jsonb_build_object('fila', 'A', 'numero', 2, 'lado', 'central', 'etiqueta', 'A2', 'zona', z, 'x', 118, 'y', 200.5, 'seccion', 'Centro')));
  if (r->>'asientos')::int <> 2 then raise exception 'FALLO T1: %', r; end if;
  begin
    perform seat_map_disenar('t113_obra', '{}', jsonb_build_array(
      jsonb_build_object('fila', 'A', 'numero', 1, 'lado', 'central', 'etiqueta', 'A1', 'zona', z, 'x', 1, 'y', 1),
      jsonb_build_object('fila', 'A', 'numero', 1, 'lado', 'central', 'etiqueta', 'A1', 'zona', z, 'x', 2, 'y', 1)));
    ok := false;
  exception when others then ok := true; end;
  perform pg_temp.as_root();
  if not ok then raise exception 'FALLO T1: aceptó repetidos'; end if;
  if (select pos_y from seats where production_id = 't113_obra' and seat_label = 'A1') <> 200.5 then raise exception 'FALLO T1: posición'; end if;
  if (select diseno->'bloques'->0->>'id' from mapas_diseno where production_id = 't113_obra') <> 'b1' then raise exception 'FALLO T1: diseño'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000d02');
  begin perform seat_map_disenar('t113_obra', '{}', '[]'); ok := false; exception when others then ok := true; end;
  perform pg_temp.as_root();
  if not ok then raise exception 'FALLO T1: sin permiso'; end if;
end $$;

-- T2: copiar y teatros llevan posiciones y diseño; el mapa por filas lo limpia.
do $$ declare tid uuid; z uuid; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000d01');
  perform seat_map_copy('t113_obra', 't113_otra');
  tid := teatro_guardar('t113_obra', 'Foro 113');
  perform teatro_usar(tid, 't113_tres');
  perform pg_temp.as_root();
  if (select count(*) from seats where production_id = 't113_otra' and pos_x is not null) <> 2 then raise exception 'FALLO T2: copiar posiciones'; end if;
  if not exists (select 1 from mapas_diseno where production_id = 't113_otra') then raise exception 'FALLO T2: copiar diseño'; end if;
  if (select count(*) from seats where production_id = 't113_tres' and pos_x = 118) <> 1 then raise exception 'FALLO T2: teatro posiciones'; end if;
  if not exists (select 1 from mapas_diseno where production_id = 't113_tres') then raise exception 'FALLO T2: teatro diseño'; end if;
  select id into z from price_categories where production_id = 't113_tres' and nombre = 'General';
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000d01');
  perform seat_map_generate('t113_tres', jsonb_build_array(jsonb_build_object('fila', 'A', 'numero', 1, 'lado', 'central', 'etiqueta', 'A1', 'zona', z)));
  perform pg_temp.as_root();
  if exists (select 1 from mapas_diseno where production_id = 't113_tres') then raise exception 'FALLO T2: por filas limpia'; end if;
  if (select pos_x from seats where production_id = 't113_tres') is not null then raise exception 'FALLO T2: por filas sin posición'; end if;
end $$;

-- T3: una obra publicada (aunque le falte algo del kit) guarda su diseño sin tocar la fila de la obra.
alter table productions disable trigger productions_template_guard;
update productions set estado = 'publicada' where id = 't113_otra';
alter table productions enable trigger productions_template_guard;
do $$ declare z uuid; antes timestamptz; begin
  select id into z from price_categories where production_id = 't113_otra' and nombre = 'General';
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000d01');
  perform seat_map_disenar('t113_otra', '{"version": 1, "bloques": [{"id": "b9"}]}',
    jsonb_build_array(jsonb_build_object('fila', 'A', 'numero', 1, 'lado', 'central', 'etiqueta', 'A1', 'zona', z, 'x', 5, 'y', 5)));
  perform pg_temp.as_root();
  if (select diseno->'bloques'->0->>'id' from mapas_diseno where production_id = 't113_otra') <> 'b9' then raise exception 'FALLO T3'; end if;
end $$;

select 'TODO OK';
