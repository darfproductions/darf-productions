-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV".
-- Aplica la migración 0052 (Fan Zone ampliada). Si la base no es DEV, aborta.
begin;
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
end $$;

create table fanzone_items (
  id uuid primary key default gen_random_uuid(),
  production_id text not null references productions(id) on delete cascade,
  tipo text not null check (tipo in ('video', 'foto', 'documento', 'enlace', 'texto')),
  titulo text not null check (length(btrim(titulo)) between 1 and 160),
  descripcion text check (length(descripcion) <= 4000),
  youtube_id text check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  archivo_path text check (archivo_path like production_id || '/fanzone/%'),
  url text check (url ~* '^https://\S+$' and length(url) <= 500),
  destacado boolean not null default false,
  visible boolean not null default true,
  orden int not null default 0,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (tipo <> 'video' or youtube_id is not null),
  check (tipo not in ('foto', 'documento') or archivo_path is not null),
  check (tipo <> 'enlace' or url is not null),
  check (tipo <> 'texto' or length(btrim(coalesce(descripcion, ''))) > 0)
);
create index idx_fanzone_items_prod on fanzone_items(production_id, destacado desc, orden);

alter table fanzone_items enable row level security;
create policy fanzone_items_fans on fanzone_items for select to authenticated
  using (visible and production_is_visible(production_id));
create policy fanzone_items_team_read on fanzone_items for select to authenticated
  using (in_production_team(production_id));
create policy fanzone_items_editor on fanzone_items for all to authenticated
  using (has_perm(production_id, 'fanzone.editar')) with check (has_perm(production_id, 'fanzone.editar'));
revoke all on fanzone_items from anon;

-- Los ensayos de siempre pasan a la lista nueva, en su orden.
insert into fanzone_items (production_id, tipo, titulo, youtube_id, orden, created_by)
select production_id, 'video', titulo, youtube_id, row_number() over (partition by production_id order by orden, id), null
  from production_media where tipo = 'ensayo';

-- Mover un contenido arriba o abajo (intercambia con el vecino del mismo grupo).
create or replace function fanzone_move(iid uuid, arriba boolean) returns void
language plpgsql security definer set search_path = public as $$
declare a fanzone_items%rowtype; b fanzone_items%rowtype;
begin
  select * into a from fanzone_items where id = iid;
  if not found or not has_perm(a.production_id, 'fanzone.editar') then raise exception 'No autorizado'; end if;
  -- Normaliza el orden (1..n) para que no haya empates.
  update fanzone_items f set orden = x.n
    from (select id, row_number() over (order by destacado desc, orden, created_at) as n
            from fanzone_items where production_id = a.production_id) x
   where f.id = x.id and f.orden is distinct from x.n;
  select * into a from fanzone_items where id = iid;
  if arriba then
    select * into b from fanzone_items where production_id = a.production_id and destacado = a.destacado and orden < a.orden order by orden desc limit 1;
  else
    select * into b from fanzone_items where production_id = a.production_id and destacado = a.destacado and orden > a.orden order by orden limit 1;
  end if;
  if not found then return; end if;
  update fanzone_items set orden = b.orden where id = a.id;
  update fanzone_items set orden = a.orden where id = b.id;
end $$;

-- Cuántos contenidos tiene la Fan Zone de una obra (también sin sesión, solo el número).
create or replace function production_fanzone_count(pid text) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from fanzone_items where production_id = pid and visible and production_is_visible(pid)
$$;

-- El bucket de galería acepta también PDF (documentos de la Fan Zone), hasta 20 MB.
update storage.buckets
   set file_size_limit = 20971520,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
 where id = 'gallery';

revoke execute on function fanzone_move(uuid, boolean) from public, anon;
grant execute on function fanzone_move(uuid, boolean) to authenticated;
revoke execute on function production_fanzone_count(text) from public;
grant execute on function production_fanzone_count(text) to anon, authenticated;

create trigger audit_fanzone_items after insert or update or delete on fanzone_items for each row execute function audit_row();


insert into supabase_migrations.schema_migrations (version, name)
values ('20261012011527', '0052_fanzone_items') on conflict do nothing;
commit;
select 'OK: 0052 aplicada en DARF 2.0 DEV' as resultado;
