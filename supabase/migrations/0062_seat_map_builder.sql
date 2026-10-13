-- 0062: creador de mapas de asientos (Bloque 3, plan del 2026-10-12; aprobado por Diego).
--   * Quien tiene funciones.gestionar en la obra arma su mapa desde el panel: lo genera por
--     filas (el panel calcula la lista de asientos y la vista previa; la base la valida),
--     lo ajusta asiento por asiento (quitar, volver a poner, cambiar zona) o lo copia de
--     otra obra.
--   * Cuidado del inventario:
--     - Generar o copiar REEMPLAZA el mapa y solo se permite si ningún boleto de la obra usa
--       un asiento (ni siquiera boletos viejos o anulados: el historial no se rompe).
--     - Con boletos, solo se ajusta asiento por asiento. No se quita un asiento que tenga un
--       boleto activo en una función que no ha pasado.
--     - Los asientos se bloquean (for update) antes de revisar: una compra al mismo tiempo
--       espera o falla limpio ("no existe" / "no disponible").
--   * Las zonas con asiento pueden tener color (price_categories.color) para el mapa.
--   * Cada cambio deja UNA línea en la bitácora (no una por asiento).
-- Precede: 0061.

begin;

alter table price_categories add column color text
  check (color is null or color ~ '^#[0-9A-Fa-f]{6}$');

-- ¿Algún boleto (de cualquier estado) usa asientos de la obra?
create or replace function seat_map_has_tickets(pid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from tickets t join seats s on s.id = t.seat_id where s.production_id = pid)
$$;

-- Núcleo: reemplaza el mapa de la obra con la lista dada. Sin permisos propios (lo llaman las RPC).
create or replace function seat_map_write(pid text, lista jsonb) returns int
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
    z := nullif(it->>'zona', '')::uuid;
    if z is null or not exists (select 1 from price_categories where id = z and production_id = pid and cupo is null) then
      raise exception 'Cada asiento necesita una zona con asiento de esta obra.';
    end if;
  end loop;
  if (select count(distinct e->>'etiqueta') from jsonb_array_elements(lista) e) <> n then
    raise exception 'Hay asientos repetidos (misma fila y número).';
  end if;

  delete from seats where production_id = pid;
  insert into seats (production_id, section, seat_row, seat_number, seat_label, lado, price_category_id, is_active)
  select pid, nullif(btrim(e->>'seccion'), ''), btrim(e->>'fila'), (e->>'numero')::int, btrim(e->>'etiqueta'),
         e->>'lado', (e->>'zona')::uuid, coalesce((e->>'activo')::boolean, true)
    from jsonb_array_elements(lista) e;
  return n;
end $$;

-- Generar (o reemplazar) el mapa.
create or replace function seat_map_generate(pid text, lista jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not has_perm(pid, 'funciones.gestionar') then raise exception 'No autorizado'; end if;
  n := seat_map_write(pid, lista);
  insert into audit_log (tabla, accion, production_id, despues) values ('seats', 'mapa', pid, jsonb_build_object('asientos', n));
  return jsonb_build_object('asientos', n);
end $$;

-- Copiar el mapa de otra obra (las zonas se emparejan por nombre; las que falten se crean).
create or replace function seat_map_copy(origen text, destino text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare lista jsonb; n int;
begin
  if not has_perm(destino, 'funciones.gestionar') then raise exception 'No autorizado'; end if;
  if origen = destino then raise exception 'Elige otra obra.'; end if;
  if not exists (select 1 from seats where production_id = origen) then raise exception 'Esa obra no tiene mapa de asientos.'; end if;
  if seat_map_has_tickets(destino) then
    raise exception 'Esta obra ya tiene boletos con asiento: el mapa ya no se puede reemplazar.';
  end if;
  insert into price_categories (production_id, nombre, descripcion, color)
  select distinct destino, pc.nombre, pc.descripcion, pc.color
    from seats s join price_categories pc on pc.id = s.price_category_id
   where s.production_id = origen
  on conflict (production_id, nombre) do nothing;
  if exists (select 1 from seats s join price_categories pc on pc.id = s.price_category_id
               join price_categories d on d.production_id = destino and d.nombre = pc.nombre
              where s.production_id = origen and d.cupo is not null) then
    raise exception 'Una zona de la otra obra se llama igual que una zona de entrada general de esta obra.';
  end if;
  select jsonb_agg(jsonb_build_object('fila', s.seat_row, 'numero', s.seat_number, 'lado', s.lado, 'seccion', s.section,
           'etiqueta', s.seat_label, 'activo', s.is_active,
           'zona', (select d.id from price_categories d join price_categories o on o.nombre = d.nombre
                     where d.production_id = destino and o.id = s.price_category_id)))
    into lista
    from seats s where s.production_id = origen and s.seat_number is not null and s.lado is not null;
  n := seat_map_write(destino, coalesce(lista, '[]'));
  insert into audit_log (tabla, accion, production_id, despues)
  values ('seats', 'copiar', destino, jsonb_build_object('asientos', n, 'origen', origen));
  return jsonb_build_object('asientos', n);
end $$;

-- Ajustar asientos: quitar, volver a poner o cambiar de zona.
create or replace function seat_map_update(pid text, ids uuid[], accion text, zona uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not has_perm(pid, 'funciones.gestionar') then raise exception 'No autorizado'; end if;
  if accion not in ('quitar', 'poner', 'zona') then raise exception 'Acción no válida.'; end if;
  if ids is null or cardinality(ids) < 1 then raise exception 'Selecciona al menos un asiento.'; end if;
  perform 1 from seats where id = any(ids) for update;
  if (select count(*) from seats where id = any(ids) and production_id = pid) <> (select count(distinct x) from unnest(ids) x) then
    raise exception 'Uno de los asientos no es de esta obra.';
  end if;
  if accion = 'quitar' then
    if exists (select 1 from tickets t join performances f on f.id = t.performance_id
                where t.seat_id = any(ids) and t.is_active and f.starts_at > now() - interval '6 hours') then
      raise exception 'Uno de los asientos tiene un boleto vendido para una función próxima: no se puede quitar.';
    end if;
    update seats set is_active = false where id = any(ids);
  elsif accion = 'poner' then
    update seats set is_active = true where id = any(ids);
  else
    if zona is null or not exists (select 1 from price_categories where id = zona and production_id = pid and cupo is null) then
      raise exception 'Elige una zona con asiento de esta obra.';
    end if;
    update seats set price_category_id = zona where id = any(ids);
  end if;
  get diagnostics n = row_count;
  insert into audit_log (tabla, accion, production_id, despues)
  values ('seats', accion, pid, jsonb_build_object('asientos', n, 'zona', zona));
  return jsonb_build_object('asientos', n);
end $$;

revoke execute on function seat_map_write(text, jsonb) from public, anon, authenticated;
revoke execute on function seat_map_has_tickets(text), seat_map_generate(text, jsonb), seat_map_copy(text, text),
  seat_map_update(text, uuid[], text, uuid) from public, anon;
grant execute on function seat_map_has_tickets(text), seat_map_generate(text, jsonb), seat_map_copy(text, text),
  seat_map_update(text, uuid[], text, uuid) to authenticated;

commit;
