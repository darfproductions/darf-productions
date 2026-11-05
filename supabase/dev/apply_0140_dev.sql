-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV" (la base de darfproductions.com).
-- 0140: la fila del día clara y práctica. Los turnos se reparten al cerrar la inscripción (o con "Asignar turnos
-- ahora") y se mandan a cada quien; quienes pasan juntos comparten número; la pregunta de Grupo pasa a opción múltiple
-- con las respuestas que ya existen ("Grupo A", "A" y "grupo a" cuentan como lo mismo); se puede mover a mano;
-- horarios con hora de fin. No borra ninguna solicitud ni respuesta: solo reescribe la respuesta de Grupo con su opción.
-- En Teen Beach Movie: "Números del día" pasa a "Turnos antes del día" y se limpian los números provisionales (nunca se
-- mandaron): los turnos se reparten cuando tú des "Asignar turnos ahora" en Día de la audición, por grupo.
-- Se puede correr más de una vez. Si la base no es DEV, aborta.
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'productions' and column_name = 'tipo') then
    raise exception 'ABORTADO: primero corre el script de 0139.';
  end if;
end $$;
-- 0140 (Diego 2026-11-05): la fila del día, clara y práctica.
--   * El número es el turno (lugar en la fila). No se da al inscribirse: se reparte a todos al cerrar la inscripción
--     (o con "Asignar turnos ahora"), por grupo, por horario o por personaje según la convocatoria. Quien se inscribe
--     después pasa al último. Al reordenar entran todos los que esperan (antes, quien no tenía número ni se movía).
--     "Al llegar" sigue dando el número en la entrada, sin turnos previos.
--   * Quienes pasan juntos (grupo_turno) COMPARTEN el número: "Turno 7 · Ana + Caro + Luis". Se quita el índice único.
--   * Al ordenar, cada turno se coloca donde le toca a su integrante mejor ubicado (el grupo más arriba posible) y
--     se numera turno por turno, sin huecos. Al juntar o separar se renumera igual.
--   * La pregunta de Grupo es de opción múltiple: al marcarla (o con este script) las respuestas que ya existen se
--     convierten en opciones. "Grupo A", "A" y "grupo a" son lo mismo; cada respuesta se reescribe con la opción.
--     Ordenar por grupo sigue el orden de las opciones.
--   * Mover a mano: audition_mover (arriba, abajo, al final o al lugar N) mueve el turno completo. Al llegar, quien va
--     en grupo con alguien que ya llegó toma su mismo número.
--   * Horarios con hora de fin (audition_slots.termina, opcional): "de 11:50 a 12:10". El aviso de turno la incluye.
-- Precede: 0139.


-- ──────── 1. Número compartido por turno ────────
alter table audition_applications drop constraint if exists audition_applications_audition_id_numero_key;
drop index if exists audition_applications_audition_id_numero_key;
create index if not exists idx_audition_applications_numero on audition_applications(audition_id, numero);

-- ──────── 2. Clave de grupo: "Grupo A", "A", "grupo a." son lo mismo ────────
create or replace function _grupo_clave(t text) returns text
language sql immutable as $$
  select nullif(btrim(regexp_replace(regexp_replace(regexp_replace(
           translate(lower(btrim(coalesce(t, ''))), 'áéíóúüñ', 'aeiouun'),
           '\s+', ' ', 'g'), '^(grupo|salon|equipo|seccion)\s*[:.\-]?\s*', ''), '[.:\s]+$', '')), '')
$$;

-- Convertir la pregunta de Grupo a opción múltiple con las respuestas que ya existen (las opciones que ya tenga se
-- conservan en su orden; cada respuesta se reescribe con la opción que le corresponde). Devuelve las opciones.
create or replace function audition_grupo_a_opciones(aid uuid) returns text[]
language plpgsql security definer set search_path = public as $$
declare f audition_fields; ops text[] := '{}'; r record;
begin
  if not audition_config_perm(aid) then raise exception 'No autorizado'; end if;
  select * into f from audition_fields where audition_id = aid and sistema = 'grupo';
  if not found then return null; end if;
  ops := coalesce(f.opciones, '{}');
  -- Respuestas nuevas (que no caen en una opción existente): la forma más usada de cada clave, en orden natural.
  for r in
    with resp as (
      select btrim(a.respuestas->>f.id::text) as txt
        from audition_applications a
       where a.audition_id = aid and nullif(btrim(a.respuestas->>f.id::text), '') is not null),
    c as (select _grupo_clave(txt) as clave, txt, count(*) as n from resp where _grupo_clave(txt) is not null group by 1, 2),
    -- La forma más usada; en empate, la que dice "Grupo…", sin punto final y la más completa.
    can as (select distinct on (clave) clave, txt from c order by clave, n desc, (lower(txt) like 'grupo%') desc, (txt ~ '[.:]$'), length(txt) desc, txt)
    select clave, txt from can
     where not exists (select 1 from unnest(ops) o where _grupo_clave(o) = can.clave)
     order by length(clave), clave
  loop
    ops := ops || r.txt;
  end loop;
  -- Cada respuesta toma la opción de su clave.
  update audition_applications a
     set respuestas = a.respuestas || jsonb_build_object(f.id::text, o.op), updated_at = now()
    from (select o as op, _grupo_clave(o) as clave from unnest(ops) o) o
   where a.audition_id = aid and _grupo_clave(a.respuestas->>f.id::text) = o.clave and (a.respuestas->>f.id::text) <> o.op;
  update audition_fields set tipo = 'opcion', opciones = ops where id = f.id;
  return ops;
end $$;
revoke all on function audition_grupo_a_opciones(uuid) from public, anon;
grant execute on function audition_grupo_a_opciones(uuid) to authenticated;

-- Marcar una pregunta del sistema: la de Grupo queda como opción múltiple (con las respuestas que ya existen).
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
          case p_sistema when 'grupo' then 'Grupo' else '¿Pasas con alguien? Escribe con quién (déjalo vacío si pasas solo)' end,
          case p_sistema when 'grupo' then 'opcion' else 'texto' end,
          case p_sistema when 'grupo' then '{Grupo A,Grupo B,Grupo C}'::text[] end,
          p_sistema = 'grupo', n, p_sistema)
  returning id into fid;
  return fid;
end $$;

-- ──────── 3. Numerar: todos los que esperan, turno por turno, sin huecos ────────
-- p_modo: llegada, registro, personaje, horario, grupo; null = conservar el orden actual (quien no tenía número, al final).
create or replace function _audition_renumerar(aid uuid, p_modo text default null) returns int
language plpgsql security definer set search_path = public as $$
declare au auditions; fg audition_fields; base int; n int;
begin
  select * into au from auditions where id = aid for update;
  select * into fg from audition_fields where audition_id = aid and sistema = 'grupo';
  create temp table _pend on commit drop as
    select a.id, coalesce(a.grupo_turno, a.id) as turno, a.numero, a.checked_in_at, a.created_at, s.inicia as slot_inicia,
           (select min(ro.orden) from audition_roles ro where ro.id = any(a.roles)) as rol_orden,
           case when fg.id is not null then array_position(coalesce(fg.opciones, '{}'), btrim(a.respuestas->>fg.id::text)) end as grupo_pos,
           case when fg.id is not null then _grupo_clave(a.respuestas->>fg.id::text) end as grupo_clave
      from audition_applications a left join audition_slots s on s.id = a.slot_id
     where a.audition_id = aid and a.entered_at is null and a.estado not in ('cancelado', 'no_cumple')
       and (au.fase <> 'callback' or a.estado = 'callback');
  -- Los números de quienes ya pasaron no se tocan: la fila sigue después del mayor.
  select coalesce(max(a.numero), 0) into base from audition_applications a
   where a.audition_id = aid and a.id not in (select id from _pend);
  with p as (
    select id, turno, row_number() over (order by
      case p_modo when 'llegada' then extract(epoch from checked_in_at) end nulls last,
      case p_modo when 'grupo' then grupo_pos end nulls last,
      case p_modo when 'grupo' then grupo_clave end nulls last,
      case p_modo when 'personaje' then rol_orden end nulls last,
      case when p_modo in ('horario', 'grupo') then extract(epoch from slot_inicia) end nulls last,
      case when p_modo in ('llegada', 'grupo', 'personaje', 'horario') or p_modo is null then numero end nulls last,
      created_at, id) as rn
      from _pend),
  t as (select turno, min(rn) as mrn from p group by turno),
  d as (select turno, base + dense_rank() over (order by mrn) as num from t)
  update audition_applications x set numero = d.num, updated_at = now()
    from p join d on d.turno = p.turno
   where x.id = p.id and x.numero is distinct from d.num;
  select count(*) into n from _pend;
  drop table _pend;
  return n;
end $$;
revoke all on function _audition_renumerar(uuid, text) from public, anon;

create or replace function audition_reordenar(aid uuid, p_modo text) returns int
language plpgsql security definer set search_path = public as $$
declare n int; au auditions;
begin
  if not audition_puede_fila(aid) then raise exception 'No autorizado'; end if;
  if p_modo not in ('llegada', 'registro', 'personaje', 'horario', 'grupo') then raise exception 'Orden no válido.'; end if;
  select * into au from auditions where id = aid;
  if p_modo = 'grupo' and not exists (select 1 from audition_fields where audition_id = aid and sistema = 'grupo') then
    raise exception 'Esta convocatoria no tiene pregunta de grupo.';
  end if;
  n := _audition_renumerar(aid, p_modo);
  -- Ordenar ya reparte los turnos (en cualquier modo menos "al llegar").
  if au.numeracion <> 'llegada' then update auditions set numeros_asignados_at = coalesce(numeros_asignados_at, now()) where id = aid; end if;
  insert into audit_log (tabla, accion, production_id, antes, despues)
    values ('audition_applications', 'reordenar', au.production_id, null, jsonb_build_object('audicion', aid, 'orden', p_modo, 'personas', n));
  return n;
end $$;

-- Mover un turno a mano: p_dir = 'arriba' | 'abajo' | 'final', o p_lugar = N (lugar entre los que esperan).
create or replace function audition_mover(aid uuid, app uuid, p_dir text default null, p_lugar int default null) returns int
language plpgsql security definer set search_path = public as $$
declare v audition_applications; au auditions; turnos uuid[]; tt uuid; i int; destino int; base int; total int;
begin
  if not audition_puede_fila(aid) then raise exception 'No autorizado'; end if;
  select * into au from auditions where id = aid for update;
  select * into v from audition_applications where id = app and audition_id = aid for update;
  if not found then raise exception 'Esa persona no es de esta audición.'; end if;
  if v.entered_at is not null then raise exception 'Ya pasó (o está en escena): no se puede mover.'; end if;
  perform _audition_renumerar(aid, null);   -- todos con número y sin huecos antes de mover
  if au.numeracion <> 'llegada' then update auditions set numeros_asignados_at = coalesce(numeros_asignados_at, now()) where id = aid; end if;
  select array_agg(turno order by mn, mc) into turnos from (
    select coalesce(a.grupo_turno, a.id) as turno, min(a.numero) as mn, min(a.created_at) as mc
      from audition_applications a
     where a.audition_id = aid and a.entered_at is null and a.estado not in ('cancelado', 'no_cumple')
       and (au.fase <> 'callback' or a.estado = 'callback')
     group by 1) t;
  tt := coalesce(v.grupo_turno, v.id);
  total := cardinality(turnos);
  i := array_position(turnos, tt);
  if i is null then raise exception 'Esa persona no está en la fila.'; end if;
  destino := case p_dir when 'arriba' then i - 1 when 'abajo' then i + 1 when 'final' then total else coalesce(p_lugar, i) end;
  destino := greatest(1, least(total, destino));
  if destino = i then return v.numero; end if;
  turnos := array_remove(turnos, tt);
  turnos := turnos[1:destino - 1] || tt || turnos[destino:total - 1];
  select coalesce(max(a.numero), 0) into base from audition_applications a
   where a.audition_id = aid and not (a.entered_at is null and a.estado not in ('cancelado', 'no_cumple') and (au.fase <> 'callback' or a.estado = 'callback'));
  for i in 1..total loop
    update audition_applications a set numero = base + i, updated_at = now()
     where a.audition_id = aid and coalesce(a.grupo_turno, a.id) = turnos[i] and a.entered_at is null
       and a.estado not in ('cancelado', 'no_cumple') and a.numero is distinct from base + i;
  end loop;
  return base + destino;
end $$;
revoke all on function audition_mover(uuid, uuid, text, int) from public, anon;
grant execute on function audition_mover(uuid, uuid, text, int) to authenticated;

create or replace function audition_al_final(aid uuid, app uuid) returns int
language plpgsql security definer set search_path = public as $$
begin
  return audition_mover(aid, app, 'final');
end $$;

-- Juntar / separar: se renumera para que el turno comparta número y no queden huecos.
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
  update audition_applications x set grupo_turno = null
   where x.audition_id = aid and x.grupo_turno is not null and x.grupo_turno <> g
     and (select count(*) from audition_applications y where y.grupo_turno = x.grupo_turno) < 2;
  perform _audition_renumerar(aid, null);
  return g;
end $$;

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
  perform _audition_renumerar(aid, null);
end $$;

-- ──────── 4. Turnos: se reparten al cerrar la inscripción (o antes, a mano); quien llega después, al último ────────
-- Antes de repartir turnos nadie tiene número (ni en "asignación previa"); "al llegar" nunca tiene turno previo.
create or replace function audition_applications_numero_inicial() returns trigger
language plpgsql security definer set search_path = public as $$
declare au auditions;
begin
  select * into au from auditions where id = new.audition_id;
  if au.numeracion = 'llegada' or au.numeros_asignados_at is null then
    new.numero := null;
  elsif new.numero is null then
    perform 1 from auditions where id = new.audition_id for update;
    select coalesce(max(numero), 0) + 1 into new.numero from audition_applications where audition_id = new.audition_id;
  end if;
  return new;
end $$;
drop trigger if exists audition_applications_numero_inicial on audition_applications;
create trigger audition_applications_numero_inicial before insert on audition_applications
  for each row execute function audition_applications_numero_inicial();

-- Repartir los turnos: por personaje si la convocatoria numera así; si no, por grupo (si hay pregunta de Grupo),
-- por horario (si hay horarios) o por orden de inscripción. Marca numeros_asignados_at.
create or replace function _audition_asignar_turnos(aid uuid) returns int
language plpgsql security definer set search_path = public as $$
declare au auditions; modo text; n int;
begin
  select * into au from auditions where id = aid for update;
  if not found or au.numeracion = 'llegada' then return 0; end if;
  modo := case
    when au.numeracion = 'personaje' then 'personaje'
    when exists (select 1 from audition_fields where audition_id = aid and sistema = 'grupo') then 'grupo'
    when exists (select 1 from audition_slots where audition_id = aid) then 'horario'
    else 'registro' end;
  n := _audition_renumerar(aid, modo);
  update auditions set numeros_asignados_at = coalesce(numeros_asignados_at, now()) where id = aid;
  insert into audit_log (tabla, accion, production_id, antes, despues)
    values ('audition_applications', 'asignar_turnos', au.production_id, null, jsonb_build_object('audicion', aid, 'orden', modo, 'personas', n));
  return n;
end $$;
revoke all on function _audition_asignar_turnos(uuid) from public, anon, authenticated;

-- Desde el panel: "Asignar turnos ahora" (quien gestiona). Sustituye a audition_numerar_ahora (0116), que solo servía por personaje.
create or replace function audition_numerar_ahora(aid uuid) returns int
language plpgsql security definer set search_path = public as $$
begin
  if not audition_perm(aid, 'audiciones.gestionar') then raise exception 'No autorizado'; end if;
  if (select numeracion from auditions where id = aid) = 'llegada' then raise exception 'Esta convocatoria da los números al llegar. Para repartir turnos antes, cambia "Números del día" en Configuración.'; end if;
  if (select numeros_asignados_at from auditions where id = aid) is not null then raise exception 'Los turnos ya se asignaron. Para cambiar el orden usa "Cambiar el orden" o mueve a mano.'; end if;
  return _audition_asignar_turnos(aid);
end $$;

-- Al cerrar la inscripción (o al llegar su fecha de cierre) se reparten solos, en cualquier modo menos "al llegar".
create or replace function auditions_numerar_al_cerrar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.numeracion <> 'llegada' and new.numeros_asignados_at is null
     and new.estado = 'cerrada' and old.estado is distinct from 'cerrada' then
    perform _audition_asignar_turnos(new.id);
  end if;
  return new;
end $$;
create or replace function auditions_numerar_vencidas() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select id from auditions
            where numeracion <> 'llegada' and numeros_asignados_at is null
              and estado in ('abierta', 'cerrada') and inscripcion_cierra is not null and inscripcion_cierra <= now()
  loop
    perform _audition_asignar_turnos(r.id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Horarios con hora de fin (opcional): "de 11:50 a 12:10".
alter table audition_slots add column if not exists termina timestamptz;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'audition_slots_termina_despues') then
    alter table audition_slots add constraint audition_slots_termina_despues check (termina is null or termina > inicia);
  end if;
end $$;
drop function if exists audition_slot_availability(uuid);
create or replace function audition_slot_availability(aid uuid)
returns table (id uuid, inicia timestamptz, termina timestamptz, sala text, cupo int, ocupados int)
language sql stable security definer set search_path = public as $$
  select s.id, s.inicia, s.termina, s.sala, s.cupo,
         (select count(*)::int from audition_applications a where a.slot_id = s.id and a.estado <> 'cancelado')
    from audition_slots s
   where s.audition_id = aid and (audition_is_public(aid) or audition_team(aid))
   order by s.inicia
$$;
revoke all on function audition_slot_availability(uuid) from public;
grant execute on function audition_slot_availability(uuid) to anon, authenticated;
create or replace function _solo_hora_mx(t timestamptz) returns text
language sql immutable as $$
  select ltrim(to_char(t at time zone 'America/Mexico_City', 'HH12:MI'), '0')
         || case when extract(hour from t at time zone 'America/Mexico_City') < 12 then ' a.m.' else ' p.m.' end
$$;
create or replace function audition_avisar_turnos(aid uuid) returns int
language plpgsql security definer set search_path = public as $$
declare au auditions; r record; n int := 0; tit text; horario text;
begin
  if not audition_perm(aid, 'audiciones.gestionar') then raise exception 'No autorizado'; end if;
  select * into au from auditions where id = aid;
  tit := coalesce(nullif(btrim(au.titulo), ''), 'tu audición');
  for r in
    select a.id, a.user_id, a.numero, s.inicia, s.termina, s.sala
      from audition_applications a left join audition_slots s on s.id = a.slot_id
     where a.audition_id = aid and a.numero is not null and a.user_id is not null and a.checked_in_at is null
       and a.estado not in ('cancelado', 'no_cumple')
  loop
    horario := case when r.inicia is not null then _hora_mx(r.inicia) || case when r.termina is not null then ' a ' || _solo_hora_mx(r.termina) else '' end end;
    begin
      perform notify(array[r.user_id], 'audicion',
        'Tu turno: Nº ' || r.numero || case when horario is not null then ' · ' || horario else '' end,
        'En ' || tit || ' pasas en el turno ' || r.numero
          || case when horario is not null then '. Tu horario: ' || horario || case when r.sala is not null then ' (' || r.sala || ')' else '' end else '' end
          || case when au.sede is not null then '. Lugar: ' || au.sede else '' end
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

-- ──────── 5. Llegada: quien va en grupo con alguien que ya llegó toma su número ────────
create or replace function audition_checkin(aid uuid, ref text) returns json
language plpgsql security definer set search_path = public as $$
declare v audition_applications%rowtype; n int; r text := lower(btrim(coalesce(ref, ''))); au auditions;
begin
  if not (audition_perm(aid, 'audiciones.registro') or audition_perm(aid, 'audiciones.gestionar')) then
    raise exception 'No autorizado';
  end if;
  select * into au from auditions where id = aid;
  select * into v from audition_applications
   where audition_id = aid and (qr_token::text = r or id::text = r) for update;
  if not found then return json_build_object('result', 'no_encontrado'); end if;
  if v.estado in ('cancelado', 'no_cumple') then
    return json_build_object('result', 'no_admitido', 'nombre', v.nombre, 'estado', v.estado);
  end if;
  if au.fase = 'callback' and v.estado <> 'callback' then
    return json_build_object('result', 'no_callback', 'nombre', v.nombre, 'numero', v.numero);
  end if;
  if v.checked_in_at is not null then
    return json_build_object('result', 'ya_registrado', 'nombre', v.nombre, 'numero', v.numero);
  end if;
  n := v.numero;
  if n is null or (au.numeracion = 'llegada' and au.fase <> 'callback') then
    perform 1 from auditions where id = aid for update;   -- numeración sin repetidos
    -- En grupo: el mismo número que su compañero que ya llegó; si no, el siguiente.
    select a.numero into n from audition_applications a
     where v.grupo_turno is not null and a.grupo_turno = v.grupo_turno and a.checked_in_at is not null and a.numero is not null
     order by a.checked_in_at limit 1;
    if n is null then
      select coalesce(max(numero), 0) + 1 into n from audition_applications where audition_id = aid and id <> v.id;
    end if;
  end if;
  update audition_applications set checked_in_at = now(), checked_in_by = auth.uid(), numero = n, updated_at = now() where id = v.id;
  return json_build_object('result', 'ok', 'nombre', v.nombre, 'numero', n, 'es_menor', v.es_menor,
    'personajes', (select array_agg(ro.nombre order by ro.orden) from audition_roles ro where ro.id = any(v.roles)),
    'callback', au.fase = 'callback', 'sin_aprobar', v.estado = 'inscrito' and not v.walk_in);
end $$;

-- Convocatorias abiertas o cerradas: la pregunta de Grupo a opciones; sin turnos repartidos todavía, los números
-- provisionales se limpian y "al llegar" pasa a "turnos antes del día" (así Diego reparte y manda los turnos).
do $$
declare r record; ops text[]; n int;
begin
  for r in select a.id, a.titulo, a.numeracion, a.numeros_asignados_at from auditions a where a.estado in ('abierta', 'cerrada') loop
    if exists (select 1 from audition_fields f where f.audition_id = r.id and f.sistema = 'grupo') then
      -- Como el Director (la función exige permiso de configuración).
      perform set_config('request.jwt.claims', json_build_object('sub', (select id::text from profiles where rol = 'admin' order by created_at limit 1), 'role', 'authenticated')::text, true);
      ops := audition_grupo_a_opciones(r.id);
      perform set_config('request.jwt.claims', '', true);
      raise notice 'Convocatoria "%": pregunta de Grupo con opciones %.', r.titulo, ops;
    end if;
    if r.numeros_asignados_at is null then
      if r.numeracion = 'llegada' then
        update auditions set numeracion = 'previa' where id = r.id;
        raise notice 'Convocatoria "%": "Números del día" pasa a "Turnos antes del día".', r.titulo;
      end if;
      update audition_applications set numero = null where audition_id = r.id and checked_in_at is null and numero is not null;
      get diagnostics n = row_count;
      raise notice 'Convocatoria "%": % números provisionales limpiados; reparte los turnos con "Asignar turnos ahora".', r.titulo, n;
    end if;
  end loop;
end $$;

select 'Listo 0140: turnos al cerrar, Grupo como opción múltiple, horarios con fin' as resultado;
