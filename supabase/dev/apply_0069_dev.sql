-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV".
-- 0069: franja de avisos abajo del Hero de cada obra. Requiere la 0068 ya aplicada.
-- Si la base no es DEV, aborta. Se corre completa en Supabase → SQL Editor (proyecto DARF 2.0 DEV).
begin;
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
end $$;
create table production_banner (
  production_id text primary key references productions(id) on delete cascade,
  estilo text not null default 'corre' check (estilo in ('corre', 'fija')),
  color text check (color ~ '^#[0-9a-fA-F]{6}$'),
  activa boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table production_banner_items (
  id uuid primary key default gen_random_uuid(),
  production_id text not null references productions(id) on delete cascade,
  texto text not null check (length(btrim(texto)) between 1 and 160),
  -- Solo ligas internas ("/…", no "//…") o https.
  enlace text check (length(enlace) <= 500 and (enlace ~ '^/($|[^/\\])' or enlace ~ '^https://[^\s]+$')),
  boton text check (length(boton) <= 30),
  inicia timestamptz,
  termina timestamptz,
  orden int not null default 0,
  check (termina is null or inicia is null or termina > inicia)
);
create index idx_production_banner_items_prod on production_banner_items(production_id, orden);

alter table production_banner enable row level security;
alter table production_banner_items enable row level security;

create policy production_banner_read on production_banner for select
  using (production_is_visible(production_id) or is_staff());
create policy production_banner_team_read on production_banner for select to authenticated
  using (in_production_team(production_id));
create policy production_banner_items_read on production_banner_items for select
  using (production_is_visible(production_id) or is_staff());
create policy production_banner_items_team_read on production_banner_items for select to authenticated
  using (in_production_team(production_id));
create policy production_banner_editor_write on production_banner for all to authenticated
  using (has_perm(production_id, 'obra.editar')) with check (has_perm(production_id, 'obra.editar'));
create policy production_banner_items_editor_write on production_banner_items for all to authenticated
  using (has_perm(production_id, 'obra.editar')) with check (has_perm(production_id, 'obra.editar'));

-- Guarda la franja completa de una vez (configuración + avisos en orden).
create or replace function panel_set_banner(pid text, p_estilo text, p_color text, p_activa boolean, items jsonb) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if not has_perm(pid, 'obra.editar') then raise exception 'No tienes permiso para editar esta obra.'; end if;
  if jsonb_array_length(coalesce(items, '[]'::jsonb)) > 10 then raise exception 'Máximo 10 avisos en la franja.'; end if;
  insert into production_banner (production_id, estilo, color, activa, updated_at, updated_by)
  values (pid, coalesce(p_estilo, 'corre'), nullif(btrim(coalesce(p_color, '')), ''), coalesce(p_activa, true), now(), auth.uid())
  on conflict (production_id) do update
    set estilo = excluded.estilo, color = excluded.color, activa = excluded.activa,
        updated_at = now(), updated_by = auth.uid();
  delete from production_banner_items where production_id = pid;
  insert into production_banner_items (production_id, texto, enlace, boton, inicia, termina, orden)
  select pid, btrim(e->>'texto'), nullif(btrim(coalesce(e->>'enlace', '')), ''), nullif(btrim(coalesce(e->>'boton', '')), ''),
         nullif(e->>'inicia', '')::timestamptz, nullif(e->>'termina', '')::timestamptz, n
    from jsonb_array_elements(coalesce(items, '[]'::jsonb)) with ordinality as x(e, n)
   where coalesce(btrim(e->>'texto'), '') <> '';
end $$;
revoke execute on function panel_set_banner(text, text, text, boolean, jsonb) from public, anon;
grant execute on function panel_set_banner(text, text, text, boolean, jsonb) to authenticated;

commit;
