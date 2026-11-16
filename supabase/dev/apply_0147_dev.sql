-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV" (la base de darfproductions.com).
-- 0147: (1) invitación directa = pase especial: quien invites desde el panel puede inscribirse aunque no cumpla la edad
-- de la convocatoria; si es menor, siempre da los datos y la autorización de su tutor. (2) Vuelves a decidir qué
-- preguntas son obligatorias: las nuevas nacen opcionales. No cambia datos: las preguntas que 0146 volvió obligatorias
-- se quedan así hasta que las cambies en el panel («Hacer opcional»).
-- Se puede correr más de una vez. Si la base no es DEV, aborta.
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
  if not exists (select 1 from pg_proc where proname = 'audition_fields_obligatoria')
     and not exists (select 1 from information_schema.columns where table_name = 'audition_applications' and column_name = 'perfil_habilidades') then
    raise exception 'ABORTADO: primero corre el script de 0146.';
  end if;
end $$;
-- 0147 (Diego 2026-11-15):
--   * Invitación directa = pase especial: quien fue invitado desde el panel (audition_invites, con el correo de su cuenta)
--     puede inscribirse aunque no cumpla la edad mínima o máxima de la convocatoria. Si es menor de edad, siempre tiene
--     que dar nombre, teléfono y correo de su madre, padre o tutor, y su autorización (aunque la convocatoria no los pida).
--   * Preguntas obligatorias a elección: se quita lo de 0146 que forzaba todas. Cada pregunta se marca obligatoria u
--     opcional en el panel (las nuevas nacen opcionales). Las que 0146 volvió obligatorias se quedan así hasta que
--     alguien las cambie. Lo demás de 0146 sigue: foto (si se pide), personaje, perfil artístico y correo del tutor.
-- Precede: 0146.

drop trigger if exists audition_fields_obligatoria on audition_fields;
drop function if exists audition_fields_obligatoria();
alter table audition_fields alter column obligatorio set default false;

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
  v_perfil jsonb := coalesce(p->'perfil', '{}');
  q text;
  v_invitado boolean := audition_am_invited(aid);
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
  -- 0147: quien fue invitado directamente desde el panel se salta la edad mínima y máxima.
  if not v_invitado then
    if a.edad_min is not null and v_edad < a.edad_min then raise exception 'Esta convocatoria es para mayores de % años.', a.edad_min; end if;
    if a.edad_max is not null and v_edad > a.edad_max then raise exception 'Esta convocatoria es hasta % años.', a.edad_max; end if;
  end if;
  v_menor := v_edad < 18;
  -- Un menor invitado siempre da los datos y la autorización de su madre, padre o tutor (aunque la convocatoria no los pida).
  v_tutor := v_menor and (a.pedir_tutor or v_invitado);
  if v_tutor and (coalesce(btrim(p->>'tutor_nombre'), '') = '' or coalesce(btrim(p->>'tutor_telefono'), '') = '' or coalesce(btrim(p->>'tutor_email'), '') = '') then
    raise exception 'Como eres menor de edad, necesitamos el nombre, teléfono y correo de tu madre, padre o tutor.';
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
  -- 0146: si la convocatoria tiene personajes, hay que elegir al menos uno.
  if cardinality(v_roles) = 0 and exists (select 1 from audition_roles where audition_id = aid) then
    raise exception 'Elige al menos un personaje para el que audicionas.';
  end if;
  -- 0146: el perfil artístico que pide la convocatoria (tesitura, género, canto, baile) también es obligatorio.
  foreach q in array coalesce(a.perfil_preguntas, '{}') loop
    if q in ('tesitura', 'genero', 'canto', 'baile') and coalesce(btrim(v_perfil->>q), '') = '' then
      raise exception 'Falta responder en tu perfil artístico: %.', case q when 'tesitura' then 'tesitura' when 'genero' then 'qué personajes interpretas' when 'canto' then 'canto' else 'baile' end;
    end if;
    if q = 'habilidades' and coalesce(jsonb_array_length(case when jsonb_typeof(v_perfil->'habilidades') = 'array' then v_perfil->'habilidades' end), 0) = 0 then
      raise exception 'Falta responder en tu perfil artístico: habilidades especiales (si no tienes, marca «Ninguna»).';
    end if;
  end loop;
  for f in select * from audition_fields where audition_id = aid and obligatorio loop
    if coalesce(btrim(v_resp->>f.id::text), '') = '' then raise exception 'Falta responder: %', f.etiqueta; end if;
  end loop;
  if not a.pedir_foto then v_foto := null; end if;
  if v_foto is not null and v_foto not like aid::text || '/' || auth.uid()::text || '/%' then
    raise exception 'Foto no válida.';
  end if;

  select * into v_prev from audition_applications where audition_id = aid and user_id = auth.uid() for update;
  if found and v_prev.checked_in_at is not null then raise exception 'Ya te registraste en la audición; tu inscripción no se puede cambiar.'; end if;
  -- 0146: si la convocatoria pide foto, no se guarda sin foto (o la que ya había subido).
  if a.pedir_foto and v_foto is null and v_prev.foto_path is null then
    raise exception 'Sube tu foto: esta convocatoria la pide.';
  end if;
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
  -- 0146: el perfil se guarda junto con la inscripción (antes iba aparte y podía quedar vacío).
  if v_perfil <> '{}'::jsonb then
    update audition_applications set
      perfil_tesitura = case when 'tesitura' = any (a.perfil_preguntas) then nullif(btrim(v_perfil->>'tesitura'), '') else perfil_tesitura end,
      perfil_genero = case when 'genero' = any (a.perfil_preguntas) then nullif(btrim(v_perfil->>'genero'), '') else perfil_genero end,
      perfil_canto = case when 'canto' = any (a.perfil_preguntas) then nullif(btrim(v_perfil->>'canto'), '') else perfil_canto end,
      perfil_baile = case when 'baile' = any (a.perfil_preguntas) then nullif(btrim(v_perfil->>'baile'), '') else perfil_baile end,
      perfil_habilidades = case when 'habilidades' = any (a.perfil_preguntas) and jsonb_typeof(v_perfil->'habilidades') = 'array'
                                then coalesce((select array_agg(distinct btrim(x)) from jsonb_array_elements_text(v_perfil->'habilidades') x where btrim(x) <> ''), '{}')
                                else perfil_habilidades end
     where id = v_id;
  end if;
  return json_build_object('application_id', v_id, 'es_menor', v_menor);
end $$;

create or replace function _audition_faltantes(x audition_applications) returns text[]
language sql stable security definer set search_path = public as $$
  select array_remove(array[
           case when au.pedir_foto and x.foto_path is null then 'Foto' end,
           case when coalesce(cardinality(x.roles), 0) = 0 and exists (select 1 from audition_roles r where r.audition_id = au.id) then 'Personaje' end,
           case when 'tesitura' = any (au.perfil_preguntas) and x.perfil_tesitura is null then 'Tesitura' end,
           case when 'genero' = any (au.perfil_preguntas) and x.perfil_genero is null then 'Personajes que interpreta' end,
           case when 'canto' = any (au.perfil_preguntas) and x.perfil_canto is null then 'Canto' end,
           case when 'baile' = any (au.perfil_preguntas) and x.perfil_baile is null then 'Baile' end,
           case when 'habilidades' = any (au.perfil_preguntas) and coalesce(cardinality(x.perfil_habilidades), 0) = 0 then 'Habilidades especiales' end,
           case when x.es_menor and x.tutor_nombre is not null and x.tutor_email is null then 'Correo del tutor' end], null)
      || coalesce((select array_agg(f.etiqueta order by f.orden) from audition_fields f
                    where f.audition_id = x.audition_id and f.obligatorio
                      and coalesce(btrim(x.respuestas->>f.id::text), '') = ''), '{}')
    from auditions au where au.id = x.audition_id
$$;

-- «¿Con quién pasas?» nace opcional (quien pasa solo la puede dejar vacía); Grupo nace obligatoria.
create or replace function audition_pregunta_sistema(aid uuid, p_sistema text, p_field uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare fid uuid; n int;
begin
  if not audition_config_perm(aid) then raise exception 'No autorizado'; end if;
  if p_sistema not in ('grupo', 'companeros') then raise exception 'Pregunta del sistema no válida.'; end if;
  update audition_fields set sistema = null where audition_id = aid and sistema = p_sistema;
  if p_field is not null then
    update audition_fields set sistema = p_sistema where id = p_field and audition_id = aid returning id into fid;
    if fid is null then raise exception 'Esa pregunta no es de esta convocatoria.'; end if;
    if p_sistema = 'grupo' then perform audition_grupo_a_opciones(aid); end if;
    return fid;
  end if;
  select coalesce(max(orden), 0) + 1 into n from audition_fields where audition_id = aid;
  insert into audition_fields (audition_id, etiqueta, tipo, opciones, obligatorio, orden, sistema)
  values (aid,
          case p_sistema when 'grupo' then 'Grupo' else '¿Pasas con alguien? Escribe con quién, o «Solo» si pasas solo' end,
          case p_sistema when 'grupo' then 'opcion' else 'texto' end,
          case p_sistema when 'grupo' then '{Grupo A,Grupo B,Grupo C}'::text[] end,
          p_sistema = 'grupo', n, p_sistema)
  returning id into fid;
  return fid;
end $$;


select 'Listo 0147: invitación directa salta la edad; preguntas obligatorias a elección' as resultado;
