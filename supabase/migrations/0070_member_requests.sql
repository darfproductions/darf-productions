-- 0070: solicitudes del elenco (2026-10-12, aprobado por Diego).
--   El integrante manda solicitudes que alguien aprueba o rechaza, y todo queda registrado:
--   * falta: se pide ANTES del ensayo (límite por obra, production_discipline.aviso_falta_horas,
--     24 h por omisión). Puede cubrir varios ensayos. Al aprobarse, la asistencia queda
--     'justificada' sola (y se anulan advertencias automáticas de faltas que ya no aplican).
--   * documento: nombre (de la lista de la obra u "Otro") + archivo. Si es de la lista, al
--     aprobarse queda entregado en su expediente.
--   * pago: comprobante con concepto, mes, monto y método. Al aprobarse se registra el pago
--     (quien aprueba puede corregir el monto).
--   * otro: tema de pagos u otra solicitud, solo texto.
--   Revisan: falta → ensayos.gestionar · documento → expedientes.ver · pago → mensualidades.gestionar
--   · otro → cualquiera de los tres. El integrante solo crea (RPC), ve y cancela lo suyo.
--   Reemplaza el aviso "No podré ir" (rehearsal_absences, 0043): los avisos de ensayos futuros
--   pasan a solicitudes pendientes; la tabla vieja queda solo de lectura (historial).
-- Precede: 0069.

begin;

alter table production_discipline
  add column aviso_falta_horas int not null default 24 check (aviso_falta_horas between 0 and 168);

-- ════════ Tablas ════════
create table member_requests (
  id uuid primary key default gen_random_uuid(),
  production_id text not null references productions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('falta', 'documento', 'pago', 'otro')),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada', 'cancelada')),
  motivo text check (motivo is null or length(btrim(motivo)) between 1 and 1000),
  archivo_path text check (archivo_path is null or archivo_path like production_id || '/' || user_id::text || '/%'),
  doc_type_id uuid references member_doc_types(id) on delete set null,
  doc_nombre text check (doc_nombre is null or length(btrim(doc_nombre)) between 1 and 80),
  concepto text check (concepto in ('mensualidad', 'inscripcion')),
  periodo date check (periodo is null or extract(day from periodo) = 1),
  monto numeric(10,2) check (monto is null or monto > 0),
  metodo text check (metodo in ('efectivo', 'transferencia', 'tarjeta', 'otro')),
  monto_aprobado numeric(10,2),
  payment_id uuid references member_payments(id) on delete set null,
  revisado_por uuid references auth.users(id) on delete set null,
  revisado_at timestamptz,
  respuesta text check (respuesta is null or length(respuesta) <= 1000),
  created_at timestamptz not null default now(),
  check (tipo not in ('falta', 'otro') or motivo is not null),
  check (tipo <> 'documento' or (archivo_path is not null and doc_nombre is not null)),
  check (tipo <> 'pago' or (archivo_path is not null and concepto is not null and monto is not null and metodo is not null
                            and (concepto <> 'mensualidad' or periodo is not null))),
  check (estado <> 'rechazada' or coalesce(btrim(respuesta), '') <> '')
);
create index idx_member_requests_prod on member_requests(production_id, estado, created_at desc);
create index idx_member_requests_user on member_requests(user_id, production_id);

create table member_request_rehearsals (
  request_id uuid not null references member_requests(id) on delete cascade,
  rehearsal_id uuid not null references rehearsals(id) on delete cascade,
  primary key (request_id, rehearsal_id)
);
create index idx_member_request_rehearsals_r on member_request_rehearsals(rehearsal_id);

-- ════════ Quién revisa y quién puede pedir ════════
create or replace function can_review_request(pid text, p_tipo text) returns boolean
language sql stable security definer set search_path = public as $$
  select case p_tipo
    when 'falta' then has_perm(pid, 'ensayos.gestionar')
    when 'documento' then has_perm(pid, 'expedientes.ver')
    when 'pago' then has_perm(pid, 'mensualidades.gestionar')
    else has_perm(pid, 'ensayos.gestionar') or has_perm(pid, 'expedientes.ver') or has_perm(pid, 'mensualidades.gestionar')
  end
$$;

-- Integrante de la obra que no se ha dado de baja.
create or replace function is_active_member(pid text, uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from production_members m where m.production_id = pid and m.user_id = uid and m.role_id = 'integrante')
     and not exists (select 1 from member_enrollment e where e.production_id = pid and e.user_id = uid
                      and e.baja_at is not null and e.baja_at <= (now() at time zone 'America/Mexico_City')::date)
$$;

alter table member_requests enable row level security;
alter table member_request_rehearsals enable row level security;
-- Sin políticas de escritura: todo pasa por las funciones de abajo.
create policy member_requests_own on member_requests for select to authenticated using (user_id = auth.uid());
create policy member_requests_review on member_requests for select to authenticated using (can_review_request(production_id, tipo));
create policy member_request_rehearsals_read on member_request_rehearsals for select to authenticated
  using (exists (select 1 from member_requests q where q.id = request_id
                  and (q.user_id = auth.uid() or can_review_request(q.production_id, q.tipo))));
revoke all on member_requests, member_request_rehearsals from anon;
revoke insert, update, delete on member_requests, member_request_rehearsals from authenticated;

create trigger audit_member_requests after insert or update or delete on member_requests
  for each row execute function audit_row();

-- ════════ Pedir ════════
create or replace function request_absence(pid text, rehearsal_ids uuid[], p_motivo text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  horas int;
  r rehearsals%rowtype;
  rid uuid;
  cuando text;
  v_id uuid;
begin
  if uid is null then raise exception 'Necesitas iniciar sesión.'; end if;
  if not is_active_member(pid, uid) then raise exception 'Solo el elenco de la obra puede mandar solicitudes.'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Escribe la razón de la falta.'; end if;
  if coalesce(cardinality(rehearsal_ids), 0) = 0 then raise exception 'Elige al menos un ensayo.'; end if;
  if cardinality(rehearsal_ids) > 30 then raise exception 'Máximo 30 ensayos por solicitud.'; end if;
  select coalesce((select aviso_falta_horas from production_discipline where production_id = pid), 24) into horas;

  foreach rid in array rehearsal_ids loop
    select * into r from rehearsals where id = rid;
    if not found or r.production_id <> pid then raise exception 'Ensayo no válido.'; end if;
    cuando := r.titulo || ' (' || to_char(r.inicia at time zone 'America/Mexico_City', 'DD/MM HH24:MI') || ')';
    if r.estado <> 'programado' then raise exception 'El ensayo % está cancelado.', cuando; end if;
    if not rehearsal_cites(rid, uid) then raise exception 'No estás citado al ensayo %.', cuando; end if;
    if now() > r.inicia - make_interval(hours => horas) then
      if horas = 0 then raise exception 'Las faltas se avisan antes de que empiece el ensayo. % ya empezó.', cuando; end if;
      raise exception 'Las faltas se avisan con al menos % horas de anticipación. Para % ya pasó el límite.', horas, cuando;
    end if;
    if exists (select 1 from member_request_rehearsals x join member_requests q on q.id = x.request_id
                where x.rehearsal_id = rid and q.user_id = uid and q.estado in ('pendiente', 'aprobada')) then
      raise exception 'Ya mandaste una solicitud de falta para %.', cuando;
    end if;
  end loop;

  insert into member_requests (production_id, user_id, tipo, motivo)
  values (pid, uid, 'falta', btrim(p_motivo)) returning id into v_id;
  insert into member_request_rehearsals (request_id, rehearsal_id)
  select distinct v_id, x from unnest(rehearsal_ids) x;
  return v_id;
end $$;

create or replace function request_submit(pid text, p_tipo text, p_motivo text, p_archivo text, p_doc_type uuid,
  p_doc_nombre text, p_concepto text, p_periodo date, p_monto numeric, p_metodo text) returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); v_nombre text := nullif(btrim(coalesce(p_doc_nombre, '')), ''); v_id uuid;
begin
  if uid is null then raise exception 'Necesitas iniciar sesión.'; end if;
  if p_tipo not in ('documento', 'pago', 'otro') then raise exception 'Tipo de solicitud no válido.'; end if;
  if not is_active_member(pid, uid) then raise exception 'Solo el elenco de la obra puede mandar solicitudes.'; end if;
  if (select count(*) from member_requests where production_id = pid and user_id = uid and estado = 'pendiente') >= 20 then
    raise exception 'Tienes muchas solicitudes pendientes. Espera a que las revisen.';
  end if;
  if p_archivo is not null and p_archivo not like pid || '/' || uid::text || '/%' then raise exception 'Archivo no válido.'; end if;
  if p_tipo = 'documento' then
    if p_archivo is null then raise exception 'Sube el archivo del documento.'; end if;
    if p_doc_type is not null then
      select nombre into v_nombre from member_doc_types where id = p_doc_type and production_id = pid;
      if not found then raise exception 'Documento no válido.'; end if;
    end if;
    if v_nombre is null then raise exception 'Escribe el nombre del documento.'; end if;
  elsif p_tipo = 'pago' then
    if p_archivo is null then raise exception 'Sube el comprobante.'; end if;
    if p_concepto not in ('mensualidad', 'inscripcion') then raise exception 'Elige si es mensualidad o inscripción.'; end if;
    if coalesce(p_monto, 0) <= 0 then raise exception 'Escribe el monto que pagaste.'; end if;
    if p_concepto = 'mensualidad' and p_periodo is null then raise exception 'Elige el mes que pagaste.'; end if;
  elsif coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Escribe tu solicitud.';
  end if;

  insert into member_requests (production_id, user_id, tipo, motivo, archivo_path, doc_type_id, doc_nombre, concepto, periodo, monto, metodo)
  values (pid, uid, p_tipo, nullif(btrim(coalesce(p_motivo, '')), ''), p_archivo,
          case when p_tipo = 'documento' then p_doc_type end,
          case when p_tipo = 'documento' then v_nombre end,
          case when p_tipo = 'pago' then p_concepto end,
          case when p_tipo = 'pago' and p_periodo is not null then date_trunc('month', p_periodo)::date end,
          case when p_tipo = 'pago' then p_monto end,
          case when p_tipo = 'pago' then coalesce(p_metodo, 'transferencia') end)
  returning id into v_id;
  return v_id;
end $$;

create or replace function request_cancel(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update member_requests set estado = 'cancelada' where id = p_id and user_id = auth.uid() and estado = 'pendiente';
  if not found then raise exception 'Esta solicitud ya no se puede cancelar.'; end if;
end $$;

-- ════════ Revisar ════════
create or replace function request_review(p_id uuid, p_aprobar boolean, p_respuesta text, p_monto numeric default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  q member_requests%rowtype;
  v_resp text := nullif(btrim(coalesce(p_respuesta, '')), '');
  v_monto numeric;
  v_pay uuid;
  cfg_faltas int;
  n_fal int;
begin
  select * into q from member_requests where id = p_id for update;
  if not found then raise exception 'La solicitud no existe.'; end if;
  if not can_review_request(q.production_id, q.tipo) then raise exception 'No tienes permiso para revisar esta solicitud.'; end if;
  if q.user_id = auth.uid() then raise exception 'No puedes revisar tu propia solicitud.'; end if;
  if q.estado <> 'pendiente' then raise exception 'Esta solicitud ya fue revisada o cancelada.'; end if;

  if not p_aprobar then
    if v_resp is null then raise exception 'Escribe por qué se rechaza.'; end if;
    update member_requests set estado = 'rechazada', respuesta = v_resp, revisado_por = auth.uid(), revisado_at = now() where id = q.id;
    return;
  end if;

  if q.tipo = 'falta' then
    insert into rehearsal_attendance (rehearsal_id, user_id, estado, minutos_tarde, nota, marcado_por, marcado_at)
    select x.rehearsal_id, q.user_id, 'justificada', null, 'Falta justificada por solicitud aprobada', auth.uid(), now()
      from member_request_rehearsals x join rehearsals r on r.id = x.rehearsal_id
     where x.request_id = q.id and r.estado = 'programado' and rehearsal_cites(x.rehearsal_id, q.user_id)
    on conflict (rehearsal_id, user_id) do update
      set estado = 'justificada', minutos_tarde = null, nota = excluded.nota, marcado_por = excluded.marcado_por, marcado_at = now();
    -- Si una de esas faltas ya había generado advertencia automática, se anula la que sobra.
    select auto_faltas into cfg_faltas from production_discipline where production_id = q.production_id;
    if not found then cfg_faltas := 2; end if;
    if cfg_faltas is not null then
      select count(*) into n_fal from rehearsal_attendance a join rehearsals r on r.id = a.rehearsal_id
       where r.production_id = q.production_id and a.user_id = q.user_id and r.estado = 'programado' and a.estado = 'falta';
      update member_incidents
         set anulada_at = now(), anulada_motivo = 'Una falta se justificó con una solicitud aprobada.'
       where production_id = q.production_id and user_id = q.user_id and origen = 'auto' and anulada_at is null
         and auto_key ~ '^faltas:[0-9]+$' and split_part(auto_key, ':', 2)::int > n_fal / cfg_faltas;
    end if;
  elsif q.tipo = 'pago' then
    v_monto := coalesce(p_monto, q.monto);
    if v_monto is null or v_monto <= 0 then raise exception 'El monto debe ser mayor a cero.'; end if;
    insert into member_payments (production_id, user_id, periodo, monto, metodo, nota, concepto, registrado_por)
    values (q.production_id, q.user_id, coalesce(q.periodo, date_trunc('month', now() at time zone 'America/Mexico_City')::date),
            v_monto, q.metodo, 'Comprobante aprobado (solicitud)', q.concepto, auth.uid())
    returning id into v_pay;
    update member_requests set monto_aprobado = v_monto, payment_id = v_pay where id = q.id;
  elsif q.tipo = 'documento' and q.doc_type_id is not null then
    insert into member_docs (doc_type_id, production_id, user_id, archivo_path, subido_at, entregado_at, recibido_por)
    values (q.doc_type_id, q.production_id, q.user_id, q.archivo_path, now(), now(), auth.uid())
    on conflict (doc_type_id, user_id) do update
      set archivo_path = excluded.archivo_path, subido_at = now(), entregado_at = now(), recibido_por = auth.uid();
  end if;

  update member_requests set estado = 'aprobada', respuesta = v_resp, revisado_por = auth.uid(), revisado_at = now() where id = q.id;
end $$;

-- Nombres de quienes mandaron solicitudes (para quien las revisa).
create or replace function request_people(pid text) returns table (user_id uuid, nombre text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not can_review_request(pid, 'otro') then raise exception 'No autorizado'; end if;
  return query
    select distinct q.user_id,
           coalesce(nullif(btrim(pe.nombre), ''), nullif(btrim(pr.nombre), ''), split_part(u.email::text, '@', 1))
      from member_requests q
      join auth.users u on u.id = q.user_id
      left join profiles pr on pr.id = q.user_id
      left join people pe on pe.profile_id = q.user_id
     where q.production_id = pid;
end $$;

-- ════════ El aviso viejo pasa a solicitud ════════
-- Avisos de ensayos que no han pasado → solicitudes de falta pendientes (antes de crear la notificación).
do $$ declare a record; v_id uuid; begin
  for a in select ab.rehearsal_id, ab.user_id, ab.motivo, ab.created_at, r.production_id
             from rehearsal_absences ab join rehearsals r on r.id = ab.rehearsal_id
            where r.inicia > now() and r.estado = 'programado' loop
    insert into member_requests (production_id, user_id, tipo, motivo, created_at)
    values (a.production_id, a.user_id, 'falta', left(a.motivo, 1000), a.created_at) returning id into v_id;
    insert into member_request_rehearsals (request_id, rehearsal_id) values (v_id, a.rehearsal_id);
  end loop;
end $$;
drop trigger if exists notify_absence on rehearsal_absences;
drop policy if exists rehearsal_absences_own on rehearsal_absences;
create policy rehearsal_absences_own_read on rehearsal_absences for select to authenticated using (user_id = auth.uid());

-- ════════ Notificaciones ════════
create or replace function request_label(q member_requests) returns text
language sql immutable as $$
  select case q.tipo when 'falta' then 'Falta justificada' when 'documento' then 'Documento: ' || coalesce(q.doc_nombre, '')
                     when 'pago' then 'Comprobante de pago' else 'Solicitud' end
$$;

create or replace function notify_request() returns trigger
language plpgsql security definer set search_path = public as $$
declare dest uuid[];
begin
  begin
    if tg_op = 'INSERT' then
      dest := case new.tipo
        when 'falta' then users_with_perm(new.production_id, 'ensayos.gestionar')
        when 'documento' then users_with_perm(new.production_id, 'expedientes.ver')
        when 'pago' then users_with_perm(new.production_id, 'mensualidades.gestionar')
        else users_with_perm(new.production_id, 'ensayos.gestionar') || users_with_perm(new.production_id, 'expedientes.ver')
             || users_with_perm(new.production_id, 'mensualidades.gestionar') end;
      perform notify(dest, 'solicitud', display_name(new.user_id) || ' mandó una solicitud',
        concat_ws(' · ', production_name(new.production_id), request_label(new), left(new.motivo, 120)),
        '/panel/producciones/' || new.production_id || '/solicitudes', new.production_id);
    elsif old.estado = 'pendiente' and new.estado in ('aprobada', 'rechazada') then
      perform notify(array[new.user_id], 'solicitud',
        case new.estado when 'aprobada' then 'Tu solicitud fue aprobada' else 'Tu solicitud fue rechazada' end,
        concat_ws(' · ', production_name(new.production_id), request_label(new), left(new.respuesta, 160)),
        '/cuenta/produccion/' || new.production_id || '#solicitudes', new.production_id);
    end if;
  exception when others then null;
  end;
  return new;
end $$;
create trigger notify_request after insert or update of estado on member_requests
  for each row execute function notify_request();

-- El tipo 'solicitud' también se puede apagar en el teléfono (reemplaza a 'ausencia').
create or replace function push_set_off(p_tipos text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Necesitas iniciar sesión'; end if;
  insert into push_prefs (user_id, apagados)
  values (auth.uid(), coalesce((select array_agg(distinct t) from unnest(p_tipos) t
                                 where t in ('contacto', 'audicion', 'orden', 'oferta', 'documento', 'ausencia', 'solicitud', 'equipo', 'cambio', 'prueba')), '{}'))
  on conflict (user_id) do update set apagados = excluded.apagados;
end $$;
revoke execute on function push_set_off(text[]) from public, anon;
grant execute on function push_set_off(text[]) to authenticated;

-- ════════ Lista de asistencia: muestra la solicitud ════════
create or replace function rehearsal_roster(rid uuid)
returns table (user_id uuid, nombre text, papeles text[], estado text, minutos_tarde int, nota text, aviso text)
language plpgsql stable security definer set search_path = public as $$
declare pid text := rehearsal_production(rid);
begin
  if not has_perm(pid, 'ensayos.gestionar') then raise exception 'No autorizado'; end if;
  return query
    select m.user_id,
           coalesce(nullif(btrim(pe.nombre), ''), nullif(btrim(pr.nombre), ''), split_part(u.email::text, '@', 1)),
           coalesce((select array_agg(coalesce(c.papel, initcap(c.tipo)) order by c.tipo, c.orden)
                       from production_credits c where c.production_id = pid and c.person_id = pe.id), '{}'),
           a.estado, a.minutos_tarde, a.nota,
           coalesce(
             (select case q.estado when 'pendiente' then 'Solicitó falta (por aprobar): ' else 'Falta justificada por solicitud: ' end || coalesce(q.motivo, '')
                from member_request_rehearsals x join member_requests q on q.id = x.request_id
               where x.rehearsal_id = rid and q.user_id = m.user_id and q.estado in ('pendiente', 'aprobada')
               order by q.created_at desc limit 1),
             'Avisó que no viene: ' || ab.motivo)
      from production_members m
      join auth.users u on u.id = m.user_id
      left join profiles pr on pr.id = m.user_id
      left join people pe on pe.profile_id = m.user_id
      left join rehearsal_attendance a on a.rehearsal_id = rid and a.user_id = m.user_id
      left join rehearsal_absences ab on ab.rehearsal_id = rid and ab.user_id = m.user_id
     where m.production_id = pid and m.role_id = 'integrante' and rehearsal_cites(rid, m.user_id)
     order by 2;
end $$;

-- ════════ Inicio del panel: solicitudes del elenco por revisar ════════
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
    select 'solicitudes_elenco', q.production_id, count(*) from member_requests q
     where q.estado = 'pendiente' and q.production_id in (select pid from mias) and can_review_request(q.production_id, q.tipo)
     group by q.production_id
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

-- ════════ Permisos de las funciones ════════
revoke execute on function notify_request(), request_label(member_requests) from public, anon, authenticated;
revoke execute on function can_review_request(text, text), is_active_member(text, uuid), request_people(text),
  request_absence(text, uuid[], text), request_submit(text, text, text, text, uuid, text, text, date, numeric, text),
  request_cancel(uuid), request_review(uuid, boolean, text, numeric) from public, anon;
grant execute on function can_review_request(text, text), is_active_member(text, uuid), request_people(text),
  request_absence(text, uuid[], text), request_submit(text, text, text, text, uuid, text, text, date, numeric, text),
  request_cancel(uuid), request_review(uuid, boolean, text, numeric) to authenticated;

commit;
