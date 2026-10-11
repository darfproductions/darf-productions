-- 0038: más tipos de audición (decisiones de Diego, 2026-10-11).
--   * Forma de la audición: presencial, en línea (por video, sin día presencial) o
--     mixta (video al inscribirse + día presencial). En línea los jueces califican
--     desde los videos, sin "llegada".
--   * Por invitación: solo los correos invitados pueden inscribirse (siempre "solo con
--     enlace"); quien fue invitado lo ve en Mi cuenta.
--   * Criterios de calificación propios por convocatoria (1 a 8, cada uno de 1 a 5).
--     Por defecto: canto, baile, actuación y actitud (como hasta hoy).
--   * Plantillas propias: guardar la configuración de una convocatoria para reusarla.
-- Precede: 0037. No borra datos: las calificaciones existentes se copian al nuevo formato.

begin;

-- ──────── Criterios válidos: [{"k": "canto", "l": "Canto"}, …] ────────
create or replace function audition_criterios_ok(j jsonb) returns boolean
language plpgsql immutable as $$
declare e jsonb; ks text[] := '{}';
begin
  if j is null or jsonb_typeof(j) <> 'array' or jsonb_array_length(j) not between 1 and 8 then return false; end if;
  for e in select * from jsonb_array_elements(j) loop
    if jsonb_typeof(e) <> 'object' or coalesce(e->>'k', '') !~ '^[a-z0-9_]{1,30}$'
       or length(btrim(coalesce(e->>'l', ''))) not between 1 and 40 or (e->>'k') = any(ks) then
      return false;
    end if;
    ks := ks || (e->>'k');
  end loop;
  return true;
end $$;

-- ──────── Convocatorias: forma, invitación, criterios ────────
alter table auditions
  add column modalidad text not null default 'presencial' check (modalidad in ('presencial', 'en_linea', 'mixta')),
  add column solo_invitados boolean not null default false,
  add column criterios jsonb not null default
    '[{"k":"canto","l":"Canto"},{"k":"baile","l":"Baile"},{"k":"actuacion","l":"Actuación"},{"k":"actitud","l":"Actitud"}]',
  add column plantilla text,
  add constraint auditions_invitados_enlace check (not solo_invitados or visibilidad = 'enlace'),
  add constraint auditions_criterios_validos check (audition_criterios_ok(criterios));

-- ──────── Calificaciones con criterios propios ────────
alter table audition_scores add column puntos jsonb not null default '{}';
update audition_scores set puntos = jsonb_strip_nulls(jsonb_build_object('canto', canto, 'baile', baile, 'actuacion', actuacion, 'actitud', actitud));

-- Cada clave debe ser un criterio de la convocatoria y cada valor de 1 a 5.
-- Compatibilidad: si llega en las columnas fijas, se copia a "puntos", y viceversa.
create or replace function audition_scores_validate() returns trigger
language plpgsql security definer set search_path = public as $$
declare crit jsonb; r record;
begin
  if (new.puntos = '{}'::jsonb and coalesce(new.canto, new.baile, new.actuacion, new.actitud) is not null)
     or (tg_op = 'UPDATE' and new.puntos = old.puntos
         and (new.canto, new.baile, new.actuacion, new.actitud) is distinct from (old.canto, old.baile, old.actuacion, old.actitud)) then
    new.puntos := jsonb_strip_nulls(jsonb_build_object('canto', new.canto, 'baile', new.baile, 'actuacion', new.actuacion, 'actitud', new.actitud));
  end if;
  select criterios into crit from auditions where id = application_audition(new.application_id);
  for r in select * from jsonb_each(new.puntos) loop
    if not exists (select 1 from jsonb_array_elements(crit) c where c->>'k' = r.key) then
      raise exception using errcode = 'check_violation', message = format('Criterio no válido: %s', r.key);
    end if;
    if jsonb_typeof(r.value) <> 'number' or (r.value::text)::numeric not in (1, 2, 3, 4, 5) then
      raise exception using errcode = 'check_violation', message = 'Cada calificación va de 1 a 5.';
    end if;
  end loop;
  new.canto := (new.puntos->>'canto')::smallint;
  new.baile := (new.puntos->>'baile')::smallint;
  new.actuacion := (new.puntos->>'actuacion')::smallint;
  new.actitud := (new.puntos->>'actitud')::smallint;
  return new;
end $$;
create trigger audition_scores_validate before insert or update on audition_scores
  for each row execute function audition_scores_validate();

-- ──────── Invitaciones ────────
create table audition_invites (
  id uuid primary key default gen_random_uuid(),
  audition_id uuid not null references auditions(id) on delete cascade,
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 200),
  nombre text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index uq_audition_invite on audition_invites(audition_id, lower(email));

create or replace function my_email() returns text
language sql stable security definer set search_path = public as $$
  select lower(email::text) from auth.users where id = auth.uid()
$$;

create or replace function audition_am_invited(aid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (select 1 from audition_invites where audition_id = aid and lower(email) = my_email())
$$;

-- Invitaciones a convocatorias abiertas que me hicieron (Mi cuenta).
create or replace function my_audition_invites()
returns table (audition_id uuid, titulo text, obra text, inscripcion_cierra timestamptz, inscrito boolean)
language sql stable security definer set search_path = public as $$
  select a.id, a.titulo, p.nombre, a.inscripcion_cierra,
         exists (select 1 from audition_applications x where x.audition_id = a.id and x.user_id = auth.uid() and x.estado <> 'cancelado')
    from audition_invites i
    join auditions a on a.id = i.audition_id
    left join productions p on p.id = a.production_id
   where lower(i.email) = my_email() and a.estado = 'abierta'
   order by a.created_at desc
$$;

alter table audition_invites enable row level security;
create policy audition_invites_team on audition_invites for all to authenticated
  using (audition_perm(audition_id, 'audiciones.gestionar')) with check (audition_perm(audition_id, 'audiciones.gestionar'));
revoke all on audition_invites from anon;

-- ──────── Plantillas propias ────────
-- ¿Gestiona audiciones en alguna obra o convocatoria? (puede usar y guardar plantillas)
create or replace function manages_any_audition() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    is_admin()
    or exists (select 1 from production_members m join role_permissions rp on rp.role_id = m.role_id
                where m.user_id = auth.uid() and rp.permission_id = 'audiciones.gestionar')
    or exists (select 1 from audition_members m join role_permissions rp on rp.role_id = m.role_id
                where m.user_id = auth.uid() and rp.permission_id = 'audiciones.gestionar'))
$$;

create table audition_templates (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(btrim(nombre)) between 1 and 60),
  descripcion text check (length(descripcion) <= 300),
  opciones jsonb not null default '{}' check (jsonb_typeof(opciones) = 'object'),
  criterios jsonb not null check (audition_criterios_ok(criterios)),
  preguntas jsonb not null default '[]' check (jsonb_typeof(preguntas) = 'array' and jsonb_array_length(preguntas) <= 30),
  requisitos text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

alter table audition_templates enable row level security;
create policy audition_templates_read on audition_templates for select to authenticated using (manages_any_audition());
create policy audition_templates_insert on audition_templates for insert to authenticated
  with check (manages_any_audition() and created_by = auth.uid());
create policy audition_templates_own_update on audition_templates for update to authenticated
  using (created_by = auth.uid() or is_admin()) with check (created_by = auth.uid() or is_admin());
create policy audition_templates_own_remove on audition_templates for delete to authenticated
  using (created_by = auth.uid() or is_admin());
revoke all on audition_templates from anon;

-- ──────── Inscribirse: invitación y forma en línea ────────
-- (misma función de 0037 con dos reglas nuevas: invitación y en línea sin horario)
create or replace function audition_apply(aid uuid, p jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare
  a auditions%rowtype;
  v_slot uuid := nullif(p->>'slot_id', '')::uuid;
  v_nac date := nullif(p->>'fecha_nacimiento', '')::date;
  v_edad int;
  v_menor boolean;
  v_roles uuid[] := coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(p->'roles', '[]')) x), '{}');
  v_resp jsonb := coalesce(p->'respuestas', '{}');
  v_foto text := nullif(btrim(p->>'foto_path'), '');
  v_tutor boolean;
  f record;
  v_id uuid;
  v_prev audition_applications%rowtype;
  v_num int;
begin
  if auth.uid() is null then raise exception 'Necesitas iniciar sesión para inscribirte.'; end if;
  select * into a from auditions where id = aid;
  if not found or a.estado <> 'abierta' then raise exception 'Esta convocatoria no está abierta.'; end if;
  if a.inscripcion_cierra is not null and now() > a.inscripcion_cierra then raise exception 'La inscripción ya cerró.'; end if;
  if a.solo_invitados and not audition_am_invited(aid) then
    raise exception 'Esta convocatoria es solo por invitación. Si te invitaron, entra con el mismo correo al que te llegó la invitación.';
  end if;

  if coalesce(btrim(p->>'nombre'), '') = '' or coalesce(btrim(p->>'telefono'), '') = '' or v_nac is null then
    raise exception 'Faltan tu nombre, teléfono o fecha de nacimiento.';
  end if;
  if (p->>'consentimiento_datos')::boolean is not true then
    raise exception 'Necesitamos tu autorización para usar tus datos en esta audición.';
  end if;
  v_edad := audition_age(aid, v_nac);
  if v_edad < 3 or v_edad > 99 then raise exception 'Revisa tu fecha de nacimiento.'; end if;
  if a.edad_min is not null and v_edad < a.edad_min then raise exception 'Esta convocatoria es para mayores de % años.', a.edad_min; end if;
  if a.edad_max is not null and v_edad > a.edad_max then raise exception 'Esta convocatoria es hasta % años.', a.edad_max; end if;
  v_menor := v_edad < 18;
  v_tutor := v_menor and a.pedir_tutor;
  if v_tutor and (coalesce(btrim(p->>'tutor_nombre'), '') = '' or coalesce(btrim(p->>'tutor_telefono'), '') = '') then
    raise exception 'Como eres menor de edad, necesitamos el nombre y teléfono de tu madre, padre o tutor.';
  end if;
  if v_tutor and (p->>'consentimiento_tutor')::boolean is not true then
    raise exception 'Tu madre, padre o tutor debe autorizar la inscripción.';
  end if;

  if not a.elegir_horario or a.modalidad = 'en_linea' then
    v_slot := null;   -- el equipo asigna el horario
  elsif exists (select 1 from audition_slots where audition_id = aid) then
    if v_slot is null or not exists (select 1 from audition_slots where id = v_slot and audition_id = aid) then
      raise exception 'Elige un horario.';
    end if;
  end if;
  if exists (select 1 from unnest(v_roles) r where not exists (select 1 from audition_roles where id = r and audition_id = aid)) then
    raise exception 'Uno de los personajes no pertenece a esta convocatoria.';
  end if;
  for f in select * from audition_fields where audition_id = aid and obligatorio loop
    if coalesce(btrim(v_resp->>f.id::text), '') = '' then raise exception 'Falta responder: %', f.etiqueta; end if;
  end loop;
  if not a.pedir_foto then v_foto := null; end if;
  if v_foto is not null and v_foto not like aid::text || '/' || auth.uid()::text || '/%' then
    raise exception 'Foto no válida.';
  end if;

  select * into v_prev from audition_applications where audition_id = aid and user_id = auth.uid() for update;
  if found and v_prev.checked_in_at is not null then raise exception 'Ya te registraste en la audición; tu inscripción no se puede cambiar.'; end if;
  if not a.elegir_horario and v_prev.id is not null then v_slot := v_prev.slot_id; end if;

  -- Cupo: se bloquea el horario para que dos personas no tomen el último lugar.
  if v_slot is not null and v_slot is distinct from v_prev.slot_id then
    perform 1 from audition_slots where id = v_slot for update;
    if (select count(*) from audition_applications
         where slot_id = v_slot and estado <> 'cancelado' and (v_prev.id is null or id <> v_prev.id))
       >= (select cupo from audition_slots where id = v_slot) then
      raise exception 'Ese horario ya está lleno. Elige otro.';
    end if;
  end if;

  -- Numeración previa: el siguiente número libre (el equipo puede reordenar después).
  if a.numeracion = 'previa' and (v_prev.id is null or v_prev.numero is null) then
    perform 1 from auditions where id = aid for update;
    select coalesce(max(numero), 0) + 1 into v_num from audition_applications where audition_id = aid;
  end if;

  if v_prev.id is null then
    insert into audition_applications (audition_id, user_id, slot_id, nombre, fecha_nacimiento, telefono, foto_path, roles, respuestas,
      es_menor, tutor_nombre, tutor_telefono, tutor_email, consentimiento_datos_at, consentimiento_imagen, numero)
    values (aid, auth.uid(), v_slot, btrim(p->>'nombre'), v_nac, btrim(p->>'telefono'), v_foto, v_roles, v_resp,
      v_menor,
      case when v_tutor then nullif(btrim(p->>'tutor_nombre'), '') end,
      case when v_tutor then nullif(btrim(p->>'tutor_telefono'), '') end,
      case when v_tutor then nullif(btrim(p->>'tutor_email'), '') end,
      now(), coalesce((p->>'consentimiento_imagen')::boolean, false), v_num)
    returning id into v_id;
  else
    update audition_applications set
      slot_id = v_slot, nombre = btrim(p->>'nombre'), fecha_nacimiento = v_nac, telefono = btrim(p->>'telefono'),
      foto_path = coalesce(v_foto, foto_path), roles = v_roles, respuestas = v_resp, es_menor = v_menor,
      tutor_nombre = case when v_tutor then nullif(btrim(p->>'tutor_nombre'), '') end,
      tutor_telefono = case when v_tutor then nullif(btrim(p->>'tutor_telefono'), '') end,
      tutor_email = case when v_tutor then nullif(btrim(p->>'tutor_email'), '') end,
      consentimiento_datos_at = now(),
      consentimiento_imagen = coalesce((p->>'consentimiento_imagen')::boolean, false),
      numero = coalesce(numero, v_num),
      estado = case when estado = 'cancelado' then 'inscrito' else estado end, updated_at = now()
    where id = v_prev.id returning id into v_id;
  end if;
  return json_build_object('application_id', v_id, 'es_menor', v_menor);
end $$;

-- ──────── Evaluación con criterios propios ────────
-- Presencial: solo quien ya llegó. En línea o mixta: todos los inscritos (califican el video).
create or replace function audition_judge_queue(aid uuid, p_ronda int default 1)
returns table (id uuid, numero int, nombre text, edad int, foto_path text, roles text[], estado text,
               puntos jsonb, notas text, enlaces jsonb)
language plpgsql stable security definer set search_path = public as $$
declare v_mod text;
begin
  if not audition_perm(aid, 'audiciones.evaluar') then raise exception 'No autorizado'; end if;
  select modalidad into v_mod from auditions where auditions.id = aid;
  return query
    select a.id, a.numero, a.nombre, audition_age(aid, a.fecha_nacimiento), a.foto_path,
           (select array_agg(r.nombre order by r.orden) from audition_roles r where r.id = any(a.roles)),
           a.estado, coalesce(sc.puntos, '{}'::jsonb), sc.notas,
           coalesce((select jsonb_agg(x) from (
              select jsonb_build_object('titulo', f.etiqueta, 'url', btrim(a.respuestas->>f.id::text)) as x
                from audition_fields f
               where f.audition_id = aid and f.tipo = 'enlace' and btrim(coalesce(a.respuestas->>f.id::text, '')) ~* '^https://\S+$'
              union all
              select jsonb_build_object('titulo', v.titulo, 'url', v.url)
                from audition_videos v where v.application_id = a.id) q), '[]'::jsonb)
      from audition_applications a
      left join audition_scores sc on sc.application_id = a.id and sc.judge_id = auth.uid() and sc.ronda = p_ronda
     where a.audition_id = aid and (a.checked_in_at is not null or v_mod <> 'presencial') and a.ronda >= p_ronda
       and a.estado not in ('cancelado', 'no_cumple')
     order by a.numero nulls last, a.created_at;
end $$;

-- Resultados: promedio por criterio (entre jueces) y promedio general (de los criterios).
create or replace function audition_board_v2(aid uuid, p_ronda int default 1)
returns table (id uuid, numero int, nombre text, edad int, estado text, ronda int, roles text[],
               promedios jsonb, promedio numeric, jueces int, notas jsonb)
language plpgsql stable security definer set search_path = public as $$
declare v_mod text;
begin
  if not audition_perm(aid, 'audiciones.gestionar') then raise exception 'No autorizado'; end if;
  select modalidad into v_mod from auditions where auditions.id = aid;
  return query
    select a.id, a.numero, a.nombre, audition_age(aid, a.fecha_nacimiento), a.estado, a.ronda,
           (select array_agg(r.nombre order by r.orden) from audition_roles r where r.id = any(a.roles)),
           coalesce(c.promedios, '{}'::jsonb), c.promedio,
           (select count(*)::int from audition_scores s where s.application_id = a.id and s.ronda = p_ronda),
           coalesce((select jsonb_agg(jsonb_build_object('juez', coalesce(pr.nombre, 'Juez'), 'notas', s.notas))
                       from audition_scores s left join profiles pr on pr.id = s.judge_id
                      where s.application_id = a.id and s.ronda = p_ronda and coalesce(btrim(s.notas), '') <> ''), '[]'::jsonb)
      from audition_applications a
      left join lateral (
        select jsonb_object_agg(q.k, q.av) as promedios, round(avg(q.av), 2) as promedio
          from (select e.key as k, round(avg(e.value::text::numeric), 2) as av
                  from audition_scores s, jsonb_each(s.puntos) e
                 where s.application_id = a.id and s.ronda = p_ronda
                 group by e.key) q
      ) c on true
     where a.audition_id = aid and (a.checked_in_at is not null or v_mod <> 'presencial') and a.ronda >= p_ronda
       and a.estado <> 'cancelado'
     order by c.promedio desc nulls last, a.numero nulls last, a.created_at;
end $$;

-- ──────── Permisos de las funciones ────────
revoke execute on function audition_criterios_ok(jsonb) from public, anon;
revoke execute on function audition_scores_validate() from public, anon;
revoke execute on function my_email() from public, anon;
revoke execute on function audition_am_invited(uuid) from public, anon;
revoke execute on function my_audition_invites() from public, anon;
revoke execute on function manages_any_audition() from public, anon;
revoke execute on function audition_judge_queue(uuid, int) from public, anon;
revoke execute on function audition_board_v2(uuid, int) from public, anon;
grant execute on function audition_criterios_ok(jsonb), audition_am_invited(uuid), my_audition_invites(), manages_any_audition(),
  audition_judge_queue(uuid, int), audition_board_v2(uuid, int) to authenticated;

-- Bitácora
create trigger audit_audition_invites after insert or update or delete on audition_invites for each row execute function audit_row();
create trigger audit_audition_templates after insert or update or delete on audition_templates for each row execute function audit_row();

commit;
