-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV" (la base de darfproductions.com).
-- 0113: mapa de asientos libre (posición de cada asiento y diseño del mapa por obra).
-- Se puede correr más de una vez. Si la base no es DEV, aborta.
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
  if to_regclass('public.teatros') is null then
    raise exception 'ABORTADO: primero corre apply_0112_dev.sql.';
  end if;
end $$;
begin;

alter table seats add column if not exists pos_x real;
alter table seats add column if not exists pos_y real;
alter table teatros add column if not exists diseno jsonb;

create table if not exists mapas_diseno (
  production_id text primary key references productions(id) on delete cascade,
  diseno jsonb not null,
  updated_at timestamptz not null default now()
);
alter table mapas_diseno enable row level security;
-- El dibujo (escenario y bloques) no tiene datos de nadie: lo ve quien ve el mapa. Solo se escribe con las funciones.
drop policy if exists mapas_diseno_select on mapas_diseno;
create policy mapas_diseno_select on mapas_diseno for select using (true);
grant select on mapas_diseno to anon, authenticated;

-- Poner (o quitar, con null) el diseño de una obra. Solo la usan las funciones de abajo.
create or replace function mapa_diseno_poner(pid text, d jsonb) returns void
language sql security definer set search_path = public as $$
  delete from mapas_diseno where production_id = pid and d is null;
  insert into mapas_diseno (production_id, diseno) select pid, d where d is not null
    on conflict (production_id) do update set diseno = excluded.diseno, updated_at = now();
$$;
revoke all on function mapa_diseno_poner(text, jsonb) from public, anon, authenticated;

-- Escribir el mapa (0062) ahora con posición opcional.
create or replace function seat_map_write(pid text, lista jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare n int; it jsonb; z uuid;
begin
  if jsonb_typeof(lista) <> 'array' then raise exception 'Mapa no válido.'; end if;
  n := jsonb_array_length(lista);
  if n < 1 then raise exception 'El mapa no tiene asientos.'; end if;
  if n > 2000 then raise exception 'Máximo 2000 asientos por obra.'; end if;

  perform 1 from seats where production_id = pid for update;
  if seat_map_has_tickets(pid) then
    raise exception 'Esta obra ya tiene boletos con asiento: el mapa ya no se puede regenerar, solo ajustar asiento por asiento.';
  end if;

  for it in select * from jsonb_array_elements(lista) loop
    if coalesce(btrim(it->>'fila'), '') = '' or length(it->>'fila') > 5 then raise exception 'Fila no válida.'; end if;
    if coalesce(btrim(it->>'etiqueta'), '') = '' or length(it->>'etiqueta') > 40 then raise exception 'Etiqueta no válida.'; end if;
    if (it->>'lado') is null or (it->>'lado') not in ('izquierda', 'central', 'derecha') then raise exception 'Bloque no válido.'; end if;
    if coalesce(it->>'numero', '') !~ '^[0-9]{1,4}$' or (it->>'numero')::int < 1 then raise exception 'Número de asiento no válido.'; end if;
    if (it ? 'x') and (jsonb_typeof(it->'x') <> 'number' or jsonb_typeof(it->'y') <> 'number'
                       or (it->>'x')::numeric not between -1 and 10000 or (it->>'y')::numeric not between -1 and 10000) then
      raise exception 'Posición de asiento no válida.';
    end if;
    if length(coalesce(it->>'seccion', '')) > 40 then raise exception 'Nombre de bloque demasiado largo.'; end if;
    z := nullif(it->>'zona', '')::uuid;
    if z is null or not exists (select 1 from price_categories where id = z and production_id = pid and cupo is null) then
      raise exception 'Cada asiento necesita una zona con asiento de esta obra.';
    end if;
  end loop;
  if (select count(distinct e->>'etiqueta') from jsonb_array_elements(lista) e) <> n then
    raise exception 'Hay asientos repetidos (misma fila y número).';
  end if;

  delete from seats where production_id = pid;
  insert into seats (production_id, section, seat_row, seat_number, seat_label, lado, price_category_id, is_active, pos_x, pos_y)
  select pid, nullif(btrim(e->>'seccion'), ''), btrim(e->>'fila'), (e->>'numero')::int, btrim(e->>'etiqueta'),
         e->>'lado', (e->>'zona')::uuid, coalesce((e->>'activo')::boolean, true),
         (e->>'x')::real, (e->>'y')::real
    from jsonb_array_elements(lista) e;
  return n;
end $$;

-- El mapa por filas no tiene dibujo libre.
create or replace function seat_map_generate(pid text, lista jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not has_perm(pid, 'funciones.gestionar') then raise exception 'No autorizado'; end if;
  n := seat_map_write(pid, lista);
  perform mapa_diseno_poner(pid, null);
  insert into audit_log (tabla, accion, production_id, despues) values ('seats', 'mapa', pid, jsonb_build_object('asientos', n));
  return jsonb_build_object('asientos', n);
end $$;

-- Mapa libre: el diseño (para volver a editarlo) y sus asientos con posición.
create or replace function seat_map_disenar(pid text, p_diseno jsonb, lista jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not has_perm(pid, 'funciones.gestionar') then raise exception 'No autorizado'; end if;
  if jsonb_typeof(p_diseno) <> 'object' or length(p_diseno::text) > 200000 then raise exception 'Diseño no válido.'; end if;
  if exists (select 1 from jsonb_array_elements(lista) e where not (e ? 'x')) then raise exception 'Faltan posiciones.'; end if;
  n := seat_map_write(pid, lista);
  perform mapa_diseno_poner(pid, p_diseno);
  insert into audit_log (tabla, accion, production_id, despues) values ('seats', 'mapa_libre', pid, jsonb_build_object('asientos', n));
  return jsonb_build_object('asientos', n);
end $$;
revoke all on function seat_map_disenar(text, jsonb, jsonb) from public, anon;
grant execute on function seat_map_disenar(text, jsonb, jsonb) to authenticated;

-- Copiar de otra obra y teatros guardados: también posiciones y diseño.
do $$
declare def text;
begin
  def := pg_get_functiondef('public.seat_map_copy(text, text)'::regprocedure);
  if position('''x'', s.pos_x' in def) = 0 then
    def := replace(def, $q$'etiqueta', s.seat_label, 'activo', s.is_active,$q$,
                        $q$'etiqueta', s.seat_label, 'activo', s.is_active, 'x', s.pos_x, 'y', s.pos_y,$q$);
    def := replace(def, $q$  n := seat_map_write(destino, coalesce(lista, '[]'));$q$,
                        $q$  -- Sin posición, quitar las llaves vacías (los mapas por filas no tienen dibujo).
  select jsonb_agg(case when e->'x' = 'null'::jsonb then e - 'x' - 'y' else e end) into lista from jsonb_array_elements(lista) e;
  n := seat_map_write(destino, coalesce(lista, '[]'));
  perform mapa_diseno_poner(destino, (select diseno from mapas_diseno where production_id = origen));$q$);
    execute def;
  end if;

  def := pg_get_functiondef('public.teatro_guardar(text, text)'::regprocedure);
  if position('''x'', s.pos_x' in def) = 0 then
    def := replace(def, $q$'etiqueta', s.seat_label, 'activo', s.is_active, 'zona', pc.nombre)$q$,
                        $q$'etiqueta', s.seat_label, 'activo', s.is_active, 'zona', pc.nombre, 'x', s.pos_x, 'y', s.pos_y)$q$);
    def := replace(def, $q$insert into teatros (nombre, asientos, zonas, total, creado_por) values (btrim(p_nombre), v_asientos, v_zonas, n, auth.uid()) returning id into tid;$q$,
                        $q$insert into teatros (nombre, asientos, zonas, total, creado_por, diseno)
    values (btrim(p_nombre), v_asientos, v_zonas, n, auth.uid(), (select diseno from mapas_diseno where production_id = pid)) returning id into tid;$q$);
    def := replace(def, $q$update teatros set asientos = v_asientos, zonas = v_zonas, total = n, creado_por = auth.uid(), created_at = now() where id = tid;$q$,
                        $q$update teatros set asientos = v_asientos, zonas = v_zonas, total = n, creado_por = auth.uid(), created_at = now(),
                       diseno = (select diseno from mapas_diseno where production_id = pid) where id = tid;$q$);
    execute def;
  end if;

  def := pg_get_functiondef('public.teatro_usar(uuid, text)'::regprocedure);
  if position('mapa_diseno_poner' in def) = 0 then
    def := replace(def, $q$  select jsonb_agg(a - 'zona' || jsonb_build_object('zona',$q$,
                        $q$  select jsonb_agg((case when a->'x' = 'null'::jsonb or not (a ? 'x') then a - 'x' - 'y' else a end) - 'zona' || jsonb_build_object('zona',$q$);
    def := replace(def, $q$  n := seat_map_write(destino, coalesce(lista, '[]'));$q$,
                        $q$  n := seat_map_write(destino, coalesce(lista, '[]'));
  perform mapa_diseno_poner(destino, t.diseno);$q$);
    execute def;
  end if;
end $$;

commit;

select 'Listo 0113. Mapa libre activo (' || (select count(*) from seats where pos_x is not null) || ' asientos con posición).' as resultado;
