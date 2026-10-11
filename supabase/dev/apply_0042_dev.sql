-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV".
-- Aplica la migración 0042 (expediente único, documentos dirigidos, incidencias, ficha de
-- talento, unir fichas; aprobada por Diego). Se corre a mano en Supabase → SQL Editor.
-- Si la base no es DEV, aborta sin hacer nada. Mueve los datos del expediente a la ficha
-- única de cada persona (no se pierden).
begin;
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
end $$;

-- ──────── Expediente único por persona ────────
create table person_files (
  user_id uuid primary key references auth.users(id) on delete cascade,
  fecha_nacimiento date,
  telefono text,
  emergencia_nombre text,
  emergencia_telefono text,
  emergencia_parentesco text,
  tutor_nombre text,
  tutor_telefono text,
  tutor_email text,
  alergias text,
  condiciones text,
  medicamentos text,
  tipo_sangre text,
  altura_cm numeric(5,1) check (altura_cm between 50 and 250),
  pecho_cm numeric(5,1) check (pecho_cm between 30 and 200),
  cintura_cm numeric(5,1) check (cintura_cm between 30 and 200),
  cadera_cm numeric(5,1) check (cadera_cm between 30 and 200),
  talla_ropa text,
  talla_calzado text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into person_files (user_id, fecha_nacimiento, telefono, emergencia_nombre, emergencia_telefono, emergencia_parentesco,
  tutor_nombre, tutor_telefono, tutor_email, alergias, condiciones, medicamentos, tipo_sangre, altura_cm, pecho_cm,
  cintura_cm, cadera_cm, talla_ropa, talla_calzado, updated_at)
select distinct on (user_id) user_id, fecha_nacimiento, telefono, emergencia_nombre, emergencia_telefono, emergencia_parentesco,
  tutor_nombre, tutor_telefono, tutor_email, alergias, condiciones, medicamentos, tipo_sangre, altura_cm, pecho_cm,
  cintura_cm, cadera_cm, talla_ropa, talla_calzado, updated_at
  from member_files order by user_id, updated_at desc;

-- member_files queda como "estado del expediente en esta obra".
alter table member_files
  drop column fecha_nacimiento, drop column telefono, drop column emergencia_nombre, drop column emergencia_telefono,
  drop column emergencia_parentesco, drop column tutor_nombre, drop column tutor_telefono, drop column tutor_email,
  drop column alergias, drop column condiciones, drop column medicamentos, drop column tipo_sangre, drop column altura_cm,
  drop column pecho_cm, drop column cintura_cm, drop column cadera_cm, drop column talla_ropa, drop column talla_calzado;
alter table member_files add column confirmado_at timestamptz;   -- el integrante confirma que sus datos siguen vigentes

-- Solo la producción marca "revisado"; solo el propio integrante confirma vigencia.
create or replace function member_files_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Sin permiso no se puede MARCAR revisado (sí quitarlo: pasa cuando la persona cambia sus datos).
  if not has_perm(new.production_id, 'expedientes.ver') and new.revisado_at is not null then
    new.revisado_at := case when tg_op = 'UPDATE' then old.revisado_at end;
    new.revisado_por := case when tg_op = 'UPDATE' then old.revisado_por end;
  end if;
  if new.user_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid) then
    new.confirmado_at := case when tg_op = 'UPDATE' then old.confirmado_at end;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- ¿Puede ver o corregir el expediente de esta persona? Director, o expedientes.ver en una
-- obra donde la persona es integrante.
create or replace function can_manage_person_file(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    is_admin()
    or exists (select 1 from production_members m
                where m.user_id = uid and m.role_id = 'integrante' and has_perm(m.production_id, 'expedientes.ver')))
$$;

-- Si la persona cambia sus datos, todas sus obras vuelven a "por revisar".
create or replace function person_files_touch() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if auth.uid() = new.user_id then
    update member_files set revisado_at = null, revisado_por = null where user_id = new.user_id and revisado_at is not null;
  end if;
  return new;
end $$;
create trigger person_files_touch before insert or update on person_files
  for each row execute function person_files_touch();

alter table person_files enable row level security;
create policy person_files_own on person_files for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy person_files_team on person_files for all to authenticated
  using (can_manage_person_file(user_id)) with check (can_manage_person_file(user_id));
revoke all on person_files from anon;

-- ──────── Documentos dirigidos ────────
alter table member_doc_types
  add column aplica text not null default 'todos' check (aplica in ('todos', 'menores', 'grupo', 'personas')),
  add column grupo text check (grupo in ('reparto', 'ensamble', 'creativo', 'produccion', 'crew', 'tecnico')),
  add column personas uuid[] not null default '{}',
  add column descripcion text;
update member_doc_types set aplica = 'menores' where solo_menores;
alter table member_doc_types add constraint member_doc_types_grupo check (aplica <> 'grupo' or grupo is not null);

-- ──────── Incidencias y advertencias ────────
create table production_discipline (
  production_id text primary key references productions(id) on delete cascade,
  limite_advertencias int not null default 3 check (limite_advertencias between 1 and 20),
  auto_mensualidad_meses int default 2 check (auto_mensualidad_meses between 1 and 12),   -- null = apagado
  auto_retardos int default 3 check (auto_retardos between 1 and 20),
  auto_faltas int default 2 check (auto_faltas between 1 and 20)
);

create table member_incidents (
  id uuid primary key default gen_random_uuid(),
  production_id text not null references productions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('retardo', 'falta', 'conducta', 'mensualidad', 'otro')),
  nivel text not null default 'advertencia' check (nivel in ('nota', 'advertencia', 'grave')),
  descripcion text not null check (length(btrim(descripcion)) between 1 and 2000),
  fecha date not null default current_date,
  origen text not null default 'manual' check (origen in ('manual', 'auto')),
  auto_key text,                     -- evita repetir una automática (p. ej. 'mensualidad:2')
  anulada_at timestamptz,
  anulada_por uuid references auth.users(id) on delete set null,
  anulada_motivo text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (anulada_at is null or coalesce(btrim(anulada_motivo), '') <> '')
);
create unique index uq_member_incident_auto on member_incidents(production_id, user_id, auto_key) where auto_key is not null;
create index idx_member_incidents on member_incidents(production_id, user_id);

create table member_measures (
  id uuid primary key default gen_random_uuid(),
  production_id text not null references productions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  medida text not null check (medida in ('platica', 'aviso_tutor', 'suspension', 'baja', 'otra')),
  descripcion text,
  fecha date not null default current_date,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

-- Quién registra incidencias: expedientes, ensayos o elenco de la obra.
create or replace function can_manage_discipline(pid text) returns boolean
language sql stable security definer set search_path = public as $$
  select has_perm(pid, 'expedientes.ver') or has_perm(pid, 'ensayos.gestionar') or has_perm(pid, 'elenco.gestionar')
$$;

-- Una incidencia solo se edita para anularla (con motivo); el resto queda como se registró.
create or replace function member_incidents_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if (new.production_id, new.user_id, new.tipo, new.nivel, new.descripcion, new.fecha, new.origen, new.auto_key, new.created_by, new.created_at)
       is distinct from (old.production_id, old.user_id, old.tipo, old.nivel, old.descripcion, old.fecha, old.origen, old.auto_key, old.created_by, old.created_at) then
      raise exception 'Una incidencia no se edita; anúlala con motivo y registra otra.';
    end if;
    if old.anulada_at is not null then raise exception 'Ya estaba anulada.'; end if;
    new.anulada_por := auth.uid();
  end if;
  return new;
end $$;
create trigger member_incidents_guard before insert or update on member_incidents
  for each row execute function member_incidents_guard();

alter table production_discipline enable row level security;
alter table member_incidents enable row level security;
alter table member_measures enable row level security;
create policy production_discipline_read on production_discipline for select to authenticated
  using (is_production_member(production_id) or can_manage_discipline(production_id));
create policy production_discipline_team on production_discipline for all to authenticated
  using (can_manage_discipline(production_id)) with check (can_manage_discipline(production_id));
create policy member_incidents_team on member_incidents for select to authenticated using (can_manage_discipline(production_id));
create policy member_incidents_team_insert on member_incidents for insert to authenticated
  with check (can_manage_discipline(production_id) and created_by = auth.uid());
create policy member_incidents_team_update on member_incidents for update to authenticated
  using (can_manage_discipline(production_id)) with check (can_manage_discipline(production_id));
-- El integrante ve sus advertencias y graves (no las notas internas).
create policy member_incidents_own on member_incidents for select to authenticated
  using (user_id = auth.uid() and nivel in ('advertencia', 'grave'));
create policy member_measures_team on member_measures for all to authenticated
  using (can_manage_discipline(production_id)) with check (can_manage_discipline(production_id));
create policy member_measures_own on member_measures for select to authenticated using (user_id = auth.uid());
revoke all on production_discipline, member_incidents, member_measures from anon;

-- Advertencias automáticas por mensualidad: por cada N meses vencidos sin pagar completos
-- (después del día límite), una advertencia. No se repiten: cada una lleva su número.
create or replace function discipline_scan_fees(pid text) returns int
language plpgsql security definer set search_path = public as $$
declare
  cfg production_discipline%rowtype; f production_fees%rowtype; r record; vencidos int; n int; hechas int := 0;
begin
  if not (can_manage_discipline(pid) or has_perm(pid, 'mensualidades.gestionar')) then raise exception 'No autorizado'; end if;
  select * into f from production_fees where production_id = pid;
  if not found then return 0; end if;
  select * into cfg from production_discipline where production_id = pid;
  if not found then cfg.auto_mensualidad_meses := 2; end if;
  if cfg.auto_mensualidad_meses is null then return 0; end if;
  for r in
    select m.user_id, coalesce(t.beca, false) as beca, coalesce(t.cuota_especial, f.monto) as debe
      from production_members m left join member_fee_terms t on t.production_id = pid and t.user_id = m.user_id
     where m.production_id = pid and m.role_id = 'integrante'
  loop
    continue when r.beca or r.debe <= 0;
    select count(*) into vencidos
      from generate_series(f.desde, least(f.hasta, current_date::timestamp)::date, interval '1 month') g(periodo)
     where (g.periodo::date + (f.dia_limite - 1)) < current_date
       and coalesce((select sum(p.monto) from member_payments p
                      where p.production_id = pid and p.user_id = r.user_id and p.periodo = g.periodo::date), 0) < r.debe;
    for n in 1 .. (vencidos / cfg.auto_mensualidad_meses) loop
      insert into member_incidents (production_id, user_id, tipo, nivel, descripcion, origen, auto_key, created_by)
      values (pid, r.user_id, 'mensualidad', 'advertencia',
              format('Mensualidad: %s meses vencidos sin pagar.', n * cfg.auto_mensualidad_meses), 'auto', 'mensualidad:' || n, null)
      on conflict (production_id, user_id, auto_key) where auto_key is not null do nothing;
      if found then hechas := hechas + 1; end if;
    end loop;
  end loop;
  return hechas;
end $$;

-- Resumen por integrante: advertencias vigentes (advertencia o grave, no anuladas), si llegó
-- al límite y si ya hay una medida registrada después de la última advertencia.
create or replace function discipline_summary(pid text)
returns table (user_id uuid, advertencias int, limite int, requiere_decision boolean)
language plpgsql stable security definer set search_path = public as $$
declare lim int := coalesce((select limite_advertencias from production_discipline where production_id = pid), 3);
begin
  if not (can_manage_discipline(pid) or has_perm(pid, 'mensualidades.gestionar')) then raise exception 'No autorizado'; end if;
  return query
    select m.user_id, coalesce(x.n, 0)::int, lim,
           coalesce(x.n, 0) >= lim and not exists (
             select 1 from member_measures me where me.production_id = pid and me.user_id = m.user_id and me.created_at >= x.ultima)
      from production_members m
      left join lateral (
        select count(*) as n, max(i.created_at) as ultima from member_incidents i
         where i.production_id = pid and i.user_id = m.user_id and i.anulada_at is null and i.nivel in ('advertencia', 'grave')
      ) x on true
     where m.production_id = pid and m.role_id = 'integrante';
end $$;

-- ──────── Ficha de talento ────────
-- ¿Puede ver el historial artístico de esta persona? Director; o quien arma elenco o
-- audiciones en una obra donde la persona es integrante, audicionó o tiene oferta.
create or replace function can_view_talent(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    is_admin()
    or exists (select 1 from production_members m where m.user_id = uid
                and (has_perm(m.production_id, 'elenco.gestionar') or has_perm(m.production_id, 'audiciones.gestionar')))
    or exists (select 1 from casting_offers o where o.user_id = uid and has_perm(o.production_id, 'elenco.gestionar'))
    or exists (select 1 from audition_applications a where a.user_id = uid and audition_perm(a.audition_id, 'audiciones.gestionar')))
$$;

create or replace function talent_history(uid uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_person uuid; out jsonb;
begin
  if not can_view_talent(uid) then raise exception 'No autorizado'; end if;
  select id into v_person from people where profile_id = uid;
  select jsonb_build_object(
    'nombre', coalesce((select nombre from people where id = v_person), (select nombre from profiles where id = uid)),
    'email', (select email from auth.users where id = uid),
    'obras', coalesce((select jsonb_agg(jsonb_build_object('production_id', c.production_id, 'obra', p.nombre, 'tipo', c.tipo, 'papel', c.papel)
                                         order by p.created_at desc)
                         from production_credits c join productions p on p.id = c.production_id where c.person_id = v_person), '[]'),
    'ofertas', coalesce((select jsonb_agg(jsonb_build_object('obra', p.nombre, 'tipo', o.tipo, 'papel', o.papel, 'estado', o.estado, 'fecha', o.created_at)
                                           order by o.created_at desc)
                           from casting_offers o join productions p on p.id = o.production_id where o.user_id = uid), '[]'),
    'audiciones', coalesce((select jsonb_agg(jsonb_build_object(
        'id', a.id, 'audition_id', a.audition_id, 'titulo', au.titulo, 'obra', p.nombre, 'fecha', a.created_at,
        'estado', a.estado, 'ronda', a.ronda, 'numero', a.numero,
        'llego', a.checked_in_at, 'entro', a.entered_at, 'salio', a.finished_at,
        'respuestas', coalesce((select jsonb_agg(jsonb_build_object('pregunta', f.etiqueta, 'respuesta', a.respuestas->>f.id::text) order by f.orden)
                                  from audition_fields f where f.audition_id = a.audition_id and coalesce(btrim(a.respuestas->>f.id::text), '') <> ''), '[]'),
        'personajes', (select array_agg(r.nombre order by r.orden) from audition_roles r where r.id = any(a.roles)),
        'promedio', (select round(avg(e.value::text::numeric), 2) from audition_scores s, jsonb_each(s.puntos) e where s.application_id = a.id),
        'videos', coalesce((select jsonb_agg(jsonb_build_object('titulo', v.titulo, 'url', v.url)) from audition_videos v where v.application_id = a.id), '[]'))
        order by a.created_at desc)
      from audition_applications a join auditions au on au.id = a.audition_id left join productions p on p.id = au.production_id
     where a.user_id = uid), '[]')
  ) into out;
  return out;
end $$;

-- ──────── Unir fichas y ligar a una cuenta (solo el Director) ────────
create or replace function people_merge(keep uuid, quitar uuid) returns void
language plpgsql security definer set search_path = public as $$
declare k people%rowtype; d people%rowtype;
begin
  if not is_admin() then raise exception 'Solo el Director puede unir fichas.'; end if;
  if keep = quitar then raise exception 'Elige dos fichas distintas.'; end if;
  select * into k from people where id = keep for update;
  select * into d from people where id = quitar for update;
  if k.id is null or d.id is null then raise exception 'No se encontró una de las fichas.'; end if;
  if k.profile_id is not null and d.profile_id is not null and k.profile_id <> d.profile_id then
    raise exception 'Las dos fichas tienen cuentas distintas; no se pueden unir.';
  end if;
  update production_credits set person_id = keep where person_id = quitar;
  if k.profile_id is null and d.profile_id is not null then
    update people set profile_id = null where id = quitar;
    update people set profile_id = d.profile_id where id = keep;
  end if;
  delete from people where id = quitar;
end $$;

create or replace function people_link_account(pid uuid, p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid; otra uuid;
begin
  if not is_admin() then raise exception 'Solo el Director puede ligar fichas.'; end if;
  select id into uid from auth.users where lower(email) = lower(btrim(p_email));
  if uid is null then raise exception 'Ese correo no tiene cuenta en DARF.'; end if;
  select id into otra from people where profile_id = uid and id <> pid;
  if otra is not null then
    raise exception 'Esa cuenta ya está ligada a otra ficha. Une las dos fichas en lugar de ligar.';
  end if;
  update people set profile_id = uid where id = pid;
  if not found then raise exception 'No se encontró la ficha.'; end if;
end $$;

-- Lista de fichas para el Director (buscar duplicados).
create or replace function people_directory(q text default null)
returns table (id uuid, profile_id uuid, nombre text, email text, obras text[], creditos int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo el Director.'; end if;
  return query
    select pe.id, pe.profile_id, pe.nombre, u.email::text,
           coalesce((select array_agg(distinct p.nombre) from production_credits c join productions p on p.id = c.production_id where c.person_id = pe.id), '{}'),
           (select count(*)::int from production_credits c where c.person_id = pe.id)
      from people pe left join auth.users u on u.id = pe.profile_id
     where q is null or btrim(q) = '' or unaccent_lower(pe.nombre) like '%' || unaccent_lower(btrim(q)) || '%'
     order by unaccent_lower(pe.nombre)
     limit 300;
end $$;

-- Comparar nombres sin acentos ni mayúsculas ("González" = "gonzalez").
create or replace function unaccent_lower(t text) returns text
language sql immutable as $$
  select lower(translate(coalesce(t, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'))
$$;

-- ──────── Grupos de cada integrante (para documentos dirigidos a un grupo) ────────
drop function cast_roster(text);
create function cast_roster(pid text)
returns table (user_id uuid, nombre text, email text, papeles text[], tipos text[])
language plpgsql stable security definer set search_path = public as $$
begin
  if not (has_perm(pid, 'expedientes.ver') or has_perm(pid, 'mensualidades.gestionar') or has_perm(pid, 'elenco.gestionar')
          or has_perm(pid, 'ensayos.gestionar')) then
    raise exception 'No autorizado';
  end if;
  return query
    select m.user_id,
           coalesce(nullif(btrim(pe.nombre), ''), nullif(btrim(pr.nombre), ''), split_part(u.email::text, '@', 1)),
           u.email::text,
           coalesce((select array_agg(coalesce(c.papel, initcap(c.tipo)) order by c.tipo, c.orden)
                       from production_credits c where c.production_id = pid and c.person_id = pe.id), '{}'),
           coalesce((select array_agg(distinct c.tipo) from production_credits c where c.production_id = pid and c.person_id = pe.id), '{}')
      from production_members m
      join auth.users u on u.id = m.user_id
      left join profiles pr on pr.id = m.user_id
      left join people pe on pe.profile_id = m.user_id
     where m.production_id = pid and m.role_id = 'integrante'
     order by 2;
end $$;

drop function my_productions();
create function my_productions()
returns table (production_id text, nombre text, estado text, papeles text[], tipos text[])
language sql stable security definer set search_path = public as $$
  select p.id, p.nombre, p.estado,
         coalesce((select array_agg(coalesce(c.papel, initcap(c.tipo)) order by c.tipo, c.orden)
                     from production_credits c join people pe on pe.id = c.person_id
                    where c.production_id = p.id and pe.profile_id = auth.uid()), '{}'),
         coalesce((select array_agg(distinct c.tipo)
                     from production_credits c join people pe on pe.id = c.person_id
                    where c.production_id = p.id and pe.profile_id = auth.uid()), '{}')
    from production_members m join productions p on p.id = m.production_id
   where m.user_id = auth.uid() and m.role_id = 'integrante'
   order by p.created_at desc
$$;
revoke execute on function cast_roster(text) from public, anon;
revoke execute on function my_productions() from public, anon;
grant execute on function cast_roster(text), my_productions() to authenticated;

-- ──────── Permisos de las funciones ────────
revoke execute on function can_manage_person_file(uuid) from public, anon;
revoke execute on function person_files_touch() from public, anon;
revoke execute on function can_manage_discipline(text) from public, anon;
revoke execute on function member_incidents_guard() from public, anon;
revoke execute on function discipline_scan_fees(text) from public, anon;
revoke execute on function discipline_summary(text) from public, anon;
revoke execute on function can_view_talent(uuid) from public, anon;
revoke execute on function talent_history(uuid) from public, anon;
revoke execute on function people_merge(uuid, uuid) from public, anon;
revoke execute on function people_link_account(uuid, text) from public, anon;
revoke execute on function people_directory(text) from public, anon;
grant execute on function can_manage_person_file(uuid), can_manage_discipline(text), discipline_scan_fees(text), discipline_summary(text),
  can_view_talent(uuid), talent_history(uuid), people_merge(uuid, uuid), people_link_account(uuid, text), people_directory(text),
  unaccent_lower(text) to authenticated;

-- Bitácora (sin datos de salud).
create trigger audit_member_incidents after insert or update or delete on member_incidents for each row execute function audit_row();
create trigger audit_member_measures after insert or update or delete on member_measures for each row execute function audit_row();
create trigger audit_production_discipline after insert or update or delete on production_discipline for each row execute function audit_row();
create trigger audit_people after insert or update or delete on people for each row execute function audit_row();


insert into supabase_migrations.schema_migrations (version, name)
values ('20261012050000', '0042_talent_discipline') on conflict do nothing;
commit;
select 'OK: 0042 aplicada en DARF 2.0 DEV' as resultado;
