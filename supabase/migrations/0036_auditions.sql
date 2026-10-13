-- 0036: audiciones (Fase 3, etapa 3D de DARF 2.0). Ver docs/DARF-2.0-FASE-3.md.
-- Decisiones de Johann: sin costo; hace falta cuenta para inscribirse; rúbrica
-- canto, baile, actuación y actitud (1–5) + notas personales del juez.
--
--   auditions               convocatoria de una obra (borrador → abierta → cerrada → finalizada)
--   audition_roles          personajes buscados
--   audition_slots          horarios con cupo
--   audition_fields         preguntas extra configurables
--   audition_applications   inscripción (con tutor y consentimiento si es menor), QR, número del día
--   audition_scores         calificación de cada juez por ronda (1 = audición, 2+ = callbacks)
--
-- Permisos por obra (0031): audiciones.gestionar (configurar, ver todo, decidir),
-- audiciones.registro (asistencia del día), audiciones.evaluar (calificar).
-- Los jueces y la mesa de registro NO ven datos de contacto: trabajan con RPC
-- que solo devuelven lo necesario. El aspirante solo ve lo suyo.
-- Sin "drop".

begin;

-- ──────── Tablas ────────
create table auditions (
  id uuid primary key default gen_random_uuid(),
  production_id text not null references productions(id) on delete cascade,
  titulo text not null check (btrim(titulo) <> ''),
  descripcion text,
  requisitos text,
  sede text,
  estado text not null default 'borrador' check (estado in ('borrador', 'abierta', 'cerrada', 'finalizada')),
  inscripcion_cierra timestamptz,
  edad_min int check (edad_min between 3 and 99),
  edad_max int check (edad_max between 3 and 99),
  created_at timestamptz not null default now(),
  check (edad_max is null or edad_min is null or edad_max >= edad_min)
);
create index idx_auditions_prod on auditions(production_id);

create table audition_roles (
  id uuid primary key default gen_random_uuid(),
  audition_id uuid not null references auditions(id) on delete cascade,
  nombre text not null check (btrim(nombre) <> ''),
  descripcion text,
  orden int not null default 0
);

create table audition_slots (
  id uuid primary key default gen_random_uuid(),
  audition_id uuid not null references auditions(id) on delete cascade,
  inicia timestamptz not null,
  cupo int not null check (cupo between 1 and 500),
  sala text
);

create table audition_fields (
  id uuid primary key default gen_random_uuid(),
  audition_id uuid not null references auditions(id) on delete cascade,
  etiqueta text not null check (btrim(etiqueta) <> ''),
  tipo text not null default 'texto' check (tipo in ('texto', 'parrafo', 'enlace', 'opcion', 'si_no')),
  opciones text[],
  obligatorio boolean not null default false,
  orden int not null default 0
);

create table audition_applications (
  id uuid primary key default gen_random_uuid(),
  audition_id uuid not null references auditions(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,     -- null = alta rápida el día de la audición
  walk_in boolean not null default false,
  slot_id uuid references audition_slots(id) on delete set null,
  estado text not null default 'inscrito' check (estado in
    ('inscrito', 'convocado', 'en_espera', 'no_cumple', 'callback', 'seleccionado', 'no_seleccionado', 'cancelado')),
  ronda int not null default 1 check (ronda between 1 and 5),
  nombre text not null check (btrim(nombre) <> ''),
  fecha_nacimiento date not null,
  telefono text not null,
  foto_path text,                                                -- bucket privado 'audiciones'
  roles uuid[] not null default '{}',                            -- personajes de interés
  respuestas jsonb not null default '{}',                        -- {field_id: valor}
  es_menor boolean not null default false,
  tutor_nombre text,
  tutor_telefono text,
  tutor_email text,
  consentimiento_datos_at timestamptz,
  consentimiento_imagen boolean not null default false,
  qr_token uuid not null unique default gen_random_uuid(),
  numero int,                                                    -- número del día (al llegar)
  checked_in_at timestamptz,
  checked_in_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (audition_id, numero),
  check (walk_in or user_id is not null),
  check (not es_menor or (coalesce(btrim(tutor_nombre), '') <> '' and coalesce(btrim(tutor_telefono), '') <> ''))
);
create unique index uq_audition_app_user on audition_applications(audition_id, user_id) where user_id is not null;
create index idx_audition_app_aud on audition_applications(audition_id, estado);
create index idx_audition_app_slot on audition_applications(slot_id);

create table audition_scores (
  application_id uuid not null references audition_applications(id) on delete cascade,
  judge_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  ronda int not null default 1,
  canto smallint check (canto between 1 and 5),
  baile smallint check (baile between 1 and 5),
  actuacion smallint check (actuacion between 1 and 5),
  actitud smallint check (actitud between 1 and 5),
  notas text,
  updated_at timestamptz not null default now(),
  primary key (application_id, judge_id, ronda)
);

-- ──────── Ayudas ────────
create or replace function audition_production(aid uuid) returns text
language sql stable security definer set search_path = public as $$
  select production_id from auditions where id = aid
$$;

create or replace function application_audition(app uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select audition_id from audition_applications where id = app
$$;

create or replace function audition_is_public(aid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from auditions where id = aid and estado in ('abierta', 'cerrada', 'finalizada'))
$$;

-- ¿Puede ver la audición desde el panel? (cualquiera de los 3 permisos)
create or replace function audition_team(aid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select has_perm(audition_production(aid), 'audiciones.gestionar')
      or has_perm(audition_production(aid), 'audiciones.registro')
      or has_perm(audition_production(aid), 'audiciones.evaluar')
$$;

-- Edad a la fecha de la audición (primer horario) o hoy.
create or replace function audition_age(aid uuid, nacimiento date) returns int
language sql stable security definer set search_path = public as $$
  select date_part('year', age(coalesce((select min(inicia) from audition_slots where audition_id = aid)::date, current_date), nacimiento))::int
$$;

-- ──────── RLS ────────
alter table auditions enable row level security;
alter table audition_roles enable row level security;
alter table audition_slots enable row level security;
alter table audition_fields enable row level security;
alter table audition_applications enable row level security;
alter table audition_scores enable row level security;

create policy auditions_public_read on auditions for select
  using (estado in ('abierta', 'cerrada', 'finalizada') or audition_team(id));
create policy auditions_team_write on auditions for all to authenticated
  using (has_perm(production_id, 'audiciones.gestionar')) with check (has_perm(production_id, 'audiciones.gestionar'));

create policy audition_roles_read on audition_roles for select using (audition_is_public(audition_id) or audition_team(audition_id));
create policy audition_slots_read on audition_slots for select using (audition_is_public(audition_id) or audition_team(audition_id));
create policy audition_fields_read on audition_fields for select using (audition_is_public(audition_id) or audition_team(audition_id));
create policy audition_roles_write on audition_roles for all to authenticated
  using (has_perm(audition_production(audition_id), 'audiciones.gestionar')) with check (has_perm(audition_production(audition_id), 'audiciones.gestionar'));
create policy audition_slots_write on audition_slots for all to authenticated
  using (has_perm(audition_production(audition_id), 'audiciones.gestionar')) with check (has_perm(audition_production(audition_id), 'audiciones.gestionar'));
create policy audition_fields_write on audition_fields for all to authenticated
  using (has_perm(audition_production(audition_id), 'audiciones.gestionar')) with check (has_perm(audition_production(audition_id), 'audiciones.gestionar'));

-- Solicitudes: el aspirante ve la suya; quien gestiona ve y decide. Inscribirse es por RPC.
create policy audition_app_own_read on audition_applications for select to authenticated using (user_id = auth.uid());
create policy audition_app_team_read on audition_applications for select to authenticated
  using (has_perm(audition_production(audition_id), 'audiciones.gestionar'));
create policy audition_app_team_update on audition_applications for update to authenticated
  using (has_perm(audition_production(audition_id), 'audiciones.gestionar'))
  with check (has_perm(audition_production(audition_id), 'audiciones.gestionar'));

-- Calificaciones: cada juez solo las suyas; quien gestiona ve todas.
create policy audition_scores_own on audition_scores for all to authenticated
  using (judge_id = auth.uid() and has_perm(audition_production(application_audition(application_id)), 'audiciones.evaluar'))
  with check (judge_id = auth.uid() and has_perm(audition_production(application_audition(application_id)), 'audiciones.evaluar'));
create policy audition_scores_team_read on audition_scores for select to authenticated
  using (has_perm(audition_production(application_audition(application_id)), 'audiciones.gestionar'));

revoke all on audition_applications, audition_scores from anon;

-- ──────── Cupo de horarios (vista pública sin datos personales) ────────
create or replace function audition_slot_availability(aid uuid)
returns table (id uuid, inicia timestamptz, sala text, cupo int, ocupados int)
language sql stable security definer set search_path = public as $$
  select s.id, s.inicia, s.sala, s.cupo,
         (select count(*)::int from audition_applications a where a.slot_id = s.id and a.estado <> 'cancelado')
    from audition_slots s
   where s.audition_id = aid and (audition_is_public(aid) or audition_team(aid))
   order by s.inicia
$$;

-- ──────── Inscribirse (aspirante con cuenta) ────────
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
  f record;
  v_id uuid;
  v_prev audition_applications%rowtype;
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
  if v_menor and (coalesce(btrim(p->>'tutor_nombre'), '') = '' or coalesce(btrim(p->>'tutor_telefono'), '') = '') then
    raise exception 'Como eres menor de edad, necesitamos el nombre y teléfono de tu madre, padre o tutor.';
  end if;
  if v_menor and (p->>'consentimiento_tutor')::boolean is not true then
    raise exception 'Tu madre, padre o tutor debe autorizar la inscripción.';
  end if;

  if exists (select 1 from audition_slots where audition_id = aid) then
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
  if v_foto is not null and v_foto not like aid::text || '/' || auth.uid()::text || '/%' then
    raise exception 'Foto no válida.';
  end if;

  select * into v_prev from audition_applications where audition_id = aid and user_id = auth.uid() for update;
  if found and v_prev.checked_in_at is not null then raise exception 'Ya te registraste en la audición; tu inscripción no se puede cambiar.'; end if;

  -- Cupo: se bloquea el horario para que dos personas no tomen el último lugar.
  if v_slot is not null then
    perform 1 from audition_slots where id = v_slot for update;
    if (select count(*) from audition_applications
         where slot_id = v_slot and estado <> 'cancelado' and (v_prev.id is null or id <> v_prev.id))
       >= (select cupo from audition_slots where id = v_slot) then
      raise exception 'Ese horario ya está lleno. Elige otro.';
    end if;
  end if;

  if v_prev.id is null then
    insert into audition_applications (audition_id, user_id, slot_id, nombre, fecha_nacimiento, telefono, foto_path, roles, respuestas,
      es_menor, tutor_nombre, tutor_telefono, tutor_email, consentimiento_datos_at, consentimiento_imagen)
    values (aid, auth.uid(), v_slot, btrim(p->>'nombre'), v_nac, btrim(p->>'telefono'), v_foto, v_roles, v_resp,
      v_menor, nullif(btrim(p->>'tutor_nombre'), ''), nullif(btrim(p->>'tutor_telefono'), ''), nullif(btrim(p->>'tutor_email'), ''),
      now(), coalesce((p->>'consentimiento_imagen')::boolean, false))
    returning id into v_id;
  else
    update audition_applications set
      slot_id = v_slot, nombre = btrim(p->>'nombre'), fecha_nacimiento = v_nac, telefono = btrim(p->>'telefono'),
      foto_path = coalesce(v_foto, foto_path), roles = v_roles, respuestas = v_resp, es_menor = v_menor,
      tutor_nombre = nullif(btrim(p->>'tutor_nombre'), ''), tutor_telefono = nullif(btrim(p->>'tutor_telefono'), ''),
      tutor_email = nullif(btrim(p->>'tutor_email'), ''), consentimiento_datos_at = now(),
      consentimiento_imagen = coalesce((p->>'consentimiento_imagen')::boolean, false),
      estado = case when estado = 'cancelado' then 'inscrito' else estado end, updated_at = now()
    where id = v_prev.id returning id into v_id;
  end if;
  return json_build_object('application_id', v_id, 'es_menor', v_menor);
end $$;

create or replace function audition_cancel_mine(app uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update audition_applications set estado = 'cancelado', updated_at = now()
   where id = app and user_id = auth.uid() and checked_in_at is null and estado in ('inscrito', 'convocado', 'en_espera');
  if not found then raise exception 'No se pudo cancelar esta inscripción.'; end if;
end $$;

-- ──────── Día de la audición: mesa de registro ────────
-- Lista sin datos de contacto.
create or replace function audition_desk_list(aid uuid)
returns table (id uuid, nombre text, slot_inicia timestamptz, estado text, numero int, checked_in_at timestamptz, walk_in boolean, es_menor boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (has_perm(audition_production(aid), 'audiciones.registro') or has_perm(audition_production(aid), 'audiciones.gestionar')) then
    raise exception 'No autorizado';
  end if;
  return query
    select a.id, a.nombre, s.inicia, a.estado, a.numero, a.checked_in_at, a.walk_in, a.es_menor
      from audition_applications a left join audition_slots s on s.id = a.slot_id
     where a.audition_id = aid and a.estado <> 'cancelado'
     order by s.inicia nulls last, a.nombre;
end $$;

-- Marcar llegada (por QR o por id) y dar número consecutivo.
create or replace function audition_checkin(aid uuid, ref text) returns json
language plpgsql security definer set search_path = public as $$
declare v audition_applications%rowtype; n int; r text := lower(btrim(coalesce(ref, '')));
begin
  if not (has_perm(audition_production(aid), 'audiciones.registro') or has_perm(audition_production(aid), 'audiciones.gestionar')) then
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
  perform 1 from auditions where id = aid for update;   -- numeración sin repetidos
  select coalesce(max(numero), 0) + 1 into n from audition_applications where audition_id = aid;
  update audition_applications set checked_in_at = now(), checked_in_by = auth.uid(), numero = n, updated_at = now() where id = v.id;
  return json_build_object('result', 'ok', 'nombre', v.nombre, 'numero', n, 'es_menor', v.es_menor);
end $$;

-- Alta rápida de quien llega sin registro previo (queda registrado y con número).
create or replace function audition_walk_in(aid uuid, p jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_nac date := nullif(p->>'fecha_nacimiento', '')::date; v_menor boolean;
begin
  if not (has_perm(audition_production(aid), 'audiciones.registro') or has_perm(audition_production(aid), 'audiciones.gestionar')) then
    raise exception 'No autorizado';
  end if;
  if coalesce(btrim(p->>'nombre'), '') = '' or coalesce(btrim(p->>'telefono'), '') = '' or v_nac is null then
    raise exception 'Faltan nombre, teléfono o fecha de nacimiento.';
  end if;
  v_menor := audition_age(aid, v_nac) < 18;
  if v_menor and (coalesce(btrim(p->>'tutor_nombre'), '') = '' or coalesce(btrim(p->>'tutor_telefono'), '') = '') then
    raise exception 'Es menor de edad: faltan nombre y teléfono de su madre, padre o tutor.';
  end if;
  insert into audition_applications (audition_id, walk_in, nombre, fecha_nacimiento, telefono, es_menor, tutor_nombre, tutor_telefono,
    consentimiento_datos_at, estado)
  values (aid, true, btrim(p->>'nombre'), v_nac, btrim(p->>'telefono'), v_menor,
    nullif(btrim(p->>'tutor_nombre'), ''), nullif(btrim(p->>'tutor_telefono'), ''), now(), 'convocado')
  returning id into v_id;
  return audition_checkin(aid, v_id::text);
end $$;

-- ──────── Evaluación: lo que ve un juez (sin contacto) ────────
create or replace function audition_judge_list(aid uuid, p_ronda int default 1)
returns table (id uuid, numero int, nombre text, edad int, foto_path text, roles text[], estado text,
               canto smallint, baile smallint, actuacion smallint, actitud smallint, notas text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_perm(audition_production(aid), 'audiciones.evaluar') then raise exception 'No autorizado'; end if;
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

-- ──────── Resultados consolidados (solo quien gestiona) ────────
create or replace function audition_board(aid uuid, p_ronda int default 1)
returns table (id uuid, numero int, nombre text, edad int, estado text, ronda int, roles text[],
               canto numeric, baile numeric, actuacion numeric, actitud numeric, promedio numeric, jueces int, notas jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_perm(audition_production(aid), 'audiciones.gestionar') then raise exception 'No autorizado'; end if;
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

-- ──────── Archivos: bucket privado 'audiciones' (<audición>/<usuario>/foto) ────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('audiciones', 'audiciones', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

create or replace function can_read_audition_object(path text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare aid uuid;
begin
  if split_part(path, '/', 2) = auth.uid()::text then return true; end if;
  begin aid := split_part(path, '/', 1)::uuid; exception when others then return false; end;
  return has_perm(audition_production(aid), 'audiciones.gestionar') or has_perm(audition_production(aid), 'audiciones.evaluar');
end $$;

create policy audiciones_own_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'audiciones' and split_part(name, '/', 2) = auth.uid()::text);
create policy audiciones_read on storage.objects for select to authenticated
  using (bucket_id = 'audiciones' and can_read_audition_object(name));

-- ──────── Permisos de las funciones ────────
revoke execute on function audition_production(uuid) from public, anon;
revoke execute on function application_audition(uuid) from public, anon;
revoke execute on function audition_team(uuid) from public;
revoke execute on function audition_age(uuid, date) from public, anon;
revoke execute on function audition_apply(uuid, jsonb) from public, anon;
revoke execute on function audition_cancel_mine(uuid) from public, anon;
revoke execute on function audition_desk_list(uuid) from public, anon;
revoke execute on function audition_checkin(uuid, text) from public, anon;
revoke execute on function audition_walk_in(uuid, jsonb) from public, anon;
revoke execute on function audition_judge_list(uuid, int) from public, anon;
revoke execute on function audition_board(uuid, int) from public, anon;
revoke execute on function can_read_audition_object(text) from public, anon;
grant execute on function audition_production(uuid), application_audition(uuid), audition_team(uuid), audition_age(uuid, date),
  audition_apply(uuid, jsonb), audition_cancel_mine(uuid), audition_desk_list(uuid), audition_checkin(uuid, text),
  audition_walk_in(uuid, jsonb), audition_judge_list(uuid, int), audition_board(uuid, int), can_read_audition_object(text)
  to authenticated;
-- Las reglas de lectura pública la usan: para un visitante siempre responde "no es del equipo".
grant execute on function audition_team(uuid), audition_is_public(uuid), audition_slot_availability(uuid) to anon, authenticated;

-- Bitácora: cambios de convocatoria y decisiones sobre aspirantes.
create trigger audit_auditions after insert or update or delete on auditions for each row execute function audit_row();

commit;
