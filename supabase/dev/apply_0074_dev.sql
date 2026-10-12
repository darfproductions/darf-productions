-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV".
-- 0074: franja del sitio y anuncios. Requiere 0073 ya aplicada. Si la base no es DEV, aborta.
-- Se corre completa en Supabase → SQL Editor (proyecto DARF 2.0 DEV).
begin;
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
end $$;


create table site_banner (
  id boolean primary key default true check (id),
  estilo text not null default 'corre' check (estilo in ('corre', 'fija')),
  color text check (color ~ '^#[0-9a-fA-F]{6}$'),
  activa boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table site_banner_items (
  id uuid primary key default gen_random_uuid(),
  texto text not null check (length(btrim(texto)) between 1 and 160),
  enlace text check (length(enlace) <= 500 and (enlace ~ '^/($|[^/\\])' or enlace ~ '^https://[^\s]+$')),
  boton text check (length(boton) <= 30),
  inicia timestamptz,
  termina timestamptz,
  orden int not null default 0,
  check (termina is null or inicia is null or termina > inicia)
);

alter table site_banner enable row level security;
alter table site_banner_items enable row level security;
create policy site_banner_read on site_banner for select using (true);
create policy site_banner_items_read on site_banner_items for select using (true);
create policy site_banner_admin on site_banner for all to authenticated using (is_admin()) with check (is_admin());
create policy site_banner_items_admin on site_banner_items for all to authenticated using (is_admin()) with check (is_admin());

create or replace function panel_set_site_banner(p_estilo text, p_color text, p_activa boolean, items jsonb) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo el Director puede editar la franja del sitio.'; end if;
  if jsonb_array_length(coalesce(items, '[]'::jsonb)) > 10 then raise exception 'Máximo 10 avisos en la franja.'; end if;
  insert into site_banner (id, estilo, color, activa, updated_at, updated_by)
  values (true, coalesce(p_estilo, 'corre'), nullif(btrim(coalesce(p_color, '')), ''), coalesce(p_activa, true), now(), auth.uid())
  on conflict (id) do update
    set estilo = excluded.estilo, color = excluded.color, activa = excluded.activa, updated_at = now(), updated_by = auth.uid();
  delete from site_banner_items where true;
  insert into site_banner_items (texto, enlace, boton, inicia, termina, orden)
  select btrim(e->>'texto'), nullif(btrim(coalesce(e->>'enlace', '')), ''), nullif(btrim(coalesce(e->>'boton', '')), ''),
         nullif(e->>'inicia', '')::timestamptz, nullif(e->>'termina', '')::timestamptz, n
    from jsonb_array_elements(coalesce(items, '[]'::jsonb)) with ordinality as x(e, n)
   where coalesce(btrim(e->>'texto'), '') <> '';
end $$;
revoke execute on function panel_set_site_banner(text, text, boolean, jsonb) from public, anon;
grant execute on function panel_set_site_banner(text, text, boolean, jsonb) to authenticated;

create table anuncios (
  id uuid primary key default gen_random_uuid(),
  lugar text not null check (lugar in ('inicio', 'obra', 'fanzone')),
  production_id text references productions(id) on delete cascade,
  tipo text not null default 'general' check (tipo in ('elenco', 'convocatoria', 'fechas', 'funcion', 'preventa', 'general')),
  titulo text not null check (length(btrim(titulo)) between 1 and 120),
  adelanto text check (length(adelanto) <= 400),
  contenido text check (length(contenido) <= 2000),
  imagen_path text check (length(imagen_path) <= 300),
  enlace text check (length(enlace) <= 500 and (enlace ~ '^/($|[^/\\])' or enlace ~ '^https://[^\s]+$')),
  boton text check (length(boton) <= 30),
  revela_at timestamptz,
  solo_club boolean not null default false,
  registro boolean not null default false,
  publicado boolean not null default false,
  inicia timestamptz,
  termina timestamptz,
  orden int not null default 0,
  avisado_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (lugar <> 'obra' or production_id is not null),
  check (termina is null or inicia is null or termina > inicia)
);
create index idx_anuncios_lugar on anuncios(lugar, production_id, orden);

create table anuncio_registros (
  anuncio_id uuid not null references anuncios(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (anuncio_id, user_id)
);

alter table anuncios enable row level security;
alter table anuncio_registros enable row level security;

create or replace function can_edit_anuncio(p_lugar text, pid text) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or (pid is not null and p_lugar in ('obra', 'fanzone') and has_perm(pid, 'obra.editar'))
$$;
revoke execute on function can_edit_anuncio(text, text) from public, anon;
grant execute on function can_edit_anuncio(text, text) to authenticated;

create policy anuncios_editor on anuncios for all to authenticated
  using (can_edit_anuncio(lugar, production_id)) with check (can_edit_anuncio(lugar, production_id));
create policy anuncio_registros_own on anuncio_registros for select to authenticated using (user_id = auth.uid());
create policy anuncio_registros_editor on anuncio_registros for select to authenticated
  using (exists (select 1 from anuncios a where a.id = anuncio_id and can_edit_anuncio(a.lugar, a.production_id)));

create trigger audit_anuncios after insert or update or delete on anuncios for each row execute function audit_row();

create or replace function anuncio_club_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin()
$$;
revoke execute on function anuncio_club_ok() from public, anon;
grant execute on function anuncio_club_ok() to authenticated;

create or replace function anuncios_publicos(p_lugar text, pid text default null)
returns table (id uuid, lugar text, production_id text, tipo text, titulo text, adelanto text, contenido text,
               imagen_path text, enlace text, boton text, revela_at timestamptz, solo_club boolean, registro boolean,
               revelado boolean, bloqueado boolean, apuntado boolean)
language sql stable security definer set search_path = public as $$
  select a.id, a.lugar, a.production_id, a.tipo, a.titulo, a.adelanto,
         case when abierto then a.contenido end,
         case when abierto then a.imagen_path end,
         case when abierto then a.enlace end,
         case when abierto then a.boton end,
         a.revela_at, a.solo_club, a.registro,
         revelado, not abierto,
         exists (select 1 from anuncio_registros s where s.anuncio_id = a.id and s.user_id = auth.uid())
    from anuncios a
    cross join lateral (select (a.revela_at is null or a.revela_at <= now()) as revelado) r
    cross join lateral (select r.revelado and (not a.solo_club or (auth.uid() is not null and anuncio_club_ok())) as abierto) b
   where a.publicado
     and a.lugar = p_lugar
     and (pid is null or a.production_id = pid)
     and (a.production_id is null or production_is_visible(a.production_id))
     and (a.inicia is null or a.inicia <= now())
     and (a.termina is null or a.termina > now())
   order by a.orden, a.created_at
$$;
revoke execute on function anuncios_publicos(text, text) from public;
grant execute on function anuncios_publicos(text, text) to anon, authenticated;

create or replace function anuncio_registro(aid uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare a anuncios;
begin
  if auth.uid() is null then raise exception 'Necesitas iniciar sesión.'; end if;
  select * into a from anuncios where id = aid and publicado;
  if not found or not a.registro then raise exception 'Este anuncio no acepta registros.'; end if;
  if p_on then
    if a.revela_at is not null and a.revela_at <= now() then raise exception 'Este anuncio ya se reveló.'; end if;
    insert into anuncio_registros (anuncio_id, user_id) values (aid, auth.uid()) on conflict do nothing;
  else
    delete from anuncio_registros where anuncio_id = aid and user_id = auth.uid();
  end if;
end $$;
revoke execute on function anuncio_registro(uuid, boolean) from public, anon;
grant execute on function anuncio_registro(uuid, boolean) to authenticated;

create or replace function notify_anuncios() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; destino text;
begin
  for r in select * from anuncios
            where publicado and registro and avisado_at is null and revela_at is not null and revela_at <= now()
            for update skip locked loop
    destino := case r.lugar when 'obra' then '/producciones/' || r.production_id when 'fanzone' then '/fan-zone' else '/' end;
    begin
      perform notify((select coalesce(array_agg(user_id), '{}') from anuncio_registros where anuncio_id = r.id),
                     'anuncio', left('Ya se reveló: ' || r.titulo, 200), left(coalesce(r.adelanto, ''), 400), destino, r.production_id);
    exception when others then null;
    end;
    update anuncios set avisado_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function notify_anuncios() from public, anon, authenticated;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'darf_anuncios';
    perform cron.schedule('darf_anuncios', '*/15 * * * *', 'select public.notify_anuncios()');
  end if;
end $$;

create or replace function push_set_off(p_tipos text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Necesitas iniciar sesión'; end if;
  insert into push_prefs (user_id, apagados)
  values (auth.uid(), coalesce((select array_agg(distinct t) from unnest(p_tipos) t
                                 where t in ('contacto', 'audicion', 'orden', 'oferta', 'documento', 'ausencia', 'solicitud', 'boletos', 'equipo', 'cambio', 'prueba', 'anuncio', 'fanzone')), '{}'))
  on conflict (user_id) do update set apagados = excluded.apagados;
end $$;
revoke execute on function push_set_off(text[]) from public, anon;
grant execute on function push_set_off(text[]) to authenticated;

commit;
