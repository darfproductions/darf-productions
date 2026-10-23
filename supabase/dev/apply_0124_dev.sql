-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV" (la base de darfproductions.com).
-- 0124: póster alterno de la obra (3:4 y 9:16, con información y sin textos). La versión sin textos es el fondo
-- de la invitación de Difusión. No cambia nada de lo que ya existe.
-- Se puede correr más de una vez. Si la base no es DEV, aborta.
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
  if to_regclass('public.preventa_codigos') is null then
    raise exception 'ABORTADO: primero corre los scripts de 0122 y 0123.';
  end if;
end $$;
-- 0124 (Diego 2026-10-22): póster alterno de la obra. Opcional, en 3:4 y 9:16, cada uno en dos versiones:
--   "con la información" y "sin textos ni logo". La versión sin textos es el fondo de la invitación de Difusión
--   (más elaborado que la imagen de ambiente, sin competir con el texto encima). No reemplaza al póster oficial.
--   Va en la misma sección "poster" de los borradores (0119): borrador → fans → público.
-- Precede: 0123.

begin;

alter table productions
  add column if not exists poster_alt_3x4_path text,
  add column if not exists poster_alt_3x4_info_path text,
  add column if not exists poster_alt_9x16_path text,
  add column if not exists poster_alt_9x16_info_path text;

-- Los archivos viven en la carpeta del kit de la obra, como el póster oficial (0093).
alter table productions drop constraint if exists productions_poster_alt_rutas;
alter table productions add constraint productions_poster_alt_rutas check (
  coalesce(poster_alt_3x4_path, id || '/kit/') like id || '/kit/%' and coalesce(poster_alt_3x4_info_path, id || '/kit/') like id || '/kit/%'
  and coalesce(poster_alt_9x16_path, id || '/kit/') like id || '/kit/%' and coalesce(poster_alt_9x16_info_path, id || '/kit/') like id || '/kit/%');

-- Igual que en 0119, más las cuatro rutas del póster alterno.
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
                        'poster_16x9_path', p.poster_16x9_path, 'poster_16x9_info_path', p.poster_16x9_info_path,
                        'poster_alt_3x4_path', p.poster_alt_3x4_path, 'poster_alt_3x4_info_path', p.poster_alt_3x4_info_path,
                        'poster_alt_9x16_path', p.poster_alt_9x16_path, 'poster_alt_9x16_info_path', p.poster_alt_9x16_info_path)
    else null end
  from productions p where p.id = pid
$$;
revoke all on function obra_seccion_viva(text, text) from public, anon, authenticated;

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
           poster_16x9_path = v->>'poster_16x9_path', poster_16x9_info_path = v->>'poster_16x9_info_path',
           poster_alt_3x4_path = v->>'poster_alt_3x4_path', poster_alt_3x4_info_path = v->>'poster_alt_3x4_info_path',
           poster_alt_9x16_path = v->>'poster_alt_9x16_path', poster_alt_9x16_info_path = v->>'poster_alt_9x16_info_path', updated_at = now()
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

-- La limpieza del Storage no borra imágenes del póster alterno que sigan en uso.
create or replace function kit_en_uso(paths text[]) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct x), '{}') from unnest(paths) x
   where exists (select 1 from productions p where x in (p.logo_path, p.ambiente_path, p.poster_3x4_path, p.poster_3x4_info_path,
                   p.poster_9x16_path, p.poster_9x16_info_path, p.poster_4x3_path, p.poster_4x3_info_path, p.poster_16x9_path, p.poster_16x9_info_path,
                   p.poster_alt_3x4_path, p.poster_alt_3x4_info_path, p.poster_alt_9x16_path, p.poster_alt_9x16_info_path))
      or exists (select 1 from obra_borradores b where b.seccion in ('kit', 'poster')
                   and (exists (select 1 from jsonb_each_text(coalesce(b.borrador, '{}'::jsonb)) e where e.value = x)
                        or exists (select 1 from jsonb_each_text(coalesce(b.fans, '{}'::jsonb)) e where e.value = x)))
$$;
revoke all on function kit_en_uso(text[]) from public, anon;
grant execute on function kit_en_uso(text[]) to authenticated;

commit;

select 'Listo 0124. Columnas del póster alterno: ' || (select count(*) from information_schema.columns where table_schema = 'public'
  and table_name = 'productions' and column_name like 'poster_alt_%') || ' de 4.' as resultado;
