-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV".
-- Aplica la migración 0033 (guardar listas "todo o nada"). El conector se queda
-- esperando confirmación ante un DELETE, por eso este script se corre a mano en
-- Supabase → SQL Editor. Si la base no es DEV, aborta sin hacer nada.
begin;
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
end $$;

create or replace function panel_set_songs(pid text, actos jsonb) returns void
language plpgsql security invoker set search_path = public as $$
declare a jsonb; i int := 0; act uuid;
begin
  if not has_perm(pid, 'obra.editar') then raise exception 'No tienes permiso para editar las canciones de esta obra.'; end if;
  delete from production_songs where production_id = pid;
  delete from production_acts where production_id = pid;
  for a in select value from jsonb_array_elements(coalesce(actos, '[]'::jsonb)) loop
    i := i + 1;
    act := null;
    if coalesce(btrim(a->>'nombre'), '') <> '' then
      insert into production_acts (production_id, nombre, orden) values (pid, btrim(a->>'nombre'), i) returning id into act;
    end if;
    insert into production_songs (production_id, act_id, titulo, orden)
    select pid, act, btrim(t), n
      from jsonb_array_elements_text(coalesce(a->'canciones', '[]'::jsonb)) with ordinality as x(t, n)
     where btrim(t) <> '';
  end loop;
end $$;

create or replace function panel_set_thanks(pid text, items text[]) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if not has_perm(pid, 'obra.editar') then raise exception 'No tienes permiso para editar esta obra.'; end if;
  delete from production_thanks where production_id = pid;
  insert into production_thanks (production_id, texto, orden)
  select pid, btrim(t), n from unnest(coalesce(items, '{}')) with ordinality as x(t, n) where btrim(t) <> '';
end $$;

create or replace function panel_set_facts(pid text, items jsonb) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if not has_perm(pid, 'obra.editar') then raise exception 'No tienes permiso para editar esta obra.'; end if;
  delete from production_facts where production_id = pid;
  insert into production_facts (production_id, etiqueta, valor, orden)
  select pid, btrim(e->>'etiqueta'), btrim(e->>'valor'), n
    from jsonb_array_elements(coalesce(items, '[]'::jsonb)) with ordinality as x(e, n)
   where coalesce(btrim(e->>'etiqueta'), '') <> '' and coalesce(btrim(e->>'valor'), '') <> '';
end $$;

-- Videos públicos (tipo 'video', obra.editar) o ensayos de la Fan Zone (tipo 'ensayo', fanzone.editar).
create or replace function panel_set_media(pid text, p_tipo text, items jsonb) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if p_tipo not in ('video', 'ensayo') then raise exception 'Tipo de video no válido.'; end if;
  if not has_perm(pid, case when p_tipo = 'ensayo' then 'fanzone.editar' else 'obra.editar' end) then
    raise exception 'No tienes permiso para editar estos videos.';
  end if;
  delete from production_media where production_id = pid and tipo = p_tipo;
  insert into production_media (production_id, tipo, titulo, youtube_id, visibilidad, orden)
  select pid, p_tipo, btrim(e->>'titulo'), btrim(e->>'youtube_id'),
         case when p_tipo = 'ensayo' then 'fans' else 'publico' end, n
    from jsonb_array_elements(coalesce(items, '[]'::jsonb)) with ordinality as x(e, n)
   where coalesce(btrim(e->>'youtube_id'), '') <> '';
end $$;

revoke execute on function panel_set_songs(text, jsonb) from public, anon;
revoke execute on function panel_set_thanks(text, text[]) from public, anon;
revoke execute on function panel_set_facts(text, jsonb) from public, anon;
revoke execute on function panel_set_media(text, text, jsonb) from public, anon;
grant execute on function panel_set_songs(text, jsonb) to authenticated;
grant execute on function panel_set_thanks(text, text[]) to authenticated;
grant execute on function panel_set_facts(text, jsonb) to authenticated;
grant execute on function panel_set_media(text, text, jsonb) to authenticated;

insert into supabase_migrations.schema_migrations (version, name)
values ('20261011190000', '0033_panel_list_editors') on conflict do nothing;
commit;
select 'OK: 0033 aplicada en DARF 2.0 DEV' as resultado;
