-- 0119 (Diego 2026-10-21): cambios de la página de la obra en borrador.
--   Con la obra ya pública, lo que se edita en el panel se guarda como BORRADOR (no sale en la página).
--   Cada sección se puede publicar primero a FANS (los socios del Club Fan la ven en la misma página)
--   y después a TODOS; o directo a todos. Se puede publicar sección por sección o todo junto.
--   Si la obra aún no es pública, los cambios se guardan directo (como antes).
--   Secciones: datos, colores, kit (logo y ambiente), poster, franja, canciones, ficha (extra), videos, gracias.

create table if not exists obra_borradores (
  production_id text not null references productions(id) on delete cascade,
  seccion text not null check (seccion in ('datos', 'colores', 'kit', 'poster', 'franja', 'canciones', 'ficha', 'videos', 'gracias')),
  borrador jsonb,
  fans jsonb,
  borrador_at timestamptz,
  borrador_por uuid references auth.users(id) on delete set null,
  fans_at timestamptz,
  fans_por uuid references auth.users(id) on delete set null,
  primary key (production_id, seccion)
);
alter table obra_borradores enable row level security;
drop policy if exists obra_borradores_staff_read on obra_borradores;
create policy obra_borradores_staff_read on obra_borradores for select to authenticated
  using (has_perm(production_id, 'obra.editar') or has_perm(production_id, 'obra.publicar'));

-- Lo que hoy ve el público de una sección (para empezar un borrador sobre eso).
create or replace function obra_seccion_viva(pid text, p_seccion text) returns jsonb
language sql stable security definer set search_path = public as $$
  select case p_seccion
    when 'datos' then jsonb_build_object('nombre', p.nombre, 'frase', p.frase, 'sinopsis', p.sinopsis, 'venue', p.venue, 'temporada', p.temporada,
                        'fecha', p.fecha, 'duracion', p.duracion, 'clasificacion', p.clasificacion, 'idioma', p.idioma, 'basada_en', p.basada_en)
    when 'colores' then jsonb_build_object('color_fondo', p.color_fondo, 'color_superficie', p.color_superficie, 'color_texto', p.color_texto, 'color_acento', p.color_acento)
    when 'kit' then jsonb_build_object('logo_path', p.logo_path, 'ambiente_path', p.ambiente_path)
    when 'poster' then jsonb_build_object('poster_3x4_path', p.poster_3x4_path, 'poster_3x4_info_path', p.poster_3x4_info_path,
                        'poster_9x16_path', p.poster_9x16_path, 'poster_9x16_info_path', p.poster_9x16_info_path,
                        'poster_4x3_path', p.poster_4x3_path, 'poster_4x3_info_path', p.poster_4x3_info_path,
                        'poster_16x9_path', p.poster_16x9_path, 'poster_16x9_info_path', p.poster_16x9_info_path)
    else null end
  from productions p where p.id = pid
$$;
revoke all on function obra_seccion_viva(text, text) from public, anon, authenticated;

-- Pone una sección en la página pública (lo que antes hacía cada "Guardar").
create or replace function obra_aplicar(pid text, p_seccion text, v jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare t text[];
begin
  if p_seccion = 'datos' then
    if coalesce(btrim(v->>'nombre'), '') = '' then raise exception 'La obra necesita un nombre.'; end if;
    update productions set nombre = btrim(v->>'nombre'), frase = v->>'frase', sinopsis = v->>'sinopsis', venue = v->>'venue',
           temporada = v->>'temporada', fecha = v->>'fecha', duracion = v->>'duracion', clasificacion = v->>'clasificacion',
           idioma = v->>'idioma', basada_en = v->>'basada_en', updated_at = now()
     where id = pid;
  elsif p_seccion = 'colores' then
    update productions set color_fondo = v->>'color_fondo', color_superficie = v->>'color_superficie', color_texto = v->>'color_texto',
           color_acento = v->>'color_acento', updated_at = now() where id = pid;
  elsif p_seccion = 'kit' then
    update productions set logo_path = v->>'logo_path', ambiente_path = v->>'ambiente_path', updated_at = now() where id = pid;
  elsif p_seccion = 'poster' then
    update productions set poster_3x4_path = v->>'poster_3x4_path', poster_3x4_info_path = v->>'poster_3x4_info_path',
           poster_9x16_path = v->>'poster_9x16_path', poster_9x16_info_path = v->>'poster_9x16_info_path',
           poster_4x3_path = v->>'poster_4x3_path', poster_4x3_info_path = v->>'poster_4x3_info_path',
           poster_16x9_path = v->>'poster_16x9_path', poster_16x9_info_path = v->>'poster_16x9_info_path', updated_at = now()
     where id = pid;
  elsif p_seccion = 'franja' then
    perform panel_set_banner(pid, v->>'estilo', v->>'color', coalesce((v->>'activa')::boolean, true), coalesce(v->'items', '[]'::jsonb));
  elsif p_seccion = 'canciones' then
    perform panel_set_songs(pid, coalesce(v->'actos', '[]'::jsonb));
  elsif p_seccion = 'ficha' then
    perform panel_set_facts(pid, coalesce(v->'items', '[]'::jsonb));
  elsif p_seccion = 'videos' then
    perform panel_set_media(pid, 'video', coalesce(v->'items', '[]'::jsonb));
  elsif p_seccion = 'gracias' then
    select coalesce(array_agg(x), '{}') into t from jsonb_array_elements_text(coalesce(v->'items', '[]'::jsonb)) x;
    perform panel_set_thanks(pid, t);
  else
    raise exception 'Sección no válida.';
  end if;
end $$;
revoke all on function obra_aplicar(text, text, jsonb) from public, anon, authenticated;

-- Guardar: con la obra pública va a borrador; si no, directo. p_parche: se mezcla con lo último (kit, póster).
create or replace function obra_borrador_guardar(pid text, p_seccion text, datos jsonb, p_parche boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare v_estado text; v jsonb; r obra_borradores;
begin
  if not has_perm(pid, 'obra.editar') then raise exception 'No tienes permiso para editar esta obra.'; end if;
  if p_seccion not in ('datos', 'colores', 'kit', 'poster', 'franja', 'canciones', 'ficha', 'videos', 'gracias') then raise exception 'Sección no válida.'; end if;
  select estado into v_estado from productions where id = pid;
  if not found then raise exception 'No se encontró la obra.'; end if;
  select * into r from obra_borradores where production_id = pid and seccion = p_seccion for update;
  v := case when p_parche then coalesce(r.borrador, r.fans, obra_seccion_viva(pid, p_seccion), '{}'::jsonb) || datos else datos end;
  if v_estado not in ('publicada', 'archivada') then
    perform obra_aplicar(pid, p_seccion, v);
    delete from obra_borradores where production_id = pid and seccion = p_seccion;
    return 'directo';
  end if;
  insert into obra_borradores (production_id, seccion, borrador, borrador_at, borrador_por)
  values (pid, p_seccion, v, now(), auth.uid())
  on conflict (production_id, seccion) do update set borrador = excluded.borrador, borrador_at = now(), borrador_por = auth.uid();
  return 'borrador';
end $$;
revoke all on function obra_borrador_guardar(text, text, jsonb, boolean) from public, anon;
grant execute on function obra_borrador_guardar(text, text, jsonb, boolean) to authenticated;

-- Publicar: destino 'fans' (el borrador pasa a fans) o 'publico' (lo más nuevo pasa a la página).
-- p_secciones null = todas las que tienen cambios. Regresa cuántas secciones se publicaron.
create or replace function obra_publicar(pid text, p_secciones text[], p_destino text) returns int
language plpgsql security definer set search_path = public as $$
declare r obra_borradores; n int := 0;
begin
  if not has_perm(pid, 'obra.publicar') then raise exception 'Publicar cambios lo hace la Dirección de la obra o el Director.'; end if;
  if p_destino not in ('fans', 'publico') then raise exception 'Destino no válido.'; end if;
  for r in select * from obra_borradores where production_id = pid and (p_secciones is null or seccion = any(p_secciones))
           order by seccion for update loop
    if p_destino = 'fans' then
      continue when r.borrador is null;
      update obra_borradores set fans = r.borrador, fans_at = now(), fans_por = auth.uid(), borrador = null, borrador_at = null, borrador_por = null
       where production_id = pid and seccion = r.seccion;
    else
      continue when coalesce(r.borrador, r.fans) is null;
      perform obra_aplicar(pid, r.seccion, coalesce(r.borrador, r.fans));
      delete from obra_borradores where production_id = pid and seccion = r.seccion;
    end if;
    n := n + 1;
  end loop;
  if n > 0 then
    insert into audit_log (tabla, accion, production_id, despues)
      values ('productions', case when p_destino = 'fans' then 'publicar_fans' else 'publicar_cambios' end, pid,
              jsonb_build_object('secciones', coalesce(to_jsonb(p_secciones), '"todas"'::jsonb), 'n', n));
  end if;
  return n;
end $$;
revoke all on function obra_publicar(text, text[], text) from public, anon;
grant execute on function obra_publicar(text, text[], text) to authenticated;

-- Descartar el borrador (vuelve a lo publicado o a lo de fans) o quitar lo de fans (vuelven a ver lo público).
create or replace function obra_descartar(pid text, p_secciones text[], p_capa text) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_capa = 'fans' then
    if not has_perm(pid, 'obra.publicar') then raise exception 'No autorizado'; end if;
    update obra_borradores set fans = null, fans_at = null, fans_por = null
     where production_id = pid and (p_secciones is null or seccion = any(p_secciones)) and fans is not null;
  elsif p_capa = 'borrador' then
    if not has_perm(pid, 'obra.editar') then raise exception 'No autorizado'; end if;
    update obra_borradores set borrador = null, borrador_at = null, borrador_por = null
     where production_id = pid and (p_secciones is null or seccion = any(p_secciones)) and borrador is not null;
  else
    raise exception 'Capa no válida.';
  end if;
  get diagnostics n = row_count;
  delete from obra_borradores where production_id = pid and borrador is null and fans is null;
  return n;
end $$;
revoke all on function obra_descartar(text, text[], text) from public, anon;
grant execute on function obra_descartar(text, text[], text) to authenticated;

-- Lo que se pone encima de la página: 'fans' (socios del Club Fan y el equipo) o 'borrador' (solo el equipo:
-- lo más nuevo de cada sección, para el editor y la vista previa).
create or replace function obra_capa(pid text, p_cual text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare equipo boolean := has_perm(pid, 'obra.editar') or has_perm(pid, 'obra.publicar');
begin
  if p_cual = 'fans' then
    if not (equipo or (is_fan_member() and production_is_visible(pid))) then return '{}'::jsonb; end if;
    return coalesce((select jsonb_object_agg(seccion, fans) from obra_borradores where production_id = pid and fans is not null), '{}'::jsonb);
  elsif p_cual = 'borrador' then
    if not equipo then return '{}'::jsonb; end if;
    return coalesce((select jsonb_object_agg(seccion, coalesce(borrador, fans)) from obra_borradores where production_id = pid), '{}'::jsonb);
  end if;
  return '{}'::jsonb;
end $$;
revoke all on function obra_capa(text, text) from public, anon;
grant execute on function obra_capa(text, text) to authenticated;

-- Antes de borrar del Storage una imagen del kit que ya no se usa: ¿alguna obra (o un duplicado, o un
-- cambio sin publicar) todavía la usa? Regresa las que siguen en uso.
create or replace function kit_en_uso(paths text[]) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct x), '{}') from unnest(paths) x
   where exists (select 1 from productions p where x in (p.logo_path, p.ambiente_path, p.poster_3x4_path, p.poster_3x4_info_path,
                   p.poster_9x16_path, p.poster_9x16_info_path, p.poster_4x3_path, p.poster_4x3_info_path, p.poster_16x9_path, p.poster_16x9_info_path))
      or exists (select 1 from obra_borradores b where b.seccion in ('kit', 'poster')
                   and (exists (select 1 from jsonb_each_text(coalesce(b.borrador, '{}'::jsonb)) e where e.value = x)
                        or exists (select 1 from jsonb_each_text(coalesce(b.fans, '{}'::jsonb)) e where e.value = x)))
$$;
revoke all on function kit_en_uso(text[]) from public, anon;
grant execute on function kit_en_uso(text[]) to authenticated;
