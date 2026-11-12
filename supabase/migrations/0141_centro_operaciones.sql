-- 0141 · Fase 5 (bloque C, centro de operaciones): el portal del integrante en 6 bloques y la ficha completa de cada
-- persona (Diego 2026-11-05).
--   * production_faq: preguntas frecuentes por obra. Las ve el elenco en su portal y DARFY cuando la persona ya entró.
--   * rehearsal_confirmations: "Voy" a un ensayo o llamado (queda quién confirmó; la producción lo ve).
--   * member_requests.para: un mensaje por el portal a alguien del equipo (request_mensaje). El aviso le llega solo a
--     esa persona; quien gestiona la obra lo ve también en Solicitudes y puede responderlo.
--   * notify_request: una falta o llegada tarde avisa a los encargados del ensayo (si los hay); "otra solicitud" avisa a
--     Producción (dirección de la obra y productor). Pasa a ser diferido para ver los ensayos de la solicitud.
--   * persona_ficha(uid): documentos, pagos, asistencia e incidencias de una persona en todas sus obras; cada parte sale
--     solo si quien pregunta tiene el permiso en esa obra (o Casa DARF · Personas).
--   * obra_portal(pid): lo que el integrante ve de su obra: reparto, equipo (nombre y puesto, sin teléfonos),
--     calendario, lugares, funciones y preguntas frecuentes.
begin;

-- ──────── Preguntas frecuentes por obra ────────
create table if not exists production_faq (
  id uuid primary key default gen_random_uuid(),
  production_id text not null references productions(id) on delete cascade,
  -- Pregunta sugerida por el sistema (ensayos, llevar, faltas…) o null si la escribió la producción.
  clave text,
  pregunta text not null check (length(btrim(pregunta)) between 1 and 200),
  respuesta text not null default '' check (length(respuesta) <= 1500),
  orden int not null default 100,
  activa boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
-- Única por clave (los nulos no chocan entre sí), sin predicado para que el upsert de PostgREST la encuentre.
drop index if exists production_faq_clave;
create unique index if not exists production_faq_clave_uq on production_faq (production_id, clave);
create index if not exists idx_production_faq_pid on production_faq (production_id);
alter table production_faq enable row level security;
drop policy if exists production_faq_read on production_faq;
create policy production_faq_read on production_faq for select to authenticated
  using (is_production_member(production_id) or in_production_team(production_id));
drop policy if exists production_faq_write on production_faq;
create policy production_faq_write on production_faq for all to authenticated
  using (has_perm(production_id, 'obra.editar') or has_perm(production_id, 'comunicados.enviar'))
  with check (has_perm(production_id, 'obra.editar') or has_perm(production_id, 'comunicados.enviar'));

create or replace function production_faq_touch() returns trigger language plpgsql as $$
begin
  new.updated_by := auth.uid(); new.updated_at := now();
  return new;
end $$;
drop trigger if exists production_faq_touch on production_faq;
create trigger production_faq_touch before insert or update on production_faq for each row execute function production_faq_touch();

-- ──────── "Voy" a un ensayo ────────
create table if not exists rehearsal_confirmations (
  rehearsal_id uuid not null references rehearsals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (rehearsal_id, user_id)
);
alter table rehearsal_confirmations enable row level security;
drop policy if exists rehearsal_confirmations_own on rehearsal_confirmations;
create policy rehearsal_confirmations_own on rehearsal_confirmations for select to authenticated using (user_id = auth.uid());
drop policy if exists rehearsal_confirmations_team on rehearsal_confirmations;
create policy rehearsal_confirmations_team on rehearsal_confirmations for select to authenticated
  using (has_perm(rehearsal_production(rehearsal_id), 'ensayos.gestionar')
         or exists (select 1 from rehearsals r where r.id = rehearsal_id and auth.uid() = any (r.encargados)));

-- Confirmar (o quitar la confirmación) que voy a un ensayo al que estoy citado y que no ha empezado.
create or replace function rehearsal_confirm(rid uuid, p_voy boolean default true) returns void
language plpgsql security definer set search_path = public as $$
declare r rehearsals%rowtype;
begin
  if auth.uid() is null then raise exception 'Necesitas iniciar sesión.'; end if;
  select * into r from rehearsals where id = rid;
  if not found then raise exception 'El ensayo no existe.'; end if;
  if not rehearsal_cites(rid, auth.uid()) then raise exception 'No estás citado a este ensayo.'; end if;
  if r.estado <> 'programado' then raise exception 'Este ensayo está cancelado.'; end if;
  if r.inicia < now() then raise exception 'Este ensayo ya empezó.'; end if;
  if p_voy then
    insert into rehearsal_confirmations (rehearsal_id, user_id) values (rid, auth.uid()) on conflict do nothing;
  else
    delete from rehearsal_confirmations where rehearsal_id = rid and user_id = auth.uid();
  end if;
end $$;
revoke execute on function rehearsal_confirm(uuid, boolean) from public, anon;
grant execute on function rehearsal_confirm(uuid, boolean) to authenticated;

-- ──────── Mensaje a alguien del equipo ────────
alter table member_requests add column if not exists para uuid references auth.users(id) on delete set null;
drop policy if exists member_requests_para on member_requests;
create policy member_requests_para on member_requests for select to authenticated using (para = auth.uid());

-- Equipo de la obra al que un integrante puede escribir: puestos con cuenta y miembros con rol de dirección o producción.
create or replace function _equipo_portal(pid text) returns table (user_id uuid, nombre text, puesto text, orden int)
language sql stable security definer set search_path = public as $$
  select x.user_id, x.nombre, x.puesto, min(x.orden)
    from (
      select coalesce(pu.user_id, pe.profile_id) user_id, coalesce(nullif(pe.nombre, ''), display_name(coalesce(pu.user_id, pe.profile_id))) nombre, pu.puesto, pu.orden
        from production_puestos pu left join people pe on pe.id = pu.person_id
       where pu.production_id = pid and coalesce(pu.user_id, pe.profile_id) is not null
      union all
      select m.user_id, display_name(m.user_id), pr.nombre, 1000
        from production_members m join panel_roles pr on pr.id = m.role_id
       where m.production_id = pid and pr.categoria in ('direccion', 'direccion_general', 'produccion')
         and not exists (select 1 from production_puestos pu left join people pe on pe.id = pu.person_id
                          where pu.production_id = pid and coalesce(pu.user_id, pe.profile_id) = m.user_id)
    ) x
   where x.user_id is not null
   group by x.user_id, x.nombre, x.puesto
$$;

create or replace function request_mensaje(pid text, p_para uuid, p_motivo text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Necesitas iniciar sesión.'; end if;
  if not is_active_member(pid, auth.uid()) then raise exception 'Solo el elenco de la obra puede mandar mensajes.'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Escribe tu mensaje.'; end if;
  if p_para is null or p_para = auth.uid() or not exists (select 1 from _equipo_portal(pid) e where e.user_id = p_para) then
    raise exception 'Elige a alguien del equipo de la obra.';
  end if;
  insert into member_requests (production_id, user_id, tipo, motivo, para)
  values (pid, auth.uid(), 'otro', left(btrim(p_motivo), 1000), p_para) returning id into v_id;
  return v_id;
end $$;
revoke execute on function request_mensaje(text, uuid, text) from public, anon;
grant execute on function request_mensaje(text, uuid, text) to authenticated;

-- ──────── A quién le llega cada solicitud ────────
-- Falta o llegada tarde: a los encargados del ensayo; si no hay, a quien gestiona ensayos. Mensaje: a esa persona.
-- Otra solicitud: a Producción (dirección de la obra y productor); si no hay nadie así, a los tres grupos de antes.
create or replace function _produccion_uids(pid text) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct m.user_id), '{}')
    from production_members m join panel_roles pr on pr.id = m.role_id
   where m.production_id = pid and pr.categoria in ('direccion_general', 'produccion')
$$;

create or replace function notify_request() returns trigger
language plpgsql security definer set search_path = public as $$
declare dest uuid[]; enc uuid[];
begin
  begin
    if tg_op = 'INSERT' then
      if new.para is not null then
        perform notify(array[new.para], 'solicitud', display_name(new.user_id) || ' te escribió',
          concat_ws(' · ', production_name(new.production_id), left(new.motivo, 300)),
          '/panel/producciones/' || new.production_id || '/solicitudes', new.production_id);
        return new;
      end if;
      if new.tipo in ('falta', 'llegada') then
        select coalesce(array_agg(distinct e), '{}') into enc
          from member_request_rehearsals x join rehearsals r on r.id = x.rehearsal_id
          cross join lateral unnest(r.encargados) e
         where x.request_id = new.id
           and exists (select 1 from production_members m where m.production_id = r.production_id and m.user_id = e);
        dest := case when cardinality(enc) > 0 then enc else users_with_perm(new.production_id, 'ensayos.gestionar') end;
      elsif new.tipo = 'documento' then dest := users_with_perm(new.production_id, 'expedientes.ver');
      elsif new.tipo = 'pago' then dest := users_with_perm(new.production_id, 'mensualidades.gestionar');
      else
        dest := _produccion_uids(new.production_id);
        if cardinality(dest) = 0 then
          dest := users_with_perm(new.production_id, 'ensayos.gestionar') || users_with_perm(new.production_id, 'expedientes.ver')
               || users_with_perm(new.production_id, 'mensualidades.gestionar');
        end if;
      end if;
      perform notify(dest, 'solicitud', display_name(new.user_id) || ' mandó una solicitud',
        concat_ws(' · ', production_name(new.production_id), request_label(new), left(new.motivo, 120)),
        '/panel/producciones/' || new.production_id || '/solicitudes', new.production_id);
    elsif old.estado = 'pendiente' and new.estado in ('aprobada', 'rechazada') then
      perform notify(array[new.user_id], 'solicitud',
        case when new.para is not null then 'Te respondieron tu mensaje'
             when new.estado = 'aprobada' then 'Tu solicitud fue aprobada' else 'Tu solicitud fue rechazada' end,
        concat_ws(' · ', production_name(new.production_id), case when new.para is null then request_label(new) end, left(new.respuesta, 160)),
        '/cuenta/produccion/' || new.production_id || '#pedir', new.production_id);
    end if;
  exception when others then null;
  end;
  return new;
end $$;
-- Diferido al final de la transacción: así ya existen los ensayos ligados a la solicitud cuando se decide a quién avisar.
drop trigger if exists notify_request on member_requests;
create constraint trigger notify_request after insert or update of estado on member_requests
  deferrable initially deferred for each row execute function notify_request();

-- ──────── Ficha completa de una persona (todas sus obras) ────────
create or replace function persona_ficha(uid uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare casa boolean := has_casa('casa.personas'); menor boolean; out jsonb;
begin
  if auth.uid() is null then raise exception 'No autorizado'; end if;
  if not casa and not can_view_talent(uid)
     and not exists (select 1 from production_members m where m.user_id = uid
                      and (has_perm(m.production_id, 'expedientes.ver') or has_perm(m.production_id, 'ensayos.gestionar')
                           or has_perm(m.production_id, 'mensualidades.gestionar'))) then
    raise exception 'No autorizado';
  end if;
  select fecha_nacimiento > current_date - interval '18 years' into menor from person_files where user_id = uid;
  menor := coalesce(menor, false);
  select jsonb_build_object(
    'obras', coalesce((select jsonb_agg(jsonb_build_object(
        'production_id', p.id, 'obra', p.nombre, 'rol', pr.nombre, 'integrante', m.role_id = 'integrante',
        'ingreso', e.ingreso, 'baja_at', e.baja_at, 'baja_motivo', e.baja_motivo,
        'documentos', has_perm(p.id, 'expedientes.ver') or casa,
        'pagos', has_perm(p.id, 'mensualidades.gestionar') or casa,
        'asistencia', has_perm(p.id, 'ensayos.gestionar') or has_perm(p.id, 'expedientes.ver') or casa,
        'incidencias', can_manage_discipline(p.id) or casa) order by p.created_at desc)
      from production_members m join productions p on p.id = m.production_id join panel_roles pr on pr.id = m.role_id
      left join member_enrollment e on e.production_id = m.production_id and e.user_id = m.user_id
      where m.user_id = uid), '[]'),
    'documentos', coalesce((select jsonb_agg(jsonb_build_object(
        'production_id', t.production_id, 'obra', production_name(t.production_id), 'nombre', t.nombre, 'obligatorio', t.obligatorio,
        'archivo_path', d.archivo_path, 'subido_at', d.subido_at, 'entregado_at', d.entregado_at) order by t.production_id, t.orden, t.nombre)
      from member_doc_types t
      join production_members m on m.production_id = t.production_id and m.user_id = uid and m.role_id = 'integrante'
      left join member_docs d on d.doc_type_id = t.id and d.user_id = uid
      where (has_perm(t.production_id, 'expedientes.ver') or casa)
        and case t.aplica when 'menores' then menor
                          when 'grupo' then t.grupo = any (coalesce(member_groups(t.production_id, uid), '{}'))
                          when 'personas' then uid = any (coalesce(t.personas, '{}'))
                          else (not t.solo_menores or menor) end), '[]'),
    'pagos', coalesce((select jsonb_agg(jsonb_build_object(
        'id', y.id, 'production_id', y.production_id, 'obra', production_name(y.production_id), 'folio', y.folio, 'concepto', y.concepto,
        'periodo', y.periodo, 'monto', y.monto, 'metodo', y.metodo, 'registrado_at', y.registrado_at, 'anulado_at', y.anulado_at) order by y.registrado_at desc)
      from member_payments y where y.user_id = uid and (has_perm(y.production_id, 'mensualidades.gestionar') or casa)), '[]'),
    'asistencia', coalesce((select jsonb_agg(jsonb_build_object(
        'production_id', s.production_id, 'obra', production_name(s.production_id), 'citados', s.citados, 'presentes', s.presentes,
        'retardos', s.retardos, 'faltas', s.faltas, 'justificadas', s.justificadas) order by s.production_id)
      from (select r.production_id,
                   count(*) filter (where r.inicia < now()) citados,
                   count(*) filter (where a.estado = 'presente') presentes,
                   count(*) filter (where a.estado = 'retardo') retardos,
                   count(*) filter (where a.estado = 'falta') faltas,
                   count(*) filter (where a.estado = 'justificada') justificadas
              from rehearsal_attendance a join rehearsals r on r.id = a.rehearsal_id
             where a.user_id = uid and r.estado = 'programado'
               and (has_perm(r.production_id, 'ensayos.gestionar') or has_perm(r.production_id, 'expedientes.ver') or casa)
             group by r.production_id) s), '[]'),
    'ultimos', coalesce((select jsonb_agg(jsonb_build_object(
        'production_id', r.production_id, 'obra', production_name(r.production_id), 'titulo', r.titulo, 'inicia', r.inicia,
        'estado', a.estado, 'minutos_tarde', a.minutos_tarde) order by r.inicia desc)
      from (select a.* from rehearsal_attendance a join rehearsals r on r.id = a.rehearsal_id
             where a.user_id = uid and r.estado = 'programado'
               and (has_perm(r.production_id, 'ensayos.gestionar') or has_perm(r.production_id, 'expedientes.ver') or casa)
             order by r.inicia desc limit 15) a join rehearsals r on r.id = a.rehearsal_id), '[]'),
    'incidencias', coalesce((select jsonb_agg(jsonb_build_object(
        'id', i.id, 'production_id', i.production_id, 'obra', production_name(i.production_id), 'tipo', i.tipo, 'nivel', i.nivel,
        'descripcion', i.descripcion, 'fecha', i.fecha, 'anulada_at', i.anulada_at) order by i.fecha desc)
      from member_incidents i where i.user_id = uid and (can_manage_discipline(i.production_id) or casa)), '[]')
  ) into out;
  return out;
end $$;
revoke execute on function persona_ficha(uuid) from public, anon;
grant execute on function persona_ficha(uuid) to authenticated;

-- ──────── Mi obra: lo que el integrante ve de su producción ────────
create or replace function obra_portal(pid text) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not is_production_member(pid) then null else jsonb_build_object(
    'ficha', (select jsonb_build_object('nombre', nombre, 'frase', frase, 'sinopsis', sinopsis, 'temporada', temporada, 'venue', venue,
                                        'duracion', duracion, 'tipo', tipo, 'estado', estado) from productions where id = pid),
    'reparto', coalesce((select jsonb_agg(jsonb_build_object('nombre', pe.nombre, 'papel', c.papel, 'tipo', c.tipo, 'yo', pe.profile_id = auth.uid())
                                           order by c.tipo, c.orden, pe.nombre)
                           from production_credits c join people pe on pe.id = c.person_id
                          where c.production_id = pid and c.activo and c.tipo in ('reparto', 'ensamble')), '[]'),
    'equipo', coalesce((select jsonb_agg(jsonb_build_object('user_id', e.user_id, 'nombre', e.nombre, 'puesto', e.puesto) order by e.orden, e.puesto, e.nombre)
                          from _equipo_portal(pid) e where e.user_id <> auth.uid()), '[]'),
    'hitos', coalesce((select jsonb_agg(jsonb_build_object('nombre', nombre, 'mes', mes, 'dia', dia, 'notas', notas) order by coalesce(dia, mes), orden)
                         from production_hitos where production_id = pid), '[]'),
    'lugares', coalesce((select jsonb_agg(jsonb_build_object('tipo', tipo, 'nombre', nombre, 'direccion', direccion, 'mapa_url', mapa_url, 'notas', notas) order by orden)
                           from production_lugares where production_id = pid), '[]'),
    'funciones', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'starts_at', starts_at, 'venue', venue, 'puertas_at', puertas_at) order by starts_at)
                             from performances where production_id = pid and cancelada_at is null and starts_at >= now() - interval '6 hours'), '[]'),
    'preguntas', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'pregunta', pregunta, 'respuesta', respuesta) order by orden, pregunta)
                             from production_faq where production_id = pid and activa and btrim(respuesta) <> ''), '[]')
  ) end
$$;
revoke execute on function obra_portal(text) from public, anon;
grant execute on function obra_portal(text) to authenticated;
revoke execute on function _equipo_portal(text) from public, anon;
grant execute on function _equipo_portal(text) to authenticated;

commit;
