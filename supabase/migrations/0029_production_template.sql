-- 0029: plantilla de producción (Fase 2 de DARF 2.0)
-- Toda obra se presenta con la MISMA plantilla (docs/DARF-2.0-PRODUCCIONES.md).
-- Aquí vive su contenido: kit visual (logo, ambiente, 4 colores, frase), ficha,
-- actos y canciones, créditos con foto POR OBRA, videos y agradecimientos.
--
-- No toca la boletería: productions.id, on_sale, concluded, funciones, asientos,
-- órdenes y RPC siguen igual. Reglas nuevas:
--   * estado: borrador | publicada | archivada | cancelada | oculta.
--     El público solo ve 'publicada' y 'archivada' (staff ve todo).
--   * No se puede publicar ni archivar sin el kit completo y legible
--     (mismas reglas de contraste que la web: web/src/lib/kit-rules.ts).
--   * archivada ⇔ concluded (se sincronizan solos, así el panel 1.0 sigue sirviendo).
--   * Solo una obra 'publicada' puede estar en venta.
-- Sin "drop": la migración solo agrega (las políticas existentes se cambian con alter).

begin;

-- ──────── Contraste WCAG (misma fórmula que kit-rules.ts) ────────
create or replace function darf_luminance(hex text) returns numeric
language plpgsql immutable as $$
declare
  w numeric[] := array[0.2126, 0.7152, 0.0722];
  v numeric;
  l numeric := 0;
begin
  for i in 0..2 loop
    v := (('x' || substr(hex, 2 + i * 2, 2))::bit(8)::int) / 255.0;
    v := case when v <= 0.03928 then v / 12.92 else power((v + 0.055) / 1.055, 2.4) end;
    l := l + w[i + 1] * v;
  end loop;
  return l;
end $$;

create or replace function darf_contrast(a text, b text) returns numeric
language sql immutable as $$
  select (greatest(darf_luminance(a), darf_luminance(b)) + 0.05)
       / (least(darf_luminance(a), darf_luminance(b)) + 0.05)
$$;

-- ──────── productions: kit y ficha ────────
alter table productions
  add column if not exists estado text not null default 'borrador'
    constraint productions_estado_valido
    check (estado in ('borrador', 'publicada', 'archivada', 'cancelada', 'oculta')),
  add column if not exists frase text
    constraint productions_frase_corta check (char_length(frase) <= 120),
  add column if not exists sinopsis text,               -- párrafos separados por una línea en blanco
  add column if not exists temporada text,
  add column if not exists duracion text,
  add column if not exists clasificacion text,
  add column if not exists basada_en text,
  add column if not exists color_fondo text
    constraint productions_color_fondo_hex check (color_fondo ~ '^#[0-9a-fA-F]{6}$'),
  add column if not exists color_superficie text
    constraint productions_color_superficie_hex check (color_superficie ~ '^#[0-9a-fA-F]{6}$'),
  add column if not exists color_texto text
    constraint productions_color_texto_hex check (color_texto ~ '^#[0-9a-fA-F]{6}$'),
  add column if not exists color_acento text
    constraint productions_color_acento_hex check (color_acento ~ '^#[0-9a-fA-F]{6}$'),
  add column if not exists logo_path text,              -- bucket 'producciones': <obra>/kit/...
  add column if not exists ambiente_path text,
  add column if not exists publicada_at timestamptz;
-- 'fecha' (ya existente) es el campo "Fechas" de la ficha; 'venue' es la Sede.

create index if not exists idx_productions_estado on productions(estado);

-- Qué le falta a una obra para poder publicarse (vacío = lista). El panel lo usará.
create or replace function production_kit_problems(p productions) returns text[]
language plpgsql immutable as $$
declare out text[] := '{}';
begin
  if coalesce(btrim(p.logo_path), '') = '' then out := array_append(out, 'Falta el logo.'); end if;
  if coalesce(btrim(p.ambiente_path), '') = '' then out := array_append(out, 'Falta la imagen de ambiente.'); end if;
  if coalesce(btrim(p.frase), '') = '' then out := array_append(out, 'Falta la frase corta.'); end if;
  if p.color_fondo is null or p.color_superficie is null or p.color_texto is null or p.color_acento is null then
    return array_append(out, 'Faltan colores del kit.');
  end if;
  if darf_contrast(p.color_texto, p.color_fondo) < 4.5 then
    out := array_append(out, 'El texto no se lee sobre el fondo (mínimo 4.5:1).'); end if;
  if darf_contrast(p.color_texto, p.color_superficie) < 4.5 then
    out := array_append(out, 'El texto no se lee sobre la superficie (mínimo 4.5:1).'); end if;
  if darf_contrast(p.color_acento, p.color_fondo) < 3 then
    out := array_append(out, 'El acento no se distingue del fondo (mínimo 3:1).'); end if;
  return out;
end $$;

create or replace function productions_template_guard() returns trigger
language plpgsql as $$
declare problems text[];
begin
  -- archivada ⇔ concluded (quien cambie uno, cambia el otro).
  if tg_op = 'UPDATE' and new.concluded is distinct from old.concluded and new.estado = old.estado then
    if new.concluded then
      new.estado := 'archivada';
    elsif old.estado = 'archivada' then
      new.estado := 'publicada';
    end if;
  end if;
  if tg_op = 'INSERT' and new.concluded and new.estado = 'borrador' then
    new.estado := 'archivada';
  end if;
  new.concluded := (new.estado = 'archivada');

  if new.on_sale and new.estado <> 'publicada' then
    raise exception 'Solo una producción publicada puede estar en venta.';
  end if;

  if new.estado in ('publicada', 'archivada') then
    problems := production_kit_problems(new);
    if cardinality(problems) > 0 then
      raise exception 'No se puede publicar "%": %', new.nombre, array_to_string(problems, ' ');
    end if;
    new.publicada_at := coalesce(new.publicada_at, now());
  end if;
  return new;
end $$;

create trigger productions_template_guard
  before insert or update on productions
  for each row execute function productions_template_guard();

-- Lectura pública: solo obras publicadas o archivadas; staff ve todo.
alter policy productions_public_read on productions
  using (estado in ('publicada', 'archivada') or is_staff());

-- Visible para el público (las tablas hijas siguen la visibilidad de su obra).
create or replace function production_is_visible(pid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from productions where id = pid and estado in ('publicada', 'archivada'))
$$;
revoke execute on function production_is_visible(text) from public;
grant execute on function production_is_visible(text) to anon, authenticated;

-- ──────── Canciones (actos opcionales; numeración continua por orden) ────────
create table production_acts (
  id uuid primary key default gen_random_uuid(),
  production_id text not null references productions(id) on delete cascade,
  nombre text not null default '',
  orden int not null default 0,
  unique (id, production_id)
);

create table production_songs (
  id uuid primary key default gen_random_uuid(),
  production_id text not null references productions(id) on delete cascade,
  act_id uuid,                                           -- null = la obra no usa actos
  titulo text not null check (btrim(titulo) <> ''),
  orden int not null default 0,
  foreign key (act_id, production_id) references production_acts(id, production_id) on delete cascade
);

-- ──────── Personas (identidad; la foto es de cada obra) ────────
create table people (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (btrim(nombre) <> ''),
  profile_id uuid unique references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index idx_people_nombre on people (lower(nombre));

create table production_credits (
  id uuid primary key default gen_random_uuid(),
  production_id text not null references productions(id) on delete cascade,
  person_id uuid not null references people(id) on delete restrict,
  tipo text not null check (tipo in ('reparto', 'ensamble', 'creativo', 'produccion', 'crew', 'tecnico')),
  papel text,                                            -- personaje (reparto) o puesto (equipos)
  foto_path text,                                        -- retrato de ESTA obra: <obra>/creditos/...
  orden int not null default 0,
  check (tipo = 'ensamble' or coalesce(btrim(papel), '') <> '')
);

-- ──────── Videos, ficha extra y agradecimientos ────────
create table production_media (
  id uuid primary key default gen_random_uuid(),
  production_id text not null references productions(id) on delete cascade,
  tipo text not null check (tipo in ('video', 'ensayo')),
  titulo text not null,
  youtube_id text not null check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  visibilidad text not null default 'publico' check (visibilidad in ('publico', 'fans')),
  orden int not null default 0
);

create table production_facts (
  id uuid primary key default gen_random_uuid(),
  production_id text not null references productions(id) on delete cascade,
  etiqueta text not null,
  valor text not null,
  orden int not null default 0
);

create table production_thanks (
  id uuid primary key default gen_random_uuid(),
  production_id text not null references productions(id) on delete cascade,
  texto text not null,
  orden int not null default 0
);

create index idx_production_acts_prod on production_acts(production_id, orden);
create index idx_production_songs_prod on production_songs(production_id, orden);
create index idx_production_songs_act on production_songs(act_id);
create index idx_production_credits_prod on production_credits(production_id, tipo, orden);
create index idx_production_credits_person on production_credits(person_id);
create index idx_production_media_prod on production_media(production_id, tipo, orden);
create index idx_production_facts_prod on production_facts(production_id, orden);
create index idx_production_thanks_prod on production_thanks(production_id, orden);

-- ──────── RLS: lectura según la obra; escritura solo admin (Fase 3: por obra) ────────
alter table production_acts enable row level security;
alter table production_songs enable row level security;
alter table people enable row level security;
alter table production_credits enable row level security;
alter table production_media enable row level security;
alter table production_facts enable row level security;
alter table production_thanks enable row level security;

create policy production_acts_read on production_acts for select
  using (production_is_visible(production_id) or is_staff());
create policy production_songs_read on production_songs for select
  using (production_is_visible(production_id) or is_staff());
create policy production_credits_read on production_credits for select
  using (production_is_visible(production_id) or is_staff());
create policy production_facts_read on production_facts for select
  using (production_is_visible(production_id) or is_staff());
create policy production_thanks_read on production_thanks for select
  using (production_is_visible(production_id) or is_staff());
-- Ensayos: solo personas con cuenta (Fan Zone).
create policy production_media_read on production_media for select
  using (
    is_staff()
    or (production_is_visible(production_id)
        and (visibilidad = 'publico' or auth.uid() is not null))
  );
-- Personas: el público solo ve nombres que aparecen en una obra visible.
create policy people_read on people for select
  using (
    is_staff()
    or exists (select 1 from production_credits c
               where c.person_id = people.id and production_is_visible(c.production_id))
  );

create policy production_acts_admin_write on production_acts for all to authenticated
  using (is_admin()) with check (is_admin());
create policy production_songs_admin_write on production_songs for all to authenticated
  using (is_admin()) with check (is_admin());
create policy people_admin_write on people for all to authenticated
  using (is_admin()) with check (is_admin());
create policy production_credits_admin_write on production_credits for all to authenticated
  using (is_admin()) with check (is_admin());
create policy production_media_admin_write on production_media for all to authenticated
  using (is_admin()) with check (is_admin());
create policy production_facts_admin_write on production_facts for all to authenticated
  using (is_admin()) with check (is_admin());
create policy production_thanks_admin_write on production_thanks for all to authenticated
  using (is_admin()) with check (is_admin());

-- El vínculo persona ↔ cuenta no es público: anon solo lee id y nombre.
revoke select on people from anon;
grant select (id, nombre) on people to anon;

-- ──────── Storage: bucket 'producciones' (kit y retratos por obra) ────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('producciones', 'producciones', true, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = 8388608,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

create policy producciones_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'producciones' and is_admin());
create policy producciones_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'producciones' and is_admin()) with check (bucket_id = 'producciones' and is_admin());
create policy producciones_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'producciones' and is_admin());

-- ──────── Verificación ────────
do $$
begin
  if round(darf_contrast('#000000', '#ffffff'), 2) <> 21.00 then
    raise exception 'darf_contrast no coincide con la web';
  end if;
  if not exists (select 1 from storage.buckets where id = 'producciones' and public) then
    raise exception 'Falta el bucket producciones';
  end if;
end $$;

commit;
