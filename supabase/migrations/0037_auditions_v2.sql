-- 0037: Audiciones 2.0 (ajuste de la etapa 3D). Decisiones de Diego (2026-10-11):
--   * Convocatorias de una obra o GENERALES (sin obra, p. ej. "buscamos bailarines").
--     Las generales las crea el Director; cada convocatoria puede tener su propio
--     equipo (Mesa de registro, Juez, …) además del equipo de la obra.
--   * Opciones por convocatoria: pedir datos del tutor (se puede apagar si la escuela
--     ya tiene la autorización de los padres), pedir foto, elegir horario,
--     visible para todos o solo con enlace, numeración al llegar o previa.
--   * Numeración previa: automática (por horario y fecha de inscripción) y editable.
--   * Día de la audición: llegó / entró / terminó, con hora de cada paso.
--   * Videos: enlaces (YouTube no listado o Drive) ligados a la ficha del aspirante.
-- Precede: 0036. Sin borrar datos: las convocatorias existentes quedan como "de obra",
-- con las mismas reglas que tenían (tutor obligatorio, numeración al llegar).

begin;

-- ──────── Convocatorias: obra opcional y opciones ────────
alter table auditions alter column production_id drop not null;
alter table auditions
  add column visibilidad text not null default 'publica' check (visibilidad in ('publica', 'enlace')),
  add column pedir_tutor boolean not null default true,
  add column autorizacion_escuela boolean not null default false,
  add column pedir_foto boolean not null default true,
  add column elegir_horario boolean not null default true,
  add column numeracion text not null default 'llegada' check (numeracion in ('llegada', 'previa')),
  add constraint auditions_tutor_o_escuela check (pedir_tutor or autorizacion_escuela);

-- ──────── Aspirantes: tutor según la convocatoria; entrada y salida ────────
alter table audition_applications drop constraint audition_applications_check1;
alter table audition_applications
  add column entered_at timestamptz,
  add column entered_by uuid references auth.users(id),
  add column finished_at timestamptz;

-- ──────── Equipo por convocatoria ────────
create table audition_members (
  id uuid primary key default gen_random_uuid(),
  audition_id uuid not null references auditions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id text not null references panel_roles(id) on delete cascade,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (audition_id, user_id, role_id)
);
create index idx_audition_members_user on audition_members(user_id);

-- ──────── Videos ────────
create table audition_videos (
  id uuid primary key default gen_random_uuid(),
  audition_id uuid not null references auditions(id) on delete cascade,
  application_id uuid references audition_applications(id) on delete cascade,   -- null = video del día o de un grupo
  titulo text not null check (btrim(titulo) <> ''),
  url text not null check (url ~* '^https://[^ ]+$' and length(url) <= 500),
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index idx_audition_videos_aud on audition_videos(audition_id);
create index idx_audition_videos_app on audition_videos(application_id);

-- ──────── Permisos ────────
-- ¿Tiene "perm" en el equipo propio de la convocatoria?
create or replace function audition_member_perm(aid uuid, perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from audition_members m join role_permissions rp on rp.role_id = m.role_id
     where m.audition_id = aid and m.user_id = auth.uid() and rp.permission_id = perm)
$$;

-- Permiso sobre una convocatoria: el de su obra (en una general, has_perm(null) = solo
-- el Director) o el de su equipo propio.
create or replace function audition_perm(aid uuid, perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select has_perm(audition_production(aid), perm) or audition_member_perm(aid, perm)
$$;

-- Lo mismo para una fila nueva o editada (las reglas de escritura no pueden buscarla por id).
create or replace function audition_row_perm(aid uuid, pid text, perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select has_perm(pid, perm) or audition_member_perm(aid, perm)
$$;

create or replace function audition_row_team(aid uuid, pid text) returns boolean
language sql stable security definer set search_path = public as $$
  select audition_row_perm(aid, pid, 'audiciones.gestionar')
      or audition_row_perm(aid, pid, 'audiciones.registro')
      or audition_row_perm(aid, pid, 'audiciones.evaluar')
$$;

-- ¿Puede armar el equipo de la convocatoria? Obra: quien da permisos en ella. General: el Director.
create or replace function audition_admin(aid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select has_perm(audition_production(aid), 'permisos.gestionar')
$$;

create or replace function audition_team(aid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select audition_perm(aid, 'audiciones.gestionar')
      or audition_perm(aid, 'audiciones.registro')
      or audition_perm(aid, 'audiciones.evaluar')
$$;

-- Convocatorias a las que tengo acceso por su equipo propio (el panel las muestra).
create or replace function my_audition_access()
returns table (audition_id uuid, permission_id text)
language sql stable security definer set search_path = public as $$
  select distinct m.audition_id, rp.permission_id
    from audition_members m join role_permissions rp on rp.role_id = m.role_id
   where m.user_id = auth.uid() and rp.permission_id like 'audiciones.%'
$$;

-- Cambiar la obra de una convocatoria exige permiso en la obra nueva (general → Director).
create or replace function auditions_production_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.production_id is distinct from old.production_id
     and not has_perm(new.production_id, 'audiciones.gestionar') then
    raise exception 'No tienes permiso para mover la convocatoria a esa obra.';
  end if;
  return new;
end $$;
create trigger auditions_production_guard before update of production_id on auditions
  for each row execute function auditions_production_guard();

-- ──────── Reglas de acceso (mismas reglas, ahora también con el equipo propio) ────────
alter policy auditions_public_read on auditions
  using (estado in ('abierta', 'cerrada', 'finalizada') or audition_row_team(id, production_id));
alter policy auditions_team_write on auditions
  using (audition_perm(id, 'audiciones.gestionar'))
  with check (audition_row_perm(id, production_id, 'audiciones.gestionar'));
alter policy audition_roles_write on audition_roles
  using (audition_perm(audition_id, 'audiciones.gestionar')) with check (audition_perm(audition_id, 'audiciones.gestionar'));
alter policy audition_slots_write on audition_slots
  using (audition_perm(audition_id, 'audiciones.gestionar')) with check (audition_perm(audition_id, 'audiciones.gestionar'));
alter policy audition_fields_write on audition_fields
  using (audition_perm(audition_id, 'audiciones.gestionar')) with check (audition_perm(audition_id, 'audiciones.gestionar'));
alter policy audition_app_team_read on audition_applications
  using (audition_perm(audition_id, 'audiciones.gestionar'));
alter policy audition_app_team_update on audition_applications
  using (audition_perm(audition_id, 'audiciones.gestionar')) with check (audition_perm(audition_id, 'audiciones.gestionar'));
alter policy audition_scores_own on audition_scores
  using (judge_id = auth.uid() and audition_perm(application_audition(application_id), 'audiciones.evaluar'))
  with check (judge_id = auth.uid() and audition_perm(application_audition(application_id), 'audiciones.evaluar'));
alter policy audition_scores_team_read on audition_scores
  using (audition_perm(application_audition(application_id), 'audiciones.gestionar'));

alter table audition_members enable row level security;
create policy audition_members_read on audition_members for select to authenticated
  using (user_id = auth.uid() or audition_admin(audition_id) or audition_perm(audition_id, 'audiciones.gestionar'));
create policy audition_members_remove on audition_members for delete to authenticated
  using (audition_admin(audition_id));
revoke all on audition_members from anon;

alter table audition_videos enable row level security;
create policy audition_videos_read on audition_videos for select to authenticated
  using (audition_perm(audition_id, 'audiciones.gestionar') or audition_perm(audition_id, 'audiciones.evaluar'));
create policy audition_videos_write on audition_videos for all to authenticated
  using (audition_perm(audition_id, 'audiciones.gestionar'))
  with check (audition_perm(audition_id, 'audiciones.gestionar')
              and (application_id is null or application_audition(application_id) = audition_id));
revoke all on audition_videos from anon;

-- ──────── Equipo propio: agregar y listar ────────
create or replace function audition_add_member(aid uuid, p_email text, p_role text) returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid; mid uuid;
begin
  if not exists (select 1 from auditions where id = aid) then raise exception 'La convocatoria no existe.'; end if;
  if not audition_admin(aid) then raise exception 'No tienes permiso para armar el equipo de esta convocatoria.'; end if;
  if not exists (select 1 from role_permissions where role_id = p_role and permission_id like 'audiciones.%') then
    raise exception 'Ese rol no tiene permisos de audiciones.';
  end if;
  select id into uid from auth.users where lower(email) = lower(btrim(p_email));
  if uid is null then raise exception 'Esa persona aún no tiene cuenta en DARF. Pídele que se registre primero.'; end if;
  insert into audition_members (audition_id, user_id, role_id) values (aid, uid, p_role)
  on conflict (audition_id, user_id, role_id) do nothing
  returning id into mid;
  return mid;
end $$;

create or replace function audition_list_members(aid uuid)
returns table (id uuid, user_id uuid, nombre text, email text, role_id text, role_nombre text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (audition_admin(aid) or audition_perm(aid, 'audiciones.gestionar')) then raise exception 'No autorizado'; end if;
  return query
    select m.id, m.user_id, p.nombre, u.email::text, m.role_id, r.nombre
      from audition_members m
      join auth.users u on u.id = m.user_id
      left join profiles p on p.id = m.user_id
      join panel_roles r on r.id = m.role_id
     where m.audition_id = aid
     order by p.nombre nulls last, u.email, r.orden;
end $$;

-- ──────── Inscribirse: respeta las opciones de la convocatoria ────────
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

  if not a.elegir_horario then
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

-- Quien cancela libera su número.
create or replace function audition_cancel_mine(app uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update audition_applications set estado = 'cancelado', numero = null, updated_at = now()
   where id = app and user_id = auth.uid() and checked_in_at is null and estado in ('inscrito', 'convocado', 'en_espera');
  if not found then raise exception 'No se pudo cancelar esta inscripción.'; end if;
end $$;

-- ──────── Día de la audición ────────
-- Lista en orden, sin datos de contacto, con las horas de cada paso.
create or replace function audition_day_list(aid uuid)
returns table (id uuid, numero int, nombre text, slot_id uuid, slot_inicia timestamptz, sala text, estado text,
               walk_in boolean, es_menor boolean, checked_in_at timestamptz, entered_at timestamptz, finished_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (audition_perm(aid, 'audiciones.registro') or audition_perm(aid, 'audiciones.gestionar')) then
    raise exception 'No autorizado';
  end if;
  return query
    select a.id, a.numero, a.nombre, a.slot_id, s.inicia, s.sala, a.estado, a.walk_in, a.es_menor,
           a.checked_in_at, a.entered_at, a.finished_at
      from audition_applications a left join audition_slots s on s.id = a.slot_id
     where a.audition_id = aid and a.estado <> 'cancelado'
     order by a.numero nulls last, s.inicia nulls last, a.created_at;
end $$;

-- Compatibilidad: la lista anterior, ahora con los permisos de la convocatoria.
create or replace function audition_desk_list(aid uuid)
returns table (id uuid, nombre text, slot_inicia timestamptz, estado text, numero int, checked_in_at timestamptz, walk_in boolean, es_menor boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  return query select d.id, d.nombre, d.slot_inicia, d.estado, d.numero, d.checked_in_at, d.walk_in, d.es_menor
                 from audition_day_list(aid) d;
end $$;

-- Marcar llegada (por QR o por id). Numeración al llegar: siguiente número.
-- Numeración previa: conserva su número (o recibe el siguiente si no tenía).
create or replace function audition_checkin(aid uuid, ref text) returns json
language plpgsql security definer set search_path = public as $$
declare v audition_applications%rowtype; n int; r text := lower(btrim(coalesce(ref, '')));
begin
  if not (audition_perm(aid, 'audiciones.registro') or audition_perm(aid, 'audiciones.gestionar')) then
    raise exception 'No autorizado';
  end if;
  select * into v from audition_applications
   where audition_id = aid and (qr_token::text = r or id::text = r) for update;
  if not found then return json_build_object('result', 'no_encontrado'); end if;
  if v.estado in ('cancelado', 'no_cumple') then
    return json_build_object('result', 'no_admitido', 'nombre', v.nombre, 'estado', v.estado);
  end if;
  if v.checked_in_at is not null then
    return json_build_object('result', 'ya_registrado', 'nombre', v.nombre, 'numero', v.numero);
  end if;
  n := v.numero;
  if n is null or (select numeracion from auditions where id = aid) = 'llegada' then
    perform 1 from auditions where id = aid for update;   -- numeración sin repetidos
    select coalesce(max(numero), 0) + 1 into n from audition_applications where audition_id = aid and id <> v.id;
  end if;
  update audition_applications set checked_in_at = now(), checked_in_by = auth.uid(), numero = n, updated_at = now() where id = v.id;
  return json_build_object('result', 'ok', 'nombre', v.nombre, 'numero', n, 'es_menor', v.es_menor);
end $$;

-- Entró a audicionar / terminó / deshacer el último paso.
create or replace function audition_step(aid uuid, app uuid, paso text) returns json
language plpgsql security definer set search_path = public as $$
declare v audition_applications%rowtype;
begin
  if not (audition_perm(aid, 'audiciones.registro') or audition_perm(aid, 'audiciones.gestionar')) then
    raise exception 'No autorizado';
  end if;
  select * into v from audition_applications where id = app and audition_id = aid for update;
  if not found then raise exception 'No encontrado'; end if;
  if v.checked_in_at is null then raise exception 'Primero marca su llegada.'; end if;
  if paso = 'entro' then
    if v.entered_at is not null then raise exception 'Ya había entrado.'; end if;
    update audition_applications set entered_at = now(), entered_by = auth.uid(), updated_at = now() where id = app;
  elsif paso = 'termino' then
    if v.entered_at is null then raise exception 'Primero marca que entró.'; end if;
    if v.finished_at is not null then raise exception 'Ya había terminado.'; end if;
    update audition_applications set finished_at = now(), updated_at = now() where id = app;
  elsif paso = 'deshacer' then
    if v.finished_at is not null then
      update audition_applications set finished_at = null, updated_at = now() where id = app;
    elsif v.entered_at is not null then
      update audition_applications set entered_at = null, entered_by = null, updated_at = now() where id = app;
    else
      raise exception 'No hay nada que deshacer.';
    end if;
  else
    raise exception 'Paso no válido';
  end if;
  return (select json_build_object('entered_at', entered_at, 'finished_at', finished_at) from audition_applications where id = app);
end $$;

-- Alta rápida de quien llega sin registro previo (queda registrado y con número).
create or replace function audition_walk_in(aid uuid, p jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_nac date := nullif(p->>'fecha_nacimiento', '')::date; v_menor boolean; v_tutor boolean;
begin
  if not (audition_perm(aid, 'audiciones.registro') or audition_perm(aid, 'audiciones.gestionar')) then
    raise exception 'No autorizado';
  end if;
  if coalesce(btrim(p->>'nombre'), '') = '' or coalesce(btrim(p->>'telefono'), '') = '' or v_nac is null then
    raise exception 'Faltan nombre, teléfono o fecha de nacimiento.';
  end if;
  v_menor := audition_age(aid, v_nac) < 18;
  v_tutor := v_menor and (select pedir_tutor from auditions where id = aid);
  if v_tutor and (coalesce(btrim(p->>'tutor_nombre'), '') = '' or coalesce(btrim(p->>'tutor_telefono'), '') = '') then
    raise exception 'Es menor de edad: faltan nombre y teléfono de su madre, padre o tutor.';
  end if;
  insert into audition_applications (audition_id, walk_in, nombre, fecha_nacimiento, telefono, es_menor, tutor_nombre, tutor_telefono,
    consentimiento_datos_at, estado)
  values (aid, true, btrim(p->>'nombre'), v_nac, btrim(p->>'telefono'), v_menor,
    case when v_tutor then nullif(btrim(p->>'tutor_nombre'), '') end,
    case when v_tutor then nullif(btrim(p->>'tutor_telefono'), '') end, now(), 'convocado')
  returning id into v_id;
  return audition_checkin(aid, v_id::text);
end $$;

-- Ordenar automáticamente a quienes aún no llegan: por horario y luego por fecha de
-- inscripción, después de los números ya usados por quienes llegaron.
create or replace function audition_auto_order(aid uuid) returns int
language plpgsql security definer set search_path = public as $$
declare base int; n int;
begin
  if not audition_perm(aid, 'audiciones.gestionar') then raise exception 'No autorizado'; end if;
  perform 1 from auditions where id = aid for update;
  update audition_applications set numero = null
   where audition_id = aid and checked_in_at is null;
  select coalesce(max(numero), 0) into base from audition_applications where audition_id = aid;
  with ordenados as (
    select a.id, row_number() over (order by s.inicia nulls last, a.created_at, a.id) as rn
      from audition_applications a left join audition_slots s on s.id = a.slot_id
     where a.audition_id = aid and a.checked_in_at is null and a.estado not in ('cancelado', 'no_cumple')
  )
  update audition_applications x set numero = base + o.rn, updated_at = now()
    from ordenados o where x.id = o.id;
  get diagnostics n = row_count;
  return n;
end $$;

-- Intercambiar el lugar de dos aspirantes (subir / bajar en la lista).
create or replace function audition_swap(aid uuid, a1 uuid, a2 uuid) returns void
language plpgsql security definer set search_path = public as $$
declare n1 int; n2 int;
begin
  if not audition_perm(aid, 'audiciones.gestionar') then raise exception 'No autorizado'; end if;
  perform 1 from auditions where id = aid for update;
  select numero into n1 from audition_applications where id = a1 and audition_id = aid;
  select numero into n2 from audition_applications where id = a2 and audition_id = aid;
  if n1 is null or n2 is null then raise exception 'Primero asigna números.'; end if;
  update audition_applications set numero = null where id = a1;
  update audition_applications set numero = n1, updated_at = now() where id = a2;
  update audition_applications set numero = n2, updated_at = now() where id = a1;
end $$;

-- Asignar horario (cuando el aspirante no lo elige).
create or replace function audition_set_slot(aid uuid, app uuid, p_slot uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not audition_perm(aid, 'audiciones.gestionar') then raise exception 'No autorizado'; end if;
  if p_slot is not null and not exists (select 1 from audition_slots where id = p_slot and audition_id = aid) then
    raise exception 'Ese horario no es de esta convocatoria.';
  end if;
  update audition_applications set slot_id = p_slot, updated_at = now() where id = app and audition_id = aid;
  if not found then raise exception 'No encontrado'; end if;
end $$;

-- ──────── Evaluación y resultados: mismas consultas, permisos de la convocatoria ────────
create or replace function audition_judge_list(aid uuid, p_ronda int default 1)
returns table (id uuid, numero int, nombre text, edad int, foto_path text, roles text[], estado text,
               canto smallint, baile smallint, actuacion smallint, actitud smallint, notas text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not audition_perm(aid, 'audiciones.evaluar') then raise exception 'No autorizado'; end if;
  return query
    select a.id, a.numero, a.nombre, audition_age(aid, a.fecha_nacimiento), a.foto_path,
           (select array_agg(r.nombre order by r.orden) from audition_roles r where r.id = any(a.roles)),
           a.estado, sc.canto, sc.baile, sc.actuacion, sc.actitud, sc.notas
      from audition_applications a
      left join audition_scores sc on sc.application_id = a.id and sc.judge_id = auth.uid() and sc.ronda = p_ronda
     where a.audition_id = aid and a.checked_in_at is not null and a.ronda >= p_ronda
       and a.estado not in ('cancelado', 'no_cumple')
     order by a.numero;
end $$;

create or replace function audition_board(aid uuid, p_ronda int default 1)
returns table (id uuid, numero int, nombre text, edad int, estado text, ronda int, roles text[],
               canto numeric, baile numeric, actuacion numeric, actitud numeric, promedio numeric, jueces int, notas jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if not audition_perm(aid, 'audiciones.gestionar') then raise exception 'No autorizado'; end if;
  return query
    select a.id, a.numero, a.nombre, audition_age(aid, a.fecha_nacimiento), a.estado, a.ronda,
           (select array_agg(r.nombre order by r.orden) from audition_roles r where r.id = any(a.roles)),
           round(avg(sc.canto), 2), round(avg(sc.baile), 2), round(avg(sc.actuacion), 2), round(avg(sc.actitud), 2),
           round((coalesce(avg(sc.canto), 0) + coalesce(avg(sc.baile), 0) + coalesce(avg(sc.actuacion), 0) + coalesce(avg(sc.actitud), 0))
                 / nullif((avg(sc.canto) is not null)::int + (avg(sc.baile) is not null)::int + (avg(sc.actuacion) is not null)::int + (avg(sc.actitud) is not null)::int, 0), 2),
           count(sc.judge_id)::int,
           coalesce(jsonb_agg(jsonb_build_object('juez', coalesce(pr.nombre, 'Juez'), 'notas', sc.notas)) filter (where coalesce(btrim(sc.notas), '') <> ''), '[]')
      from audition_applications a
      left join audition_scores sc on sc.application_id = a.id and sc.ronda = p_ronda
      left join profiles pr on pr.id = sc.judge_id
     where a.audition_id = aid and a.checked_in_at is not null and a.ronda >= p_ronda and a.estado <> 'cancelado'
     group by a.id
     order by 12 desc nulls last, a.numero;
end $$;

create or replace function can_read_audition_object(path text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare aid uuid;
begin
  if split_part(path, '/', 2) = auth.uid()::text then return true; end if;
  begin aid := split_part(path, '/', 1)::uuid; exception when others then return false; end;
  return audition_perm(aid, 'audiciones.gestionar') or audition_perm(aid, 'audiciones.evaluar');
end $$;

-- ──────── Permisos de las funciones ────────
revoke execute on function audition_member_perm(uuid, text) from public, anon;
revoke execute on function audition_row_perm(uuid, text, text) from public, anon;
revoke execute on function audition_admin(uuid) from public, anon;
revoke execute on function audition_row_team(uuid, text) from public;
revoke execute on function my_audition_access() from public, anon;
revoke execute on function auditions_production_guard() from public, anon;
revoke execute on function audition_add_member(uuid, text, text) from public, anon;
revoke execute on function audition_list_members(uuid) from public, anon;
revoke execute on function audition_day_list(uuid) from public, anon;
revoke execute on function audition_step(uuid, uuid, text) from public, anon;
revoke execute on function audition_auto_order(uuid) from public, anon;
revoke execute on function audition_swap(uuid, uuid, uuid) from public, anon;
revoke execute on function audition_set_slot(uuid, uuid, uuid) from public, anon;
revoke execute on function audition_perm(uuid, text) from public, anon;
grant execute on function audition_member_perm(uuid, text), audition_row_perm(uuid, text, text), audition_admin(uuid),
  my_audition_access(), audition_add_member(uuid, text, text), audition_list_members(uuid), audition_day_list(uuid),
  audition_step(uuid, uuid, text), audition_auto_order(uuid), audition_swap(uuid, uuid, uuid), audition_set_slot(uuid, uuid, uuid),
  audition_perm(uuid, text)
  to authenticated;
-- La lectura pública de convocatorias la usa; para un visitante siempre responde "no".
grant execute on function audition_row_team(uuid, text) to anon, authenticated;

-- Bitácora: quién entra y sale del equipo de una convocatoria.
create trigger audit_audition_members after insert or update or delete on audition_members for each row execute function audit_row();

commit;
