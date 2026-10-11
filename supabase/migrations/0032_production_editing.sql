-- 0032: edición de obras por permisos (Fase 3, etapa 3B de DARF 2.0)
-- Hasta aquí solo el Director (admin) escribía obras y su contenido. Ahora cada
-- quien edita según su rol EN ESA OBRA (has_perm, 0031):
--   * obra.editar      → datos, kit, sinopsis, ficha, canciones, videos, agradecimientos, equipos
--   * elenco.gestionar → créditos (elenco y equipos) y sus fotos
--   * fanzone.editar   → ensayos y galerías
--   * obra.publicar    → cambiar el estado (publicar, archivar, ocultar, cancelar)
--   * ventas.operar    → poner en venta y precio base
-- El equipo de una obra la ve aunque esté en borrador. El Director sigue
-- pudiendo todo. Crear obras y duplicarlas: solo el Director.
-- Sin "drop": solo agrega políticas, funciones y triggers.

begin;

-- ¿Pertenece a la obra? (Director, staff global o cualquier rol en ella)
create or replace function in_production_team(pid text) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    exists (select 1 from profiles where id = auth.uid() and rol in ('admin', 'staff'))
    or exists (select 1 from production_members where user_id = auth.uid() and production_id = pid)
  )
$$;

-- ¿Puede dar de alta o corregir personas? (para elegir/crear gente en créditos)
create or replace function can_manage_people() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    exists (select 1 from profiles where id = auth.uid() and rol = 'admin')
    or exists (
      select 1 from production_members m join role_permissions rp on rp.role_id = m.role_id
      where m.user_id = auth.uid() and rp.permission_id in ('obra.editar', 'elenco.gestionar')
    )
  )
$$;

-- ──────── productions ────────
create policy productions_team_read on productions for select to authenticated
  using (in_production_team(id));
create policy productions_team_update on productions for update to authenticated
  using (has_perm(id, 'obra.editar') or has_perm(id, 'obra.publicar') or has_perm(id, 'ventas.operar'))
  with check (has_perm(id, 'obra.editar') or has_perm(id, 'obra.publicar') or has_perm(id, 'ventas.operar'));

-- Cada permiso cambia solo sus columnas. El Director y los procesos internos
-- (sin usuario, ej. migraciones) no pasan por esta revisión.
create or replace function productions_edit_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  venta text[] := array['on_sale', 'price', 'capacity', 'attendees_historic'];
  estado text[] := array['estado', 'concluded', 'publicada_at'];
  sistema text[] := array['updated_at'];
begin
  if tg_op = 'INSERT' then
    if new.id !~ '^[a-z0-9][a-z0-9_-]{1,39}$' then
      raise exception 'El identificador de la obra solo puede tener minúsculas, números y guiones (ej. teen-beach-2027).';
    end if;
    return new;
  end if;
  if auth.uid() is null or is_admin() then return new; end if;
  if new.id <> old.id then raise exception 'El identificador de la obra no se puede cambiar.'; end if;
  if (to_jsonb(new) - array['id'] - venta - estado - sistema) is distinct from (to_jsonb(old) - array['id'] - venta - estado - sistema)
     and not has_perm(old.id, 'obra.editar') then
    raise exception 'No tienes permiso para editar el contenido de esta obra.';
  end if;
  if (select jsonb_object_agg(k, to_jsonb(new) -> k) from unnest(venta) k)
     is distinct from (select jsonb_object_agg(k, to_jsonb(old) -> k) from unnest(venta) k)
     and not has_perm(old.id, 'ventas.operar') then
    raise exception 'Solo taquilla puede cambiar la venta o el precio de la obra.';
  end if;
  if (new.estado is distinct from old.estado or new.concluded is distinct from old.concluded)
     and not has_perm(old.id, 'obra.publicar') then
    raise exception 'No tienes permiso para publicar, archivar u ocultar esta obra.';
  end if;
  return new;
end $$;

create trigger productions_edit_guard before insert or update on productions
  for each row execute function productions_edit_guard();

-- ──────── Contenido de la obra ────────
create policy production_acts_team_read on production_acts for select to authenticated using (in_production_team(production_id));
create policy production_songs_team_read on production_songs for select to authenticated using (in_production_team(production_id));
create policy production_credits_team_read on production_credits for select to authenticated using (in_production_team(production_id));
create policy production_facts_team_read on production_facts for select to authenticated using (in_production_team(production_id));
create policy production_thanks_team_read on production_thanks for select to authenticated using (in_production_team(production_id));
create policy production_media_team_read on production_media for select to authenticated using (in_production_team(production_id));

create policy production_acts_editor_write on production_acts for all to authenticated
  using (has_perm(production_id, 'obra.editar')) with check (has_perm(production_id, 'obra.editar'));
create policy production_songs_editor_write on production_songs for all to authenticated
  using (has_perm(production_id, 'obra.editar')) with check (has_perm(production_id, 'obra.editar'));
create policy production_facts_editor_write on production_facts for all to authenticated
  using (has_perm(production_id, 'obra.editar')) with check (has_perm(production_id, 'obra.editar'));
create policy production_thanks_editor_write on production_thanks for all to authenticated
  using (has_perm(production_id, 'obra.editar')) with check (has_perm(production_id, 'obra.editar'));
create policy production_credits_editor_write on production_credits for all to authenticated
  using (has_perm(production_id, 'obra.editar') or has_perm(production_id, 'elenco.gestionar'))
  with check (has_perm(production_id, 'obra.editar') or has_perm(production_id, 'elenco.gestionar'));
-- Videos públicos: obra.editar. Ensayos (Fan Zone): fanzone.editar.
create policy production_media_editor_write on production_media for all to authenticated
  using (has_perm(production_id, case when tipo = 'ensayo' then 'fanzone.editar' else 'obra.editar' end))
  with check (has_perm(production_id, case when tipo = 'ensayo' then 'fanzone.editar' else 'obra.editar' end));

-- Personas: quien edita elenco o contenido en alguna obra puede buscar y dar de alta.
create policy people_team_read on people for select to authenticated
  using (
    can_manage_people()
    or exists (select 1 from production_credits c where c.person_id = people.id and in_production_team(c.production_id))
  );
create policy people_team_insert on people for insert to authenticated with check (can_manage_people());
create policy people_team_update on people for update to authenticated
  using (can_manage_people()) with check (can_manage_people());

-- Galería: fanzone.editar en la obra.
create policy gallery_photos_editor_write on gallery_photos for all to authenticated
  using (has_perm(production_id, 'fanzone.editar')) with check (has_perm(production_id, 'fanzone.editar'));

-- ──────── Archivos: cada obra en su carpeta ────────
-- producciones/<obra>/kit/...      → obra.editar
-- producciones/<obra>/creditos/... → obra.editar o elenco.gestionar
-- gallery/<obra>/...               → fanzone.editar
create or replace function can_write_object(bucket text, path text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when bucket = 'producciones' then
      has_perm(split_part(path, '/', 1), 'obra.editar')
      or (split_part(path, '/', 2) = 'creditos' and has_perm(split_part(path, '/', 1), 'elenco.gestionar'))
    when bucket = 'gallery' then has_perm(split_part(path, '/', 1), 'fanzone.editar')
    else false
  end
$$;

create policy team_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('producciones', 'gallery') and can_write_object(bucket_id, name));
create policy team_objects_update on storage.objects for update to authenticated
  using (bucket_id in ('producciones', 'gallery') and can_write_object(bucket_id, name))
  with check (bucket_id in ('producciones', 'gallery') and can_write_object(bucket_id, name));
create policy team_objects_delete on storage.objects for delete to authenticated
  using (bucket_id in ('producciones', 'gallery') and can_write_object(bucket_id, name));

-- ──────── Duplicar una obra (solo Director) ────────
-- Copia kit, textos y ficha; opcionalmente canciones, equipos (sin fotos: son
-- de cada obra) y permisos. La copia nace en borrador y sin venta.
create or replace function panel_duplicate_production(
  src text, p_id text, p_nombre text, p_temporada text,
  copiar_canciones boolean default true, copiar_equipos boolean default true, copiar_permisos boolean default false
) returns text
language plpgsql security definer set search_path = public as $$
declare a record; new_act uuid;
begin
  if not is_admin() then raise exception 'Solo el Director puede duplicar obras.'; end if;
  if not exists (select 1 from productions where id = src) then raise exception 'La obra original no existe.'; end if;
  if exists (select 1 from productions where id = p_id) then raise exception 'Ya existe una obra con ese identificador.'; end if;

  insert into productions (id, nombre, venue, price, estado, frase, sinopsis, temporada, duracion, clasificacion, basada_en,
                           color_fondo, color_superficie, color_texto, color_acento, logo_path, ambiente_path)
  select p_id, p_nombre, venue, price, 'borrador', frase, sinopsis, p_temporada, duracion, clasificacion, basada_en,
         color_fondo, color_superficie, color_texto, color_acento, logo_path, ambiente_path
    from productions where id = src;

  insert into production_facts (production_id, etiqueta, valor, orden)
  select p_id, etiqueta, valor, orden from production_facts where production_id = src;

  if copiar_canciones then
    for a in select * from production_acts where production_id = src order by orden loop
      insert into production_acts (production_id, nombre, orden) values (p_id, a.nombre, a.orden) returning id into new_act;
      insert into production_songs (production_id, act_id, titulo, orden)
      select p_id, new_act, titulo, orden from production_songs where act_id = a.id;
    end loop;
    insert into production_songs (production_id, act_id, titulo, orden)
    select p_id, null, titulo, orden from production_songs where production_id = src and act_id is null;
  end if;

  if copiar_equipos then
    insert into production_credits (production_id, person_id, tipo, papel, orden)
    select p_id, person_id, tipo, papel, orden from production_credits
     where production_id = src and tipo in ('creativo', 'produccion', 'crew', 'tecnico');
  end if;

  if copiar_permisos then
    insert into production_members (production_id, user_id, role_id, created_by)
    select p_id, user_id, role_id, auth.uid() from production_members where production_id = src;
  end if;

  return p_id;
end $$;

revoke execute on function in_production_team(text) from public, anon;
revoke execute on function can_manage_people() from public, anon;
revoke execute on function can_write_object(text, text) from public, anon;
revoke execute on function productions_edit_guard() from public, anon;
revoke execute on function panel_duplicate_production(text, text, text, text, boolean, boolean, boolean) from public, anon;
grant execute on function in_production_team(text) to authenticated;
grant execute on function can_manage_people() to authenticated;
grant execute on function can_write_object(text, text) to authenticated;
grant execute on function panel_duplicate_production(text, text, text, text, boolean, boolean, boolean) to authenticated;

commit;
