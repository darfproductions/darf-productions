-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV" (la base de darfproductions.com).
-- 0136: audiciones con preguntas del sistema ("Grupo" y "¿con quién pasas?"), orden de la fila por horario y por
-- grupo, horario para todo un grupo y aviso de turnos. No cambia ni borra ninguna solicitud ni respuesta.
-- Al final intenta reconocer solas las preguntas de Teen Beach Movie (si una se llama "Grupo" o parecido, y si otra
-- habla de pasar juntos). Si no las reconoce, en Configuración → Preguntas del formulario cada pregunta tiene el
-- botón "Usar como Grupo" / "Usar como «¿con quién pasas?»". Se puede correr más de una vez. Si la base no es DEV, aborta.
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
  if to_regprocedure('public.audition_fichas(uuid)') is null then
    raise exception 'ABORTADO: primero corre el script de 0135.';
  end if;
end $$;
-- 0136 (Diego 2026-11-05, fase 1 del panel): audiciones con preguntas del sistema, orden por grupo y horario por grupo.
--   * Dos preguntas del sistema (audition_fields.sistema):
--       - 'grupo': el salón o el grupo que asigna DARF (Grupo A, B, C…). Sirve para ordenar la fila por grupo y dar
--         horario a todo un grupo de un jalón.
--       - 'companeros': "¿Pasas con alguien? Escribe con quién". Sirve para armar quiénes pasan juntos en un turno.
--     Una pregunta que ya existe se puede marcar como del sistema (sus respuestas se usan tal cual: Teen Beach Movie
--     no vuelve a pedir nada); si no existe, el sistema la crea.
--   * audition_reordenar: también 'horario' y 'grupo'.
--   * audition_horario_grupo: horario para todos los de un grupo.
--   * audition_avisar_turnos: "Tu turno: Nº 3 · 11:50 a.m." a cada quien con número.
-- Precede: 0135.

begin;

-- ════════ 1. Preguntas del sistema ════════
alter table audition_fields add column if not exists sistema text;
do $$ begin
  alter table audition_fields add constraint audition_fields_sistema check (sistema in ('grupo', 'companeros'));
exception when duplicate_object then null; end $$;
create unique index if not exists uq_audition_fields_sistema on audition_fields(audition_id, sistema) where sistema is not null;

-- Marcar una pregunta existente como del sistema (p_field) o crear la pregunta estándar (p_field null).
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
    return fid;
  end if;
  select coalesce(max(orden), 0) + 1 into n from audition_fields where audition_id = aid;
  insert into audition_fields (audition_id, etiqueta, tipo, obligatorio, orden, sistema)
  values (aid,
          case p_sistema when 'grupo' then 'Grupo' else '¿Pasas con alguien? Escribe con quién (déjalo vacío si pasas solo)' end,
          'texto', p_sistema = 'grupo', n, p_sistema)
  returning id into fid;
  return fid;
end $$;
revoke all on function audition_pregunta_sistema(uuid, text, uuid) from public, anon;
grant execute on function audition_pregunta_sistema(uuid, text, uuid) to authenticated;

-- Dejar de usarla como del sistema. La pregunta y sus respuestas se conservan; si nadie la ha contestado, se quita.
create or replace function audition_pregunta_sistema_quitar(aid uuid, p_sistema text) returns void
language plpgsql security definer set search_path = public as $$
declare f audition_fields;
begin
  if not audition_config_perm(aid) then raise exception 'No autorizado'; end if;
  select * into f from audition_fields where audition_id = aid and sistema = p_sistema;
  if not found then return; end if;
  if not exists (select 1 from audition_applications a where a.audition_id = aid and btrim(coalesce(a.respuestas->>f.id::text, '')) <> '') then
    delete from audition_fields where id = f.id;
  else
    update audition_fields set sistema = null where id = f.id;
  end if;
end $$;
revoke all on function audition_pregunta_sistema_quitar(uuid, text) from public, anon;
grant execute on function audition_pregunta_sistema_quitar(uuid, text) to authenticated;

-- Lo que respondió cada quien a las preguntas del sistema (para Solicitudes, los grupos y el día).
create or replace function audition_respuestas_sistema(aid uuid)
returns table (id uuid, grupo text, companeros text)
language plpgsql stable security definer set search_path = public as $$
declare fg uuid; fc uuid;
begin
  if not (audition_puede_fila(aid) or audition_perm(aid, 'audiciones.gestionar') or audition_perm(aid, 'audiciones.evaluar')
          or audition_perm(aid, 'audiciones.entrevista')) then
    raise exception 'No autorizado';
  end if;
  select f.id into fg from audition_fields f where f.audition_id = aid and f.sistema = 'grupo';
  select f.id into fc from audition_fields f where f.audition_id = aid and f.sistema = 'companeros';
  return query
    select a.id, nullif(btrim(a.respuestas->>fg::text), ''), nullif(btrim(a.respuestas->>fc::text), '')
      from audition_applications a where a.audition_id = aid;
end $$;
revoke all on function audition_respuestas_sistema(uuid) from public, anon;
grant execute on function audition_respuestas_sistema(uuid) to authenticated;

-- ════════ 2. Orden de la fila: también por horario y por grupo ════════
create or replace function audition_reordenar(aid uuid, p_modo text) returns int
language plpgsql security definer set search_path = public as $$
declare base int; n int; au auditions; fg uuid;
begin
  if not audition_puede_fila(aid) then raise exception 'No autorizado'; end if;
  if p_modo not in ('llegada', 'registro', 'personaje', 'horario', 'grupo') then raise exception 'Orden no válido.'; end if;
  select * into au from auditions where id = aid for update;
  select f.id into fg from audition_fields f where f.audition_id = aid and f.sistema = 'grupo';
  if p_modo = 'grupo' and fg is null then raise exception 'Esta convocatoria no tiene pregunta de grupo.'; end if;
  create temp table _pend on commit drop as
    select a.id, a.numero, a.checked_in_at, a.created_at, s.inicia as slot_inicia,
           (select min(ro.orden) from audition_roles ro where ro.id = any(a.roles)) as rol_orden,
           lower(nullif(btrim(a.respuestas->>fg::text), '')) as grupo
      from audition_applications a left join audition_slots s on s.id = a.slot_id
     where a.audition_id = aid and a.entered_at is null and a.estado not in ('cancelado', 'no_cumple')
       and (a.numero is not null or a.checked_in_at is not null)
       and (au.fase <> 'callback' or a.estado = 'callback');
  update audition_applications set numero = null where id in (select id from _pend);
  select coalesce(max(numero), 0) into base from audition_applications where audition_id = aid;
  update audition_applications x set numero = base + o.rn, updated_at = now()
    from (select id, row_number() over (order by
            case p_modo when 'llegada' then extract(epoch from checked_in_at) end nulls last,
            case p_modo when 'grupo' then grupo end nulls last,
            case p_modo when 'personaje' then rol_orden end nulls last,
            case when p_modo in ('horario', 'grupo') then slot_inicia end nulls last,
            case p_modo when 'llegada' then numero end,
            created_at, id) as rn
            from _pend) o
   where x.id = o.id;
  get diagnostics n = row_count;
  drop table _pend;
  insert into audit_log (tabla, accion, production_id, antes, despues)
    values ('audition_applications', 'reordenar', au.production_id, null, jsonb_build_object('audicion', aid, 'orden', p_modo, 'personas', n));
  return n;
end $$;

-- ════════ 3. Horario para todo un grupo ════════
create or replace function audition_horario_grupo(aid uuid, p_grupo text, p_slot uuid) returns int
language plpgsql security definer set search_path = public as $$
declare fg uuid; n int; au auditions;
begin
  if not audition_perm(aid, 'audiciones.gestionar') then raise exception 'No autorizado'; end if;
  select * into au from auditions where id = aid;
  select f.id into fg from audition_fields f where f.audition_id = aid and f.sistema = 'grupo';
  if fg is null then raise exception 'Esta convocatoria no tiene pregunta de grupo.'; end if;
  if p_slot is not null and not exists (select 1 from audition_slots where id = p_slot and audition_id = aid) then
    raise exception 'Ese horario no es de esta convocatoria.';
  end if;
  update audition_applications a set slot_id = p_slot, updated_at = now()
   where a.audition_id = aid and a.checked_in_at is null and a.estado not in ('cancelado', 'no_cumple')
     and lower(btrim(coalesce(a.respuestas->>fg::text, ''))) = lower(btrim(p_grupo));
  get diagnostics n = row_count;
  insert into audit_log (tabla, accion, production_id, antes, despues)
    values ('audition_applications', 'horario_grupo', au.production_id, null, jsonb_build_object('audicion', aid, 'grupo', p_grupo, 'slot', p_slot, 'personas', n));
  return n;
end $$;
revoke all on function audition_horario_grupo(uuid, text, uuid) from public, anon;
grant execute on function audition_horario_grupo(uuid, text, uuid) to authenticated;

-- ════════ 4. Avisar turnos: "Tu turno: Nº 3 · sábado 8 de noviembre, 11:50 a.m." ════════
create or replace function _hora_mx(t timestamptz) returns text
language sql immutable as $$
  select (array['domingo','lunes','martes','miércoles','jueves','viernes','sábado'])[extract(dow from t at time zone 'America/Mexico_City')::int + 1]
         || ' ' || extract(day from t at time zone 'America/Mexico_City')::int || ' de '
         || (array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'])[extract(month from t at time zone 'America/Mexico_City')::int]
         || ', ' || ltrim(to_char(t at time zone 'America/Mexico_City', 'HH12:MI'), '0')
         || case when extract(hour from t at time zone 'America/Mexico_City') < 12 then ' a.m.' else ' p.m.' end
$$;

create or replace function audition_avisar_turnos(aid uuid) returns int
language plpgsql security definer set search_path = public as $$
declare au auditions; r record; n int := 0; tit text;
begin
  if not audition_perm(aid, 'audiciones.gestionar') then raise exception 'No autorizado'; end if;
  select * into au from auditions where id = aid;
  tit := coalesce(nullif(btrim(au.titulo), ''), 'tu audición');
  for r in
    select a.id, a.user_id, a.numero, s.inicia, s.sala
      from audition_applications a left join audition_slots s on s.id = a.slot_id
     where a.audition_id = aid and a.numero is not null and a.user_id is not null and a.checked_in_at is null
       and a.estado not in ('cancelado', 'no_cumple')
  loop
    begin
      perform notify(array[r.user_id], 'audicion',
        'Tu turno: Nº ' || r.numero || case when r.inicia is not null then ' · ' || _hora_mx(r.inicia) else '' end,
        'En ' || tit || ' pasas en el lugar ' || r.numero
          || case when r.inicia is not null then '. Tu horario: ' || _hora_mx(r.inicia) || case when r.sala is not null then ' (' || r.sala || ')' else '' end else '' end
          || '. Llega 15 minutos antes con tu QR.',
        '/audiciones/' || aid, au.production_id);
      n := n + 1;
    exception when others then null;
    end;
  end loop;
  insert into audit_log (tabla, accion, production_id, antes, despues)
    values ('audition_applications', 'avisar_turnos', au.production_id, null, jsonb_build_object('audicion', aid, 'avisos', n));
  return n;
end $$;
revoke all on function audition_avisar_turnos(uuid) from public, anon;
grant execute on function audition_avisar_turnos(uuid) to authenticated;

commit;

-- Reconocer las preguntas que ya existen (solo donde hay exactamente una candidata por convocatoria).
do $$
declare r record; n int := 0;
begin
  for r in select a.id, a.titulo from auditions a where a.estado in ('borrador', 'abierta', 'cerrada') loop
    if not exists (select 1 from audition_fields f where f.audition_id = r.id and f.sistema = 'grupo')
       and (select count(*) from audition_fields f where f.audition_id = r.id and f.sistema is null and f.tipo in ('texto', 'opcion', 'parrafo')
              and (lower(f.etiqueta) ~ '^\s*grupo' or lower(f.etiqueta) ~ 'sal[oó]n')) = 1 then
      update audition_fields f set sistema = 'grupo'
       where f.audition_id = r.id and f.sistema is null and f.tipo in ('texto', 'opcion', 'parrafo')
         and (lower(f.etiqueta) ~ '^\s*grupo' or lower(f.etiqueta) ~ 'sal[oó]n');
      n := n + 1;
      raise notice 'Convocatoria "%": pregunta de Grupo reconocida.', r.titulo;
    end if;
    if not exists (select 1 from audition_fields f where f.audition_id = r.id and f.sistema = 'companeros')
       and (select count(*) from audition_fields f where f.audition_id = r.id and f.sistema is null and f.tipo in ('texto', 'parrafo')
              and (lower(f.etiqueta) ~ 'junt' or lower(f.etiqueta) ~ 'con qui[eé]n' or lower(f.etiqueta) ~ 'en grupo')) = 1 then
      update audition_fields f set sistema = 'companeros'
       where f.audition_id = r.id and f.sistema is null and f.tipo in ('texto', 'parrafo')
         and (lower(f.etiqueta) ~ 'junt' or lower(f.etiqueta) ~ 'con qui[eé]n' or lower(f.etiqueta) ~ 'en grupo');
      n := n + 1;
      raise notice 'Convocatoria "%": pregunta «¿con quién pasas?» reconocida.', r.titulo;
    end if;
  end loop;
  raise notice 'Preguntas reconocidas: %. Las demás se marcan desde Configuración.', n;
end $$;

select 'Listo 0136: grupos, horario por grupo y aviso de turnos' as resultado;
