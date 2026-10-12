-- 0065: Portal del equipo (pedido de Diego, 2026-10-12).
--   * "Equipo" de una producción = quien tiene un rol del panel en ella (todo menos 'integrante').
--     Además hay un espacio GENERAL de DARF (production_id null): todo el equipo de cualquier
--     obra no archivada y las cuentas staff/Director.
--   * Cuatro cosas para el equipo: materiales, avisos con "Enterado", notas de dirección (a
--     roles o personas; quien la recibe la marca atendida y responde) y juntas/llamados (al
--     terminar se sube el resumen, los acuerdos y el transcript).
--   * Las maneja quien tiene el permiso nuevo equipo.gestionar en la obra (Producción y
--     Dirección artística); el espacio general, solo el Director.
-- Precede: 0064. Cambia permisos (permiso nuevo; aprobado por Diego en el plan).

begin;

-- ──────── Permiso ────────
insert into permissions (id, grupo, descripcion, orden) values
  ('equipo.gestionar', 'Equipo', 'Portal del equipo: materiales, avisos, notas de dirección y juntas', 42);
alter table role_permissions disable trigger role_permissions_protect;
insert into role_permissions (role_id, permission_id) values ('productor', 'equipo.gestionar'), ('direccion', 'equipo.gestionar');
alter table role_permissions enable trigger role_permissions_protect;

-- ──────── Quién es del equipo ────────
create or replace function team_can_manage(pid text) returns boolean
language sql stable security definer set search_path = public as $$
  select case when pid is null then is_admin() else has_perm(pid, 'equipo.gestionar') end
$$;

-- Roles de la persona en el equipo (en el general: los de cualquier obra no archivada).
create or replace function team_member_roles(pid text, uid uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct m.role_id), '{}')
    from production_members m join productions p on p.id = m.production_id
   where m.user_id = uid and m.role_id <> 'integrante'
     and (m.production_id = pid or (pid is null and p.estado <> 'archivada'))
$$;

create or replace function is_team(pid text, uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select cardinality(team_member_roles(pid, uid)) > 0
      or (pid is null and exists (select 1 from profiles where id = uid and rol in ('staff', 'admin')))
$$;

create or replace function team_audience_includes(pid text, uid uuid, aud text, roles text[], personas uuid[]) returns boolean
language sql stable security definer set search_path = public as $$
  select is_team(pid, uid) and (
    aud = 'todos'
    or (aud = 'roles' and roles && team_member_roles(pid, uid))
    or (aud = 'personas' and uid = any(personas)))
$$;

create or replace function team_note_recipient(pid text, uid uuid, para_roles text[], para_personas uuid[]) returns boolean
language sql stable security definer set search_path = public as $$
  select is_team(pid, uid) and (uid = any(para_personas) or para_roles && team_member_roles(pid, uid))
$$;

-- ──────── Tablas ────────
create table team_materials (
  id uuid primary key default gen_random_uuid(),
  production_id text references productions(id) on delete cascade,
  titulo text not null check (length(btrim(titulo)) between 1 and 160),
  descripcion text check (length(descripcion) <= 2000),
  carpeta text check (length(carpeta) <= 80),
  archivo_path text,
  url text check (url is null or (url ~* '^https://\S+$' and length(url) <= 500)),
  audiencia text not null default 'todos' check (audiencia in ('todos', 'roles', 'personas')),
  roles text[] not null default '{}',
  personas uuid[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check ((archivo_path is null) <> (url is null)),
  check (archivo_path is null or archivo_path like coalesce(production_id, 'general') || '/%'),
  check (audiencia <> 'roles' or cardinality(roles) > 0),
  check (audiencia <> 'personas' or cardinality(personas) > 0)
);
create index idx_team_materials_prod on team_materials(production_id, carpeta);

create table team_announcements (
  id uuid primary key default gen_random_uuid(),
  production_id text references productions(id) on delete cascade,
  titulo text not null check (length(btrim(titulo)) between 1 and 160),
  cuerpo text not null check (length(btrim(cuerpo)) between 1 and 5000),
  importante boolean not null default false,
  audiencia text not null default 'todos' check (audiencia in ('todos', 'roles', 'personas')),
  roles text[] not null default '{}',
  personas uuid[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (audiencia <> 'roles' or cardinality(roles) > 0),
  check (audiencia <> 'personas' or cardinality(personas) > 0)
);
create index idx_team_announcements_prod on team_announcements(production_id, created_at desc);

create table team_announcement_reads (
  announcement_id uuid not null references team_announcements(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

create table team_notes (
  id uuid primary key default gen_random_uuid(),
  production_id text references productions(id) on delete cascade,
  contexto text check (length(contexto) <= 120),
  rehearsal_id uuid references rehearsals(id) on delete set null,
  cuerpo text not null check (length(btrim(cuerpo)) between 1 and 3000),
  para_roles text[] not null default '{}',
  para_personas uuid[] not null default '{}',
  prioridad text not null default 'normal' check (prioridad in ('normal', 'urgente')),
  atendida_at timestamptz,
  atendida_por uuid references auth.users(id) on delete set null,
  respuesta text check (length(respuesta) <= 2000),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (cardinality(para_roles) + cardinality(para_personas) > 0)
);
create index idx_team_notes_prod on team_notes(production_id, created_at desc);

create table team_meetings (
  id uuid primary key default gen_random_uuid(),
  production_id text references productions(id) on delete cascade,
  tipo text not null default 'junta' check (tipo in ('junta', 'llamado', 'montaje', 'otro')),
  titulo text not null check (length(btrim(titulo)) between 1 and 160),
  inicia timestamptz not null,
  termina timestamptz,
  lugar text check (length(lugar) <= 160),
  enlace text check (enlace is null or (enlace ~* '^https://\S+$' and length(enlace) <= 500)),
  agenda text check (length(agenda) <= 5000),
  audiencia text not null default 'todos' check (audiencia in ('todos', 'roles', 'personas')),
  roles text[] not null default '{}',
  personas uuid[] not null default '{}',
  estado text not null default 'programada' check (estado in ('programada', 'realizada')),
  resumen text check (length(resumen) <= 20000),
  acuerdos jsonb not null default '[]' check (jsonb_typeof(acuerdos) = 'array' and jsonb_array_length(acuerdos) <= 60),
  transcript_path text,
  transcript_texto text check (length(transcript_texto) <= 200000),
  grabacion_url text check (grabacion_url is null or (grabacion_url ~* '^https://\S+$' and length(grabacion_url) <= 500)),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (termina is null or termina > inicia),
  check (transcript_path is null or transcript_path like coalesce(production_id, 'general') || '/%'),
  check (audiencia <> 'roles' or cardinality(roles) > 0),
  check (audiencia <> 'personas' or cardinality(personas) > 0)
);
create index idx_team_meetings_prod on team_meetings(production_id, inicia);

-- ──────── Reglas de acceso ────────
alter table team_materials enable row level security;
alter table team_announcements enable row level security;
alter table team_announcement_reads enable row level security;
alter table team_notes enable row level security;
alter table team_meetings enable row level security;

create policy team_materials_manage on team_materials for all to authenticated
  using (team_can_manage(production_id)) with check (team_can_manage(production_id));
create policy team_materials_read on team_materials for select to authenticated
  using (team_audience_includes(production_id, auth.uid(), audiencia, roles, personas));

create policy team_announcements_manage on team_announcements for all to authenticated
  using (team_can_manage(production_id)) with check (team_can_manage(production_id));
create policy team_announcements_read on team_announcements for select to authenticated
  using (team_audience_includes(production_id, auth.uid(), audiencia, roles, personas));

create or replace function team_announcement_for_me(aid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_announcements a where a.id = aid
                  and team_audience_includes(a.production_id, auth.uid(), a.audiencia, a.roles, a.personas))
$$;
create or replace function team_announcement_managed(aid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_announcements a where a.id = aid and team_can_manage(a.production_id))
$$;
create policy team_reads_own on team_announcement_reads for select to authenticated using (user_id = auth.uid());
create policy team_reads_mark on team_announcement_reads for insert to authenticated
  with check (user_id = auth.uid() and team_announcement_for_me(announcement_id));
create policy team_reads_manage on team_announcement_reads for select to authenticated
  using (team_announcement_managed(announcement_id));

create policy team_notes_manage on team_notes for all to authenticated
  using (team_can_manage(production_id)) with check (team_can_manage(production_id));
create policy team_notes_read on team_notes for select to authenticated
  using (team_note_recipient(production_id, auth.uid(), para_roles, para_personas));
create policy team_notes_attend on team_notes for update to authenticated
  using (team_note_recipient(production_id, auth.uid(), para_roles, para_personas))
  with check (team_note_recipient(production_id, auth.uid(), para_roles, para_personas));

-- Quien recibe la nota solo la marca atendida y responde; lo demás no cambia.
create or replace function team_notes_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not team_can_manage(old.production_id) then
    new.production_id := old.production_id; new.contexto := old.contexto; new.rehearsal_id := old.rehearsal_id;
    new.cuerpo := old.cuerpo; new.para_roles := old.para_roles; new.para_personas := old.para_personas;
    new.prioridad := old.prioridad; new.created_by := old.created_by; new.created_at := old.created_at;
    if new.atendida_at is distinct from old.atendida_at then
      new.atendida_por := case when new.atendida_at is null then null else auth.uid() end;
    else
      new.atendida_por := old.atendida_por;
    end if;
  end if;
  return new;
end $$;
create trigger team_notes_guard before update on team_notes for each row execute function team_notes_guard();

create policy team_meetings_manage on team_meetings for all to authenticated
  using (team_can_manage(production_id)) with check (team_can_manage(production_id));
create policy team_meetings_read on team_meetings for select to authenticated
  using (team_audience_includes(production_id, auth.uid(), audiencia, roles, personas));

revoke all on team_materials, team_announcements, team_announcement_reads, team_notes, team_meetings from anon;

-- ──────── Archivos (bucket privado 'equipo': <obra|general>/...) ────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('equipo', 'equipo', false, 52428800, array[
  'application/pdf', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/x-wav', 'audio/aac', 'audio/ogg',
  'image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'])
on conflict (id) do update set public = false, file_size_limit = 52428800, allowed_mime_types = excluded.allowed_mime_types;

create or replace function team_path_production(path text) returns text
language sql immutable as $$
  select nullif(split_part(path, '/', 1), 'general')
$$;

create or replace function can_read_team_object(path text) returns boolean
language sql stable security definer set search_path = public as $$
  select team_can_manage(team_path_production(path))
      or exists (select 1 from team_materials m where m.archivo_path = path
                  and team_audience_includes(m.production_id, auth.uid(), m.audiencia, m.roles, m.personas))
      or exists (select 1 from team_meetings j where j.transcript_path = path
                  and team_audience_includes(j.production_id, auth.uid(), j.audiencia, j.roles, j.personas))
$$;
create policy equipo_read on storage.objects for select to authenticated
  using (bucket_id = 'equipo' and can_read_team_object(name));
create policy equipo_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'equipo' and team_can_manage(team_path_production(name)));
create policy equipo_remove on storage.objects for delete to authenticated
  using (bucket_id = 'equipo' and team_can_manage(team_path_production(name)));

-- ──────── Lecturas para el portal y el panel ────────
-- Mis espacios del equipo: cada obra donde tengo un rol del panel y, si aplica, el general.
create or replace function my_team_productions()
returns table (production_id text, nombre text, roles text[])
language sql stable security definer set search_path = public as $$
  select p.id, p.nombre,
         array(select r.nombre from panel_roles r where r.id = any(team_member_roles(p.id, auth.uid())) order by r.orden)
    from productions p
   where p.estado <> 'archivada' and cardinality(team_member_roles(p.id, auth.uid())) > 0
  union all
  select null, 'DARF (general)', '{}'::text[] where is_team(null, auth.uid())
  order by 1 nulls first, 2
$$;

-- Pendientes por espacio: avisos sin "Enterado" y notas sin atender.
create or replace function my_team_unread()
returns table (production_id text, avisos int, notas int)
language sql stable security definer set search_path = public as $$
  with espacios as (select t.production_id from my_team_productions() t)
  select e.production_id,
         (select count(*)::int from team_announcements a
           where a.production_id is not distinct from e.production_id
             and team_audience_includes(a.production_id, auth.uid(), a.audiencia, a.roles, a.personas)
             and not exists (select 1 from team_announcement_reads r where r.announcement_id = a.id and r.user_id = auth.uid())),
         (select count(*)::int from team_notes n
           where n.production_id is not distinct from e.production_id and n.atendida_at is null
             and team_note_recipient(n.production_id, auth.uid(), n.para_roles, n.para_personas))
    from espacios e
$$;

-- Equipo de un espacio con nombre y roles (para elegir personas y ver quién leyó).
create or replace function team_roster(pid text)
returns table (user_id uuid, nombre text, roles text[], role_ids text[])
language plpgsql stable security definer set search_path = public as $$
begin
  if not team_can_manage(pid) then raise exception 'No autorizado'; end if;
  return query
    with gente as (
      select distinct m.user_id as uid from production_members m join productions p on p.id = m.production_id
       where m.role_id <> 'integrante' and (m.production_id = pid or (pid is null and p.estado <> 'archivada'))
      union
      select pr.id from profiles pr where pid is null and pr.rol in ('staff', 'admin')
    )
    select g.uid,
           coalesce(nullif(btrim(pr.nombre), ''), split_part(u.email::text, '@', 1)),
           array(select r.nombre from panel_roles r where r.id = any(team_member_roles(pid, g.uid)) order by r.orden),
           team_member_roles(pid, g.uid)
      from gente g join auth.users u on u.id = g.uid left join profiles pr on pr.id = g.uid
     order by 2;
end $$;

create or replace function team_announcement_read_status(aid uuid)
returns table (user_id uuid, nombre text, leido_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare a team_announcements%rowtype;
begin
  select * into a from team_announcements where id = aid;
  if not found or not team_can_manage(a.production_id) then raise exception 'No autorizado'; end if;
  return query
    select t.user_id, t.nombre, r.read_at
      from team_roster(a.production_id) t
      left join team_announcement_reads r on r.announcement_id = aid and r.user_id = t.user_id
     where team_audience_includes(a.production_id, t.user_id, a.audiencia, a.roles, a.personas)
     order by r.read_at nulls first, 2;
end $$;

-- Inicio del panel (0061) + pendientes y juntas del equipo.
create or replace function panel_home() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  if auth.uid() is null then raise exception 'No autorizado'; end if;
  with mias as (
    select distinct a.production_id as pid from my_panel_access() a
      join productions p on p.id = a.production_id
     where p.estado <> 'archivada'
  ),
  pend as (
    select 'solicitudes' as tipo, a.production_id as pid, count(*) as n
      from audition_applications ap join auditions a on a.id = ap.audition_id
     where ap.estado = 'inscrito' and a.estado = 'abierta'
       and a.production_id in (select pid from mias) and has_perm(a.production_id, 'audiciones.gestionar')
     group by a.production_id
    union all
    select 'solicitudes', null, count(*)
      from audition_applications ap join auditions a on a.id = ap.audition_id
     where ap.estado = 'inscrito' and a.estado = 'abierta' and a.production_id is null and is_admin()
    having count(*) > 0
    union all
    select 'ofertas', o.production_id, count(*) from casting_offers o
     where o.estado = 'enviada' and o.production_id in (select pid from mias) and has_perm(o.production_id, 'elenco.gestionar')
     group by o.production_id
    union all
    select 'documentos', d.production_id, count(*) from member_docs d
     where d.subido_at is not null and d.entregado_at is null
       and d.production_id in (select pid from mias) and has_perm(d.production_id, 'expedientes.ver')
     group by d.production_id
    union all
    select 'advertencias', i.production_id, count(*) from member_incidents i
     where i.nivel in ('advertencia', 'grave') and i.anulada_at is null and i.created_at > now() - interval '7 days'
       and i.production_id in (select pid from mias) and has_perm(i.production_id, 'expedientes.ver')
     group by i.production_id
    union all
    select 'evaluaciones', r.production_id, count(*) from rubric_periods r
     where r.publicado_at is null and r.hasta is not null and r.hasta < current_date and rubric_active(r.production_id)
       and r.production_id in (select pid from mias) and has_perm(r.production_id, 'rubrica.gestionar')
     group by r.production_id
    union all
    select 'notas_equipo', u.production_id, u.notas from my_team_unread() u where u.notas > 0
    union all
    select 'avisos_equipo', u.production_id, u.avisos from my_team_unread() u where u.avisos > 0
  )
  select jsonb_build_object(
    'pendientes', coalesce((select jsonb_agg(jsonb_build_object('tipo', tipo, 'production_id', pid, 'n', n)) from pend), '[]'),
    'funciones', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'production_id', f.production_id, 'starts_at', f.starts_at, 'venue', f.venue) order by f.starts_at)
        from performances f
       where f.production_id in (select pid from mias) and f.starts_at between now() - interval '3 hours' and now() + interval '7 days'), '[]'),
    'ensayos', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'production_id', r.production_id, 'titulo', r.titulo, 'inicia', r.inicia, 'lugar', r.lugar) order by r.inicia)
        from rehearsals r
       where r.production_id in (select pid from mias) and r.estado = 'programado' and has_perm(r.production_id, 'ensayos.gestionar')
         and r.inicia between now() - interval '3 hours' and now() + interval '7 days'), '[]'),
    'juntas', coalesce((select jsonb_agg(jsonb_build_object('id', j.id, 'production_id', j.production_id, 'titulo', j.titulo, 'tipo', j.tipo, 'inicia', j.inicia, 'lugar', j.lugar) order by j.inicia)
        from team_meetings j
       where j.estado = 'programada' and j.inicia between now() - interval '3 hours' and now() + interval '7 days'
         and (team_audience_includes(j.production_id, auth.uid(), j.audiencia, j.roles, j.personas) or team_can_manage(j.production_id))), '[]'),
    'cambios', coalesce((select jsonb_agg(x order by x->>'at' desc) from (
        select jsonb_build_object('id', l.id, 'at', l.at, 'actor', l.actor, 'tabla', l.tabla, 'accion', l.accion,
                 'registro_id', l.registro_id, 'production_id', l.production_id, 'antes', l.antes, 'despues', l.despues,
                 'actor_nombre', coalesce(nullif(btrim(pr.nombre), ''), 'Alguien'),
                 'persona_nombre', (select nullif(btrim(p2.nombre), '') from profiles p2
                                     where p2.id::text = coalesce(l.despues->>'user_id', l.antes->>'user_id'))) as x
          from audit_log l left join profiles pr on pr.id = l.actor
         where l.production_id in (select pid from mias)
           and (is_admin() or has_perm(l.production_id, 'permisos.gestionar'))
           and l.at > now() - interval '14 days'
         order by l.at desc
         limit 8) s), '[]')
  ) into out;
  return out;
end $$;

-- ──────── Permisos de las funciones ────────
revoke execute on function team_notes_guard() from public, anon, authenticated;
revoke execute on function team_can_manage(text), team_member_roles(text, uuid), is_team(text, uuid),
  team_audience_includes(text, uuid, text, text[], uuid[]), team_note_recipient(text, uuid, text[], uuid[]),
  team_announcement_for_me(uuid), team_announcement_managed(uuid), can_read_team_object(text),
  my_team_productions(), my_team_unread(), team_roster(text), team_announcement_read_status(uuid) from public, anon;
grant execute on function team_can_manage(text), team_member_roles(text, uuid), is_team(text, uuid),
  team_audience_includes(text, uuid, text, text[], uuid[]), team_note_recipient(text, uuid, text[], uuid[]),
  team_announcement_for_me(uuid), team_announcement_managed(uuid), can_read_team_object(text),
  my_team_productions(), my_team_unread(), team_roster(text), team_announcement_read_status(uuid) to authenticated;

create trigger audit_team_materials after insert or update or delete on team_materials for each row execute function audit_row();
create trigger audit_team_announcements after insert or update or delete on team_announcements for each row execute function audit_row();
create trigger audit_team_notes after insert or update or delete on team_notes for each row execute function audit_row();
create trigger audit_team_meetings after insert or update or delete on team_meetings for each row execute function audit_row();

commit;
