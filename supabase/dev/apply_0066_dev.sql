-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV".
-- Aplica la migración 0066 (equipo colaborativo, destacada y notificaciones). Si la base no es DEV, aborta.
begin;
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
end $$;
-- ════════ A. Equipo colaborativo ════════
create policy team_materials_member_insert on team_materials for insert to authenticated
  with check (is_team(production_id, auth.uid()) and created_by = auth.uid());
create policy team_materials_own on team_materials for update to authenticated
  using (created_by = auth.uid() and is_team(production_id, auth.uid()))
  with check (created_by = auth.uid() and is_team(production_id, auth.uid()));
create policy team_materials_own_remove on team_materials for delete to authenticated
  using (created_by = auth.uid() and is_team(production_id, auth.uid()));
create policy team_materials_own_read on team_materials for select to authenticated
  using (created_by = auth.uid());

create policy equipo_member_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'equipo' and split_part(name, '/', 2) = 'materiales'
              and is_team(team_path_production(name), auth.uid()));
create policy equipo_own_remove on storage.objects for delete to authenticated
  using (bucket_id = 'equipo' and owner = auth.uid());

create or replace function can_read_team_object(path text) returns boolean
language sql stable security definer set search_path = public as $$
  select team_can_manage(team_path_production(path))
      or exists (select 1 from storage.objects o where o.bucket_id = 'equipo' and o.name = path and o.owner = auth.uid())
      or exists (select 1 from team_materials m where m.archivo_path = path
                  and team_audience_includes(m.production_id, auth.uid(), m.audiencia, m.roles, m.personas))
      or exists (select 1 from team_meetings j where j.transcript_path = path
                  and team_audience_includes(j.production_id, auth.uid(), j.audiencia, j.roles, j.personas))
$$;

create table team_comments (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references team_materials(id) on delete cascade,
  autor uuid not null references auth.users(id) on delete cascade default auth.uid(),
  cuerpo text not null check (length(btrim(cuerpo)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index idx_team_comments_material on team_comments(material_id, created_at);

create or replace function team_material_visible(mid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_materials m where m.id = mid
                  and (team_can_manage(m.production_id) or m.created_by = auth.uid()
                       or team_audience_includes(m.production_id, auth.uid(), m.audiencia, m.roles, m.personas)))
$$;
create or replace function team_material_managed(mid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_materials m where m.id = mid and team_can_manage(m.production_id))
$$;

alter table team_comments enable row level security;
create policy team_comments_read on team_comments for select to authenticated using (team_material_visible(material_id));
create policy team_comments_write on team_comments for insert to authenticated
  with check (autor = auth.uid() and team_material_visible(material_id));
create policy team_comments_remove on team_comments for delete to authenticated
  using (autor = auth.uid() or team_material_managed(material_id));
revoke all on team_comments from anon;

-- Equipo del espacio (nombre y roles) para cualquiera del equipo: elegir a quién va algo y
-- poner nombre a autores. Sin correos.
create or replace function team_roster_public(pid text)
returns table (user_id uuid, nombre text, role_ids text[])
language plpgsql stable security definer set search_path = public as $$
begin
  if not (is_team(pid, auth.uid()) or team_can_manage(pid)) then raise exception 'No autorizado'; end if;
  return query
    with gente as (
      select distinct m.user_id as uid from production_members m join productions p on p.id = m.production_id
       where m.role_id <> 'integrante' and (m.production_id = pid or (pid is null and p.estado <> 'archivada'))
      union
      select pr.id from profiles pr where pid is null and pr.rol in ('staff', 'admin')
    )
    select g.uid, coalesce(nullif(btrim(pr.nombre), ''), 'Equipo'), team_member_roles(pid, g.uid)
      from gente g left join profiles pr on pr.id = g.uid
     order by 2;
end $$;

-- ════════ B. Reactivar ════════
create or replace function season_reopen(pid text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (is_admin() or has_perm(pid, 'obra.publicar')) then
    raise exception 'Solo el Director o quien publica la obra puede reactivarla.';
  end if;
  update productions set estado = 'publicada' where id = pid and estado = 'archivada';
  if not found then raise exception 'La obra no está concluida.'; end if;
  update season_closures set reabierto_at = now(), reabierto_por = auth.uid()
   where id = (select id from season_closures where production_id = pid and reabierto_at is null order by cerrado_at desc limit 1);
end $$;

-- ════════ C. Obra destacada en la portada ════════
alter table productions add column destacada boolean not null default false;
create unique index uq_productions_destacada on productions(destacada) where destacada;

create or replace function productions_edit_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  venta text[] := array['on_sale', 'price', 'capacity', 'attendees_historic'];
  estado text[] := array['estado', 'concluded', 'publicada_at'];
  sistema text[] := array['updated_at', 'destacada'];
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
  -- Destacar: solo por set_featured() (que revisa obra.publicar de la obra elegida).
  if new.destacada is distinct from old.destacada and coalesce(current_setting('darf.featured', true), '') <> '1' then
    raise exception 'Para destacar una obra usa "Destacar en portada".';
  end if;
  return new;
end $$;

create or replace function set_featured(pid text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if pid is null then
    if not (is_admin() or exists (select 1 from productions where destacada and has_perm(id, 'obra.publicar'))) then
      raise exception 'No autorizado';
    end if;
  else
    if not has_perm(pid, 'obra.publicar') then raise exception 'No autorizado'; end if;
    if not exists (select 1 from productions where id = pid and estado = 'publicada') then
      raise exception 'Solo se puede destacar una obra publicada.';
    end if;
  end if;
  perform set_config('darf.featured', '1', true);
  update productions set destacada = false where destacada and id is distinct from pid;
  if pid is not null then update productions set destacada = true where id = pid; end if;
  perform set_config('darf.featured', '', true);
end $$;

-- Al concluir, deja de estar destacada.
create or replace function productions_unfeature() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.estado <> 'publicada' and new.destacada then
    new.destacada := false;   -- corre después del guardia (orden alfabético de triggers)
  end if;
  return new;
end $$;
create trigger productions_unfeature before update of estado on productions for each row execute function productions_unfeature();

-- ════════ D. Notificaciones ════════
create table notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null,
  titulo text not null check (length(titulo) <= 200),
  detalle text check (length(detalle) <= 400),
  href text check (href is null or href like '/%'),
  production_id text references productions(id) on delete cascade,
  actor uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index idx_notifications_user on notifications(user_id, created_at desc);
create index idx_notifications_unread on notifications(user_id) where read_at is null;

alter table notifications enable row level security;
create policy notifications_own_read on notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_own_update on notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_own_remove on notifications for delete to authenticated using (user_id = auth.uid());
revoke all on notifications from anon, authenticated;
grant select, delete on notifications to authenticated;
grant update (read_at) on notifications to authenticated;

-- Reparte una notificación (nunca a quien hizo la acción).
create or replace function notify(uids uuid[], p_tipo text, p_titulo text, p_detalle text, p_href text, p_pid text) returns void
language sql security definer set search_path = public as $$
  insert into notifications (user_id, tipo, titulo, detalle, href, production_id, actor)
  select distinct u, p_tipo, left(p_titulo, 200), left(p_detalle, 400), p_href, p_pid, auth.uid()
    from unnest(uids) u
   where u is not null and u is distinct from auth.uid()
$$;

create or replace function admin_ids() returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(id), '{}') from profiles where rol = 'admin'
$$;

-- Quién tiene un permiso en una obra (por su rol en ella) + el Director.
create or replace function users_with_perm(pid text, perm text) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct m.user_id), '{}') || admin_ids()
    from production_members m join role_permissions rp on rp.role_id = m.role_id
   where m.production_id = pid and rp.permission_id = perm
$$;

create or replace function display_name(uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select nullif(btrim(nombre), '') from profiles where id = uid), 'Alguien')
$$;

create or replace function production_name(pid text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select nombre from productions where id = pid), 'DARF')
$$;

-- Equipo (y quien lo maneja) que debe enterarse de algo con audiencia.
create or replace function team_recipients(pid text, aud text, roles text[], personas uuid[]) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct x), '{}') from (
    select m.user_id as x from production_members m join productions p on p.id = m.production_id
     where m.role_id <> 'integrante' and (m.production_id = pid or (pid is null and p.estado <> 'archivada'))
       and team_audience_includes(pid, m.user_id, aud, roles, personas)
    union
    select pr.id from profiles pr where pid is null and pr.rol in ('staff', 'admin')
       and team_audience_includes(pid, pr.id, aud, roles, personas)
    union
    select unnest(case when pid is null then admin_ids() else users_with_perm(pid, 'equipo.gestionar') end)
  ) s
$$;

-- ──── Disparadores ────
create or replace function notify_contact() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform notify((select coalesce(array_agg(id), '{}') from profiles where rol in ('staff', 'admin')),
      'contacto', 'Nuevo mensaje de contacto', concat_ws(' · ', new.nombre, new.asunto), '/panel/contacto', null);
  exception when others then null;
  end;
  return new;
end $$;
create trigger notify_contact after insert on contact_messages for each row execute function notify_contact();

create or replace function notify_application() returns trigger
language plpgsql security definer set search_path = public as $$
declare a auditions%rowtype; dest uuid[];
begin
  begin
    if new.walk_in then return new; end if;
    select * into a from auditions where id = new.audition_id;
    dest := coalesce((select array_agg(m.user_id) from audition_members m join role_permissions rp on rp.role_id = m.role_id
                       where m.audition_id = a.id and rp.permission_id = 'audiciones.gestionar'), '{}');
    if a.production_id is not null then
      dest := dest || users_with_perm(a.production_id, 'audiciones.gestionar');
    elsif a.permanente then
      dest := dest || admin_ids() || coalesce((select array_agg(m.user_id) from production_members m join role_permissions rp on rp.role_id = m.role_id
                                                where rp.permission_id = 'audiciones.gestionar'), '{}');
    else
      dest := dest || admin_ids();
    end if;
    perform notify(dest, 'audicion', case when a.permanente then 'Nuevo registro de talento' else 'Nueva solicitud de audición' end,
      concat_ws(' · ', new.nombre, a.titulo), '/panel/audiciones/' || a.id || '/solicitudes', a.production_id);
  exception when others then null;
  end;
  return new;
end $$;
create trigger notify_application after insert on audition_applications for each row execute function notify_application();

create or replace function notify_order() returns trigger
language plpgsql security definer set search_path = public as $$
declare pid text;
begin
  begin
    if new.status <> 'pendiente' or new.created_by_staff_id is not null then return new; end if;
    select production_id into pid from performances where id = new.performance_id;
    perform notify(users_with_perm(pid, 'ventas.operar'), 'orden', 'Orden por aprobar: ' || production_name(pid),
      concat_ws(' · ', new.order_code, new.buyer_nombre), '/panel/producciones/' || pid || '/boletos?estado=pendiente', pid);
  exception when others then null;
  end;
  return new;
end $$;
create trigger notify_order after insert on orders for each row execute function notify_order();

create or replace function notify_offer() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.estado is distinct from old.estado and new.estado in ('aceptada', 'declinada') then
      perform notify(users_with_perm(new.production_id, 'elenco.gestionar'), 'oferta',
        display_name(new.user_id) || case when new.estado = 'aceptada' then ' aceptó ' else ' declinó ' end || 'la oferta',
        concat_ws(' · ', production_name(new.production_id), new.papel), '/panel/producciones/' || new.production_id || '/elenco', new.production_id);
    end if;
  exception when others then null;
  end;
  return new;
end $$;
create trigger notify_offer after update on casting_offers for each row execute function notify_offer();

create or replace function notify_doc() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.subido_at is not null and (tg_op = 'INSERT' or old.subido_at is distinct from new.subido_at) then
      perform notify(users_with_perm(new.production_id, 'expedientes.ver'), 'documento',
        display_name(new.user_id) || ' subió un documento',
        concat_ws(' · ', production_name(new.production_id), (select nombre from member_doc_types where id = new.doc_type_id)),
        '/panel/producciones/' || new.production_id || '/expedientes', new.production_id);
    end if;
  exception when others then null;
  end;
  return new;
end $$;
create trigger notify_doc after insert or update on member_docs for each row execute function notify_doc();

create or replace function notify_absence() returns trigger
language plpgsql security definer set search_path = public as $$
declare r rehearsals%rowtype;
begin
  begin
    select * into r from rehearsals where id = new.rehearsal_id;
    perform notify(users_with_perm(r.production_id, 'ensayos.gestionar'), 'ausencia',
      display_name(new.user_id) || ' avisó que no podrá ir', concat_ws(' · ', production_name(r.production_id), r.titulo, left(new.motivo, 120)),
      '/panel/producciones/' || r.production_id || '/ensayos', r.production_id);
  exception when others then null;
  end;
  return new;
end $$;
create trigger notify_absence after insert on rehearsal_absences for each row execute function notify_absence();

create or replace function team_href(pid text) returns text
language sql immutable as $$ select '/cuenta/equipo/' || coalesce(pid, 'general') $$;

create or replace function notify_team() returns trigger
language plpgsql security definer set search_path = public as $$
declare dest uuid[]; m team_materials%rowtype; obra text;
begin
  begin
    if tg_table_name = 'team_comments' then
      select * into m from team_materials where id = new.material_id;
      dest := team_recipients(m.production_id, m.audiencia, m.roles, m.personas) || m.created_by;
      dest := array(select u from unnest(dest) u where team_material_visible_for(m.id, u));
      perform notify(dest, 'equipo', display_name(new.autor) || ' comentó un material', concat_ws(' · ', m.titulo, left(new.cuerpo, 120)),
        team_href(m.production_id), m.production_id);
      return new;
    end if;
    obra := case when new.production_id is null then 'DARF' else production_name(new.production_id) end;
    if tg_table_name = 'team_notes' then
      if tg_op = 'INSERT' then
        dest := coalesce((select array_agg(x) from unnest(team_recipients(new.production_id, 'todos', '{}', '{}')) x
                           where team_note_recipient(new.production_id, x, new.para_roles, new.para_personas)), '{}');
        perform notify(dest, 'equipo', case when new.prioridad = 'urgente' then 'Nota URGENTE de dirección' else 'Nueva nota de dirección' end,
          concat_ws(' · ', obra, new.contexto, left(new.cuerpo, 120)), team_href(new.production_id), new.production_id);
      elsif new.atendida_at is not null and old.atendida_at is null then
        perform notify(array[new.created_by], 'equipo', display_name(new.atendida_por) || ' atendió tu nota',
          concat_ws(' · ', obra, new.respuesta), team_href(new.production_id), new.production_id);
      end if;
      return new;
    end if;
    if tg_table_name = 'team_materials' then
      perform notify(team_recipients(new.production_id, new.audiencia, new.roles, new.personas), 'equipo',
        display_name(new.created_by) || ' subió material', concat_ws(' · ', obra, new.titulo), team_href(new.production_id), new.production_id);
    elsif tg_table_name = 'team_announcements' then
      perform notify(team_recipients(new.production_id, new.audiencia, new.roles, new.personas), 'equipo',
        case when new.importante then 'Aviso importante del equipo' else 'Nuevo aviso del equipo' end, concat_ws(' · ', obra, new.titulo),
        team_href(new.production_id), new.production_id);
    elsif tg_table_name = 'team_meetings' then
      if tg_op = 'INSERT' then
        perform notify(team_recipients(new.production_id, new.audiencia, new.roles, new.personas), 'equipo',
          'Nueva ' || case new.tipo when 'junta' then 'junta' when 'llamado' then 'convocatoria a llamado' when 'montaje' then 'convocatoria a montaje' else 'cita' end,
          concat_ws(' · ', obra, new.titulo, to_char(new.inicia at time zone 'America/Mexico_City', 'DD/MM HH24:MI')), team_href(new.production_id), new.production_id);
      elsif new.estado = 'realizada' and old.estado = 'programada' then
        perform notify(team_recipients(new.production_id, new.audiencia, new.roles, new.personas), 'equipo',
          'Resumen de la junta disponible', concat_ws(' · ', obra, new.titulo), team_href(new.production_id), new.production_id);
      end if;
    end if;
  exception when others then null;
  end;
  return new;
end $$;

create or replace function team_material_visible_for(mid uuid, uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_materials m where m.id = mid
                  and (m.created_by = uid or team_audience_includes(m.production_id, uid, m.audiencia, m.roles, m.personas)
                       or (m.production_id is null and uid = any(admin_ids()))
                       or (m.production_id is not null and uid = any(users_with_perm(m.production_id, 'equipo.gestionar')))))
$$;

create trigger notify_team_materials after insert on team_materials for each row execute function notify_team();
create trigger notify_team_announcements after insert on team_announcements for each row execute function notify_team();
create trigger notify_team_notes after insert or update on team_notes for each row execute function notify_team();
create trigger notify_team_meetings after insert or update on team_meetings for each row execute function notify_team();
create trigger notify_team_comments after insert on team_comments for each row execute function notify_team();

-- Cambios de configuración (bitácora) → quien administra la obra y el Director.
create or replace function notify_config() returns trigger
language plpgsql security definer set search_path = public as $$
declare que text; dest uuid[];
begin
  begin
    que := case new.tabla
      when 'production_members' then 'Cambio de permisos del equipo'
      when 'role_permissions' then 'Cambio en un rol del panel'
      when 'panel_roles' then 'Cambio en los roles del panel'
      when 'productions' then 'Cambio en la página de la obra'
      when 'seats' then 'Cambio en el mapa de asientos'
      when 'season_closures' then 'Cierre o reapertura de temporada'
      when 'program_pages' then 'Cambio en el programa de mano'
      when 'fanzone_items' then 'Cambio en la Fan Zone'
      when 'team_members' then 'Cambio en el Equipo DARF'
    end;
    if que is null then return new; end if;
    dest := admin_ids();
    if new.production_id is not null then
      dest := dest || users_with_perm(new.production_id, 'permisos.gestionar') || users_with_perm(new.production_id, 'obra.publicar');
    end if;
    perform notify(dest, 'cambio', que, case when new.production_id is null then 'DARF' else production_name(new.production_id) end,
      case when new.production_id is null then '/panel/bitacora' else '/panel/producciones/' || new.production_id end, new.production_id);
  exception when others then null;
  end;
  return new;
end $$;
create trigger notify_config after insert on audit_log for each row execute function notify_config();

-- Lecturas para el panel.
create or replace function notifications_unread_count() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from notifications where user_id = auth.uid() and read_at is null
$$;

-- ════════ Permisos de las funciones ════════
revoke execute on function notify(uuid[], text, text, text, text, text), admin_ids(), users_with_perm(text, text),
  team_recipients(text, text, text[], uuid[]), team_material_visible_for(uuid, uuid), display_name(uuid), production_name(text),
  notify_contact(), notify_application(), notify_order(), notify_offer(), notify_doc(), notify_absence(), notify_team(), notify_config(),
  productions_unfeature() from public, anon, authenticated;
revoke execute on function team_material_visible(uuid), team_material_managed(uuid), team_roster_public(text),
  set_featured(text), notifications_unread_count() from public, anon;
grant execute on function team_material_visible(uuid), team_material_managed(uuid), team_roster_public(text),
  set_featured(text), notifications_unread_count() to authenticated;

create trigger audit_team_comments after insert or update or delete on team_comments for each row execute function audit_row();

commit;
