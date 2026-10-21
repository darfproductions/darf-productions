-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV" (la base de darfproductions.com).
-- 0118: preventa con inicio y fin, precio propio por función, promos automáticas por función.
-- 0119: cambios de la página de la obra en borrador (borrador → fans → todos).
-- Se puede correr más de una vez. Si la base no es DEV, aborta.
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'price_categories' and column_name = 'precio_base') then
    raise exception 'ABORTADO: primero corre el script de 0117.';
  end if;
end $$;
begin;

-- ──────── Preventa con inicio y fin ────────
alter table productions add column if not exists preventa_desde timestamptz;
alter table productions add column if not exists preventa_hasta timestamptz;
alter table performances add column if not exists preventa_desde timestamptz;
alter table performances add column if not exists preventa_propia boolean not null default false;
alter table performances add column if not exists preventa_avisada_at timestamptz;

create or replace function preventa_revisar(pfid uuid) returns void
language plpgsql stable security definer set search_path = public as $$
declare desde timestamptz; hasta timestamptz;
begin
  select preventa_desde, preventa_hasta into desde, hasta from performances where id = pfid;
  if desde is not null and desde > now() then
    raise exception 'La venta de esta función abre el %.', cuando_mx(desde);
  end if;
  if hasta is not null and hasta > now() and not is_fan_member() then
    raise exception 'Esta función está en preventa para el Club Fan hasta el %. Únete gratis en la Fan Zone para comprar ahora.', cuando_mx(hasta);
  end if;
end $$;

-- Fechas de la obra → funciones que no tienen fechas propias, aún no pasan y empiezan después del fin.
create or replace function obra_preventa(pid text, p_desde timestamptz, p_hasta timestamptz) returns json
language plpgsql security definer set search_path = public as $$
declare n int; fuera int;
begin
  if not has_perm(pid, 'funciones.gestionar') then raise exception 'No autorizado'; end if;
  if p_desde is not null and p_hasta is not null and p_desde >= p_hasta then
    raise exception 'El inicio de la preventa debe ser antes del fin.';
  end if;
  update productions set preventa_desde = p_desde, preventa_hasta = p_hasta, updated_at = now() where id = pid;
  update performances set preventa_desde = p_desde, preventa_hasta = p_hasta, preventa_avisada_at = null
   where production_id = pid and not preventa_propia and cancelada_at is null and starts_at > now()
     and (p_hasta is null or starts_at > p_hasta);
  get diagnostics n = row_count;
  select count(*) into fuera from performances
   where production_id = pid and not preventa_propia and cancelada_at is null and starts_at > now()
     and p_hasta is not null and starts_at <= p_hasta;
  insert into audit_log (tabla, accion, production_id, despues)
    values ('productions', 'preventa_obra', pid, jsonb_build_object('desde', p_desde, 'hasta', p_hasta, 'funciones', n));
  return json_build_object('funciones', n, 'antes_del_fin', fuera);
end $$;
revoke all on function obra_preventa(text, timestamptz, timestamptz) from public, anon;
grant execute on function obra_preventa(text, timestamptz, timestamptz) to authenticated;

-- Una función nueva toma las fechas de la obra (si le quedan bien).
create or replace function performances_preventa_obra() returns trigger
language plpgsql security definer set search_path = public as $$
declare o productions;
begin
  if not new.preventa_propia and new.preventa_desde is null and new.preventa_hasta is null then
    select * into o from productions where id = new.production_id;
    if o.preventa_hasta is not null and o.preventa_hasta > now() and (new.starts_at is null or new.starts_at > o.preventa_hasta) then
      new.preventa_desde := o.preventa_desde;
      new.preventa_hasta := o.preventa_hasta;
    elsif o.preventa_hasta is null and o.preventa_desde is not null and o.preventa_desde > now() then
      new.preventa_desde := o.preventa_desde;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists performances_preventa_obra on performances;
create trigger performances_preventa_obra before insert on performances for each row execute function performances_preventa_obra();

-- El aviso sale cuando la preventa ya abrió (si el inicio es futuro, lo manda la tarea de cada 10 minutos).
create or replace function notify_preventa() returns trigger
language plpgsql security definer set search_path = public as $$
declare uids uuid[];
begin
  if new.on_sale and new.preventa_hasta is not null and new.preventa_hasta > now()
     and (new.preventa_desde is null or new.preventa_desde <= now())
     and (tg_op = 'INSERT' or not old.on_sale or old.preventa_hasta is distinct from new.preventa_hasta
          or old.preventa_desde is distinct from new.preventa_desde) then
    select coalesce(array_agg(user_id), '{}') into uids from preventa_recordatorios where production_id = new.production_id;
    if cardinality(uids) > 0 then
      begin
        perform notify(uids, 'fanzone', left('¡Abrió la preventa de ' || production_name(new.production_id) || '!', 200),
                       'Como socio del Club Fan compras antes que nadie, hasta el ' || cuando_mx(new.preventa_hasta) || '.',
                       '/producciones/' || new.production_id || '#funciones', new.production_id);
      exception when others then null;
      end;
      delete from preventa_recordatorios where production_id = new.production_id;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists performances_notify_preventa on performances;
create trigger performances_notify_preventa after insert or update of on_sale, preventa_hasta, preventa_desde on performances
  for each row execute function notify_preventa();

create or replace function preventa_avisos_pendientes() returns int
language plpgsql security definer set search_path = public as $$
declare r record; uids uuid[]; n int := 0;
begin
  for r in select production_id, max(preventa_hasta) as hasta from performances
            where on_sale and preventa_avisada_at is null and preventa_desde is not null
              and preventa_desde <= now() and preventa_hasta > now()
            group by production_id loop
    select coalesce(array_agg(user_id), '{}') into uids from preventa_recordatorios where production_id = r.production_id;
    if cardinality(uids) > 0 then
      begin
        perform notify(uids, 'fanzone', left('¡Abrió la preventa de ' || production_name(r.production_id) || '!', 200),
                       'Como socio del Club Fan compras antes que nadie, hasta el ' || cuando_mx(r.hasta) || '.',
                       '/producciones/' || r.production_id || '#funciones', r.production_id);
      exception when others then null;
      end;
      delete from preventa_recordatorios where production_id = r.production_id;
      n := n + cardinality(uids);
    end if;
    update performances set preventa_avisada_at = now()
     where production_id = r.production_id and on_sale and preventa_avisada_at is null and preventa_desde <= now();
  end loop;
  return n;
end $$;
revoke all on function preventa_avisos_pendientes() from public, anon, authenticated;

do $$ begin if exists (select 1 from pg_extension where extname = 'pg_cron') then
  perform cron.unschedule(jobid) from cron.job where jobname = 'darf_preventa';
  perform cron.schedule('darf_preventa', '*/10 * * * *', 'select public.preventa_avisos_pendientes()');
end if; end $$;

-- ──────── Precio propio por función ────────
alter table performance_price_categories add column if not exists propio boolean not null default false;

create or replace function zona_precio(zid uuid, p_precio numeric) returns int
language plpgsql security definer set search_path = public as $$
declare z price_categories; n int;
begin
  select * into z from price_categories where id = zid;
  if not found then raise exception 'No se encontró la zona.'; end if;
  if not has_perm(z.production_id, 'funciones.gestionar') then raise exception 'No autorizado'; end if;
  if p_precio is null or p_precio < 0 or p_precio > 1000000 then raise exception 'Precio no válido.'; end if;
  update price_categories set precio_base = p_precio, updated_at = now() where id = zid;
  -- 0118: las funciones con precio propio no se tocan.
  insert into performance_price_categories (performance_id, price_category_id, price)
  select pf.id, zid, p_precio from performances pf
   where pf.production_id = z.production_id and pf.cancelada_at is null and pf.starts_at > now()
  on conflict (performance_id, price_category_id) do update set price = excluded.price, updated_at = now()
   where not performance_price_categories.propio;
  get diagnostics n = row_count;
  insert into audit_log (tabla, accion, production_id, despues)
    values ('price_categories', 'precio_zona', z.production_id, jsonb_build_object('zona', z.nombre, 'precio', p_precio, 'funciones', n));
  return n;
end $$;

-- ──────── Promos automáticas ────────
create table if not exists promos (
  id uuid primary key default gen_random_uuid(),
  production_id text not null references productions(id) on delete cascade,
  nombre text not null check (char_length(btrim(nombre)) between 1 and 60),
  percent numeric(5, 2) not null check (percent > 0 and percent <= 100),
  valid_from timestamptz,
  valid_until timestamptz,
  is_active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_from is null or valid_until is null or valid_from < valid_until)
);
create table if not exists promo_performances (
  promo_id uuid not null references promos(id) on delete cascade,
  performance_id uuid not null references performances(id) on delete cascade,
  primary key (promo_id, performance_id)
);
create table if not exists promo_categories (
  promo_id uuid not null references promos(id) on delete cascade,
  price_category_id uuid not null references price_categories(id) on delete cascade,
  primary key (promo_id, price_category_id)
);
create index if not exists promos_production_idx on promos(production_id);
create index if not exists promo_performances_perf_idx on promo_performances(performance_id);
alter table promos enable row level security;
alter table promo_performances enable row level security;
alter table promo_categories enable row level security;
drop policy if exists promos_staff_read on promos;
create policy promos_staff_read on promos for select to authenticated using (has_perm(production_id, 'descuentos.gestionar'));
drop policy if exists promo_performances_staff_read on promo_performances;
create policy promo_performances_staff_read on promo_performances for select to authenticated
  using (exists (select 1 from promos p where p.id = promo_id and has_perm(p.production_id, 'descuentos.gestionar')));
drop policy if exists promo_categories_staff_read on promo_categories;
create policy promo_categories_staff_read on promo_categories for select to authenticated
  using (exists (select 1 from promos p where p.id = promo_id and has_perm(p.production_id, 'descuentos.gestionar')));

-- % de la mejor promo vigente para esa función y zona (0 si no hay).
create or replace function promo_pct(pfid uuid, zid uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(max(p.percent), 0)
    from promos p join performances pf on pf.id = pfid and pf.production_id = p.production_id
   where p.is_active
     and (p.valid_from is null or p.valid_from <= now())
     and (p.valid_until is null or p.valid_until > now())
     and (not exists (select 1 from promo_performances x where x.promo_id = p.id)
          or exists (select 1 from promo_performances x where x.promo_id = p.id and x.performance_id = pfid))
     and (not exists (select 1 from promo_categories x where x.promo_id = p.id)
          or exists (select 1 from promo_categories x where x.promo_id = p.id and x.price_category_id = zid))
$$;

create or replace function promo_precio(pfid uuid, zid uuid, p_precio numeric) returns numeric
language sql stable security definer set search_path = public as $$
  select p_precio - round(p_precio * promo_pct(pfid, zid) / 100, 2)
$$;
grant execute on function promo_pct(uuid, uuid) to anon, authenticated;
grant execute on function promo_precio(uuid, uuid, numeric) to anon, authenticated;

-- Para la página de la obra y la compra: promos vigentes por función y zona (lo que ve el público).
create or replace function promos_obra(pid text) returns table(performance_id uuid, price_category_id uuid, percent numeric, nombre text, hasta timestamptz)
language sql stable security definer set search_path = public as $$
  select distinct on (pf.id, ppc.price_category_id) pf.id, ppc.price_category_id, p.percent, p.nombre, p.valid_until
    from performances pf
    join performance_price_categories ppc on ppc.performance_id = pf.id
    join promos p on p.production_id = pf.production_id
   where pf.production_id = pid and production_is_visible(pid) and pf.cancelada_at is null and pf.starts_at > now()
     and p.is_active
     and (p.valid_from is null or p.valid_from <= now())
     and (p.valid_until is null or p.valid_until > now())
     and (not exists (select 1 from promo_performances x where x.promo_id = p.id)
          or exists (select 1 from promo_performances x where x.promo_id = p.id and x.performance_id = pf.id))
     and (not exists (select 1 from promo_categories x where x.promo_id = p.id)
          or exists (select 1 from promo_categories x where x.promo_id = p.id and x.price_category_id = ppc.price_category_id))
   order by pf.id, ppc.price_category_id, p.percent desc
$$;
grant execute on function promos_obra(text) to anon, authenticated;

create or replace function admin_save_promo(target_id uuid, pid text, p_nombre text, p_percent numeric,
  p_desde timestamptz, p_hasta timestamptz, p_activa boolean, p_funciones uuid[], p_zonas uuid[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not has_perm(pid, 'descuentos.gestionar') then raise exception 'No autorizado'; end if;
  if p_nombre is null or btrim(p_nombre) = '' then raise exception 'Ponle nombre a la promo.'; end if;
  if p_percent is null or p_percent <= 0 or p_percent > 100 then raise exception 'El porcentaje debe ser de 1 a 100.'; end if;
  if p_desde is not null and p_hasta is not null and p_desde >= p_hasta then raise exception 'La fecha de inicio debe ser antes del fin.'; end if;
  if exists (select 1 from unnest(coalesce(p_funciones, '{}')) f where not exists (select 1 from performances x where x.id = f and x.production_id = pid))
     or exists (select 1 from unnest(coalesce(p_zonas, '{}')) z where not exists (select 1 from price_categories x where x.id = z and x.production_id = pid)) then
    raise exception 'Funciones o zonas no válidas.';
  end if;
  if target_id is null then
    insert into promos (production_id, nombre, percent, valid_from, valid_until, is_active)
    values (pid, btrim(p_nombre), p_percent, p_desde, p_hasta, coalesce(p_activa, true)) returning id into v_id;
  else
    update promos set nombre = btrim(p_nombre), percent = p_percent, valid_from = p_desde, valid_until = p_hasta,
           is_active = coalesce(p_activa, true), updated_at = now()
     where id = target_id and production_id = pid returning id into v_id;
    if v_id is null then raise exception 'No se encontró la promo.'; end if;
    delete from promo_performances where promo_id = v_id;
    delete from promo_categories where promo_id = v_id;
  end if;
  insert into promo_performances (promo_id, performance_id) select v_id, f from unnest(coalesce(p_funciones, '{}')) f;
  insert into promo_categories (promo_id, price_category_id) select v_id, z from unnest(coalesce(p_zonas, '{}')) z;
  insert into audit_log (tabla, accion, production_id, despues)
    values ('promos', case when target_id is null then 'crear_promo' else 'editar_promo' end, pid,
            jsonb_build_object('nombre', btrim(p_nombre), 'percent', p_percent, 'funciones', cardinality(coalesce(p_funciones, '{}'))));
  return v_id;
end $$;
revoke all on function admin_save_promo(uuid, text, text, numeric, timestamptz, timestamptz, boolean, uuid[], uuid[]) from public, anon;
grant execute on function admin_save_promo(uuid, text, text, numeric, timestamptz, timestamptz, boolean, uuid[], uuid[]) to authenticated;

create or replace function admin_delete_promo(target_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v promos;
begin
  select * into v from promos where id = target_id;
  if not found then raise exception 'No se encontró la promo.'; end if;
  if not has_perm(v.production_id, 'descuentos.gestionar') then raise exception 'No autorizado'; end if;
  delete from promos where id = target_id;
  insert into audit_log (tabla, accion, production_id, antes)
    values ('promos', 'borrar_promo', v.production_id, jsonb_build_object('nombre', v.nombre, 'percent', v.percent));
end $$;
revoke all on function admin_delete_promo(uuid) from public, anon;
grant execute on function admin_delete_promo(uuid) to authenticated;

-- La compra (en línea y taquilla) cobra el precio con la promo: se cambia ppc.price por promo_precio(...).
do $$ declare f text; def text; nuevo text; begin
  foreach f in array array['create_seated_ticket_order', 'admin_create_seated_order', '_create_general_order'] loop
    select pg_get_functiondef(p.oid) into def from pg_proc p where p.proname = f and p.pronamespace = 'public'::regnamespace;
    if def is null then raise exception 'Falta la función %', f; end if;
    if position('promo_precio(' in def) > 0 then continue; end if;
    nuevo := regexp_replace(def, 'ppc\.price\M', 'promo_precio(ppc.performance_id, ppc.price_category_id, ppc.price)', 'g');
    if nuevo = def then raise exception 'No se encontró el precio en %', f; end if;
    execute nuevo;
  end loop;
end $$;

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

commit;

select 'Listo 0118 y 0119. Preventa con inicio, promos, precio propio y borradores de la obra.' as resultado;
