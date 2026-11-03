-- 0133 (Diego 2026-11-03): dos cosas de audiciones.
--   1) "Pedir que completen": se agregaron preguntas nuevas y la foto cuando ya había solicitudes. El equipo le pide a
--      una persona (o a todas las que les falte algo) que complete su inscripción: le llega el aviso y puede editarla
--      aunque la inscripción ya haya cerrado. Al guardar, se quita el pedido.
--   2) Grupos que pasan juntos: en el día de la audición se juntan varias personas en un mismo turno. Cada quien
--      conserva su número y se califica por separado, pero con un solo "Siguiente" entra (y sale) todo el grupo, y los
--      jueces ven a cada integrante en su propia pestaña.
-- Precede: 0132.

begin;

alter table audition_applications add column if not exists completar_pedido_at timestamptz;
alter table audition_applications add column if not exists completado_at timestamptz;
alter table audition_applications add column if not exists grupo_turno uuid;
create index if not exists audition_applications_grupo_idx on audition_applications(grupo_turno) where grupo_turno is not null;

-- ──────── 1. Pedir que completen ────────
-- Qué le falta a una solicitud: la foto (si se pide) y las preguntas obligatorias sin respuesta.
create or replace function _audition_faltantes(x audition_applications) returns text[]
language sql stable security definer set search_path = public as $$
  select array_remove(array[case when au.pedir_foto and x.foto_path is null then 'Foto' end], null)
      || coalesce((select array_agg(f.etiqueta order by f.orden) from audition_fields f
                    where f.audition_id = x.audition_id and f.obligatorio
                      and coalesce(btrim(x.respuestas->>f.id::text), '') = ''), '{}')
    from auditions au where au.id = x.audition_id
$$;
revoke all on function _audition_faltantes(audition_applications) from public, anon, authenticated;

-- Para el panel: qué le falta a cada solicitud y si ya se le pidió.
create or replace function audition_faltantes(aid uuid)
returns table (id uuid, faltan text[], pedido_at timestamptz, completado_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not audition_perm(aid, 'audiciones.gestionar') then raise exception 'No autorizado'; end if;
  return query select a.id, _audition_faltantes(a), a.completar_pedido_at, a.completado_at
    from audition_applications a where a.audition_id = aid and a.estado not in ('cancelado');
end $$;
revoke all on function audition_faltantes(uuid) from public, anon;
grant execute on function audition_faltantes(uuid) to authenticated;

-- Pedir que completen: a las solicitudes dadas, o (p_apps null) a todas las que les falte algo. Solo a quien tiene
-- cuenta (puede editar) y aún no se registra en la audición. Les llega el aviso con lo que falta.
create or replace function audition_pedir_completar(aid uuid, p_apps uuid[] default null) returns int
language plpgsql security definer set search_path = public as $$
declare au auditions; r record; n int := 0;
begin
  if not audition_perm(aid, 'audiciones.gestionar') then raise exception 'No autorizado'; end if;
  select * into au from auditions where id = aid;
  if au.estado not in ('abierta', 'cerrada') then raise exception 'La convocatoria debe estar abierta o cerrada para pedir cambios.'; end if;
  for r in
    select a.id, a.user_id, _audition_faltantes(a) as faltan from audition_applications a
     where a.audition_id = aid and a.user_id is not null and a.checked_in_at is null and a.estado not in ('cancelado', 'no_cumple')
       and (case when p_apps is null then cardinality(_audition_faltantes(a)) > 0 else a.id = any(p_apps) end)
  loop
    update audition_applications set completar_pedido_at = now(), updated_at = now() where id = r.id;
    n := n + 1;
    begin
      perform notify(array[r.user_id], 'audicion', 'Completa tu inscripción',
        concat_ws(' · ', au.titulo, case when cardinality(r.faltan) > 0 then 'Falta: ' || array_to_string(r.faltan, ', ')
                                         else 'Revisa y actualiza tus datos' end),
        '/audiciones/' || aid, au.production_id);
    exception when others then null;
    end;
  end loop;
  insert into audit_log (tabla, accion, production_id, antes, despues)
    values ('audition_applications', 'pedir_completar', au.production_id, null, jsonb_build_object('audicion', aid, 'personas', n));
  return n;
end $$;
revoke all on function audition_pedir_completar(uuid, uuid[]) from public, anon;
grant execute on function audition_pedir_completar(uuid, uuid[]) to authenticated;

-- Inscribirse / editar: igual que 0038, más el permiso de editar si se le pidió completar (y se quita al guardar).
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
  v_reabierta boolean;
begin
  if auth.uid() is null then raise exception 'Necesitas iniciar sesión para inscribirte.'; end if;
  select * into a from auditions where id = aid;
  if not found then raise exception 'Esta convocatoria no está abierta.'; end if;
  -- 0133: a quien el equipo le pidió completar su inscripción, se le deja editarla aunque ya haya cerrado.
  select x.completar_pedido_at is not null and x.estado not in ('cancelado', 'no_cumple') into v_reabierta
    from audition_applications x where x.audition_id = aid and x.user_id = auth.uid();
  v_reabierta := coalesce(v_reabierta, false) and a.estado in ('abierta', 'cerrada');
  if not v_reabierta then
    if a.estado <> 'abierta' then raise exception 'Esta convocatoria no está abierta.'; end if;
    if a.inscripcion_cierra is not null and now() > a.inscripcion_cierra then raise exception 'La inscripción ya cerró.'; end if;
    if a.solo_invitados and not audition_am_invited(aid) then
      raise exception 'Esta convocatoria es solo por invitación. Si te invitaron, entra con el mismo correo al que te llegó la invitación.';
    end if;
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
      estado = case when estado = 'cancelado' then 'inscrito' else estado end,
      completar_pedido_at = null, completado_at = case when completar_pedido_at is not null then now() else completado_at end,
      updated_at = now()
    where id = v_prev.id returning id into v_id;
  end if;
  return json_build_object('application_id', v_id, 'es_menor', v_menor);
end $$;

-- ──────── 2. Grupos que pasan juntos ────────
create or replace function audition_grupos(aid uuid) returns table (id uuid, grupo_turno uuid)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (audition_puede_fila(aid) or audition_perm(aid, 'audiciones.evaluar')) then raise exception 'No autorizado'; end if;
  return query select a.id, a.grupo_turno from audition_applications a where a.audition_id = aid and a.grupo_turno is not null;
end $$;
revoke all on function audition_grupos(uuid) from public, anon;
grant execute on function audition_grupos(uuid) to authenticated;

-- Juntar en un turno (2 o más que aún no pasan). Si alguno ya estaba en otro grupo, se cambia a este.
create or replace function audition_agrupar(aid uuid, p_apps uuid[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare g uuid := gen_random_uuid(); au auditions;
begin
  if not audition_puede_fila(aid) then raise exception 'No autorizado'; end if;
  if coalesce(cardinality(p_apps), 0) < 2 then raise exception 'Palomea al menos a 2 personas para que pasen juntas.'; end if;
  select * into au from auditions where id = aid for update;
  if (select count(*) from audition_applications where audition_id = aid and id = any(p_apps) and estado not in ('cancelado', 'no_cumple'))
     <> cardinality(p_apps) then
    raise exception 'Alguna de las personas no es de esta audición.';
  end if;
  if exists (select 1 from audition_applications where id = any(p_apps) and entered_at is not null) then
    raise exception 'Alguna de las personas ya pasó: solo se juntan quienes aún no pasan.';
  end if;
  update audition_applications set grupo_turno = g, updated_at = now() where id = any(p_apps);
  -- Grupos que quedaron de una sola persona ya no son grupo.
  update audition_applications x set grupo_turno = null
   where x.audition_id = aid and x.grupo_turno is not null and x.grupo_turno <> g
     and (select count(*) from audition_applications y where y.grupo_turno = x.grupo_turno) < 2;
  insert into audit_log (tabla, accion, production_id, antes, despues)
    values ('audition_applications', 'agrupar', au.production_id, null, jsonb_build_object('audicion', aid, 'personas', cardinality(p_apps)));
  return g;
end $$;
revoke all on function audition_agrupar(uuid, uuid[]) from public, anon;
grant execute on function audition_agrupar(uuid, uuid[]) to authenticated;

-- Separar a alguien de su grupo (si el grupo queda de uno, deja de ser grupo).
create or replace function audition_separar(aid uuid, app uuid) returns void
language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  if not audition_puede_fila(aid) then raise exception 'No autorizado'; end if;
  select grupo_turno into g from audition_applications where id = app and audition_id = aid for update;
  if g is null then return; end if;
  update audition_applications set grupo_turno = null, updated_at = now() where id = app;
  if (select count(*) from audition_applications where grupo_turno = g) < 2 then
    update audition_applications set grupo_turno = null, updated_at = now() where grupo_turno = g;
  end if;
end $$;
revoke all on function audition_separar(uuid, uuid) from public, anon;
grant execute on function audition_separar(uuid, uuid) to authenticated;

-- En escena: al entrar alguien de un grupo entra todo su grupo (los que ya llegaron); al salir, sale todo el grupo.
create or replace function audition_en_escena(aid uuid, app uuid) returns json
language plpgsql security definer set search_path = public as $$
declare v audition_applications; prev uuid; prev_g uuid; f text;
begin
  if not audition_puede_fila(aid) then raise exception 'No autorizado'; end if;
  select en_escena, fase into prev, f from auditions where id = aid for update;
  if not found then raise exception 'No se encontró la audición.'; end if;
  if app is not null then
    select * into v from audition_applications where id = app and audition_id = aid for update;
    if not found then raise exception 'Esa persona no es de esta audición.'; end if;
    if v.checked_in_at is null then raise exception 'Primero marca su llegada en la entrada.'; end if;
    if v.estado in ('cancelado', 'no_cumple') then raise exception 'Esa solicitud está cancelada.'; end if;
    if f = 'callback' and v.estado <> 'callback' then raise exception 'Esa persona no está llamada a callback.'; end if;
  end if;
  if prev is not null and prev is distinct from app then
    select grupo_turno into prev_g from audition_applications where id = prev;
    update audition_applications set finished_at = now(), updated_at = now()
     where (id = prev or (prev_g is not null and grupo_turno = prev_g and audition_id = aid))
       and entered_at is not null and finished_at is null
       and (v.grupo_turno is null or grupo_turno is distinct from v.grupo_turno);
  end if;
  if app is not null then
    update audition_applications set entered_at = coalesce(entered_at, now()), entered_by = coalesce(entered_by, auth.uid()),
           finished_at = null, updated_at = now()
     where id = app
        or (v.grupo_turno is not null and grupo_turno = v.grupo_turno and audition_id = aid and checked_in_at is not null
            and estado not in ('cancelado', 'no_cumple') and (f <> 'callback' or estado = 'callback'));
  end if;
  update auditions set en_escena = app, en_escena_at = case when app is null then null else now() end where id = aid;
  return json_build_object('app', app, 'numero', v.numero, 'nombre', v.nombre);
end $$;
revoke all on function audition_en_escena(uuid, uuid) from public, anon;
grant execute on function audition_en_escena(uuid, uuid) to authenticated;

-- Siguiente: igual que 0131, pero no toma a quien va en el grupo que está en escena.
create or replace function audition_siguiente(aid uuid) returns json
language plpgsql security definer set search_path = public as $$
declare cur uuid; cur_num int; cur_g uuid; nxt uuid; f text;
begin
  if not audition_puede_fila(aid) then raise exception 'No autorizado'; end if;
  select en_escena, fase into cur, f from auditions where id = aid for update;
  select numero, grupo_turno into cur_num, cur_g from audition_applications where id = cur;
  select a.id into nxt from audition_applications a
   where a.audition_id = aid and a.checked_in_at is not null and a.finished_at is null
     and a.estado not in ('cancelado', 'no_cumple') and a.id is distinct from cur
     and (cur_g is null or a.grupo_turno is distinct from cur_g)
     and (f <> 'callback' or a.estado = 'callback')
   order by (cur_num is not null and coalesce(a.numero, 2147483647) < cur_num), a.numero nulls last, a.checked_in_at
   limit 1;
  if nxt is null then
    perform audition_en_escena(aid, null);
    return json_build_object('app', null);
  end if;
  return audition_en_escena(aid, nxt);
end $$;
revoke all on function audition_siguiente(uuid) from public, anon;
grant execute on function audition_siguiente(uuid) to authenticated;

-- Pantalla del juez: una persona (lo mismo que 0115) …
create or replace function _audition_juez_persona(aid uuid, p_app uuid, p_ronda int, p_desde timestamptz) returns json
language plpgsql stable security definer set search_path = public as $$
declare a audition_applications; v_person uuid;
begin
  select * into a from audition_applications where id = p_app and audition_id = aid;
  if not found then return null; end if;
  if a.user_id is not null then select id into v_person from people where profile_id = a.user_id; end if;
  return json_build_object(
    'app', a.id, 'numero', a.numero, 'nombre', a.nombre, 'edad', audition_age(aid, a.fecha_nacimiento),
    'foto_path', a.foto_path, 'desde', p_desde,
    'personajes', (select array_agg(r.nombre order by r.orden) from audition_roles r where r.id = any(a.roles)),
    'respuestas', coalesce((
      select jsonb_agg(jsonb_build_object('pregunta', f.etiqueta, 'respuesta', a.respuestas->>f.id::text) order by f.orden)
        from audition_fields f
       where f.audition_id = aid and f.tipo <> 'enlace' and btrim(coalesce(a.respuestas->>f.id::text, '')) <> ''), '[]'::jsonb),
    'enlaces', coalesce((select jsonb_agg(x) from (
        select jsonb_build_object('titulo', f.etiqueta, 'url', btrim(a.respuestas->>f.id::text)) as x
          from audition_fields f
         where f.audition_id = aid and f.tipo = 'enlace' and btrim(coalesce(a.respuestas->>f.id::text, '')) ~* '^https://\S+$'
        union all
        select jsonb_build_object('titulo', v.titulo, 'url', v.url) from audition_videos v where v.application_id = a.id) q), '[]'::jsonb),
    'entrevista', coalesce(a.entrevista, '[]'::jsonb), 'extra', a.entrevista_extra, 'entrevista_at', a.entrevista_at,
    'historial', coalesce((
      select jsonb_agg(jsonb_build_object('obra', p.nombre, 'temporada', p.temporada, 'tipo', c.tipo, 'papel', c.papel) order by p.created_at desc)
        from production_credits c join productions p on p.id = c.production_id
       where v_person is not null and c.person_id = v_person), '[]'::jsonb),
    'puntos', coalesce((select sc.puntos from audition_scores sc where sc.application_id = a.id and sc.judge_id = auth.uid() and sc.ronda = p_ronda), '{}'::jsonb),
    'notas', (select sc.notas from audition_scores sc where sc.application_id = a.id and sc.judge_id = auth.uid() and sc.ronda = p_ronda),
    'picks', coalesce((select jsonb_agg(jsonb_build_object('opcion', k.opcion, 'role_id', k.role_id, 'ensamble', k.ensamble))
        from audition_picks k where k.application_id = a.id and k.judge_id = auth.uid() and k.ronda = p_ronda), '[]'::jsonb));
end $$;
revoke all on function _audition_juez_persona(uuid, uuid, int, timestamptz) from public, anon, authenticated;

-- … y quien está en escena, con todo su grupo (cada integrante con su propia evaluación) si pasan juntos.
create or replace function audition_juez_actual(aid uuid, p_ronda int default 1) returns json
language plpgsql stable security definer set search_path = public as $$
declare au auditions; g uuid; base jsonb;
begin
  if not (audition_perm(aid, 'audiciones.evaluar') or audition_perm(aid, 'audiciones.entrevista')
          or audition_perm(aid, 'audiciones.gestionar')) then
    raise exception 'No autorizado';
  end if;
  select * into au from auditions where id = aid;
  if au.en_escena is null then return json_build_object('app', null); end if;
  base := _audition_juez_persona(aid, au.en_escena, p_ronda, au.en_escena_at)::jsonb;
  if base is null then return json_build_object('app', null); end if;
  select grupo_turno into g from audition_applications where id = au.en_escena;
  if g is not null then
    base := base || jsonb_build_object('grupo', (
      select jsonb_agg(_audition_juez_persona(aid, a.id, p_ronda, au.en_escena_at)::jsonb order by a.numero nulls last, a.nombre)
        from audition_applications a
       where a.grupo_turno = g and a.audition_id = aid and a.entered_at is not null and a.finished_at is null));
  end if;
  return base::json;
end $$;
revoke all on function audition_juez_actual(uuid, int) from public, anon;
grant execute on function audition_juez_actual(uuid, int) to authenticated;

commit;
