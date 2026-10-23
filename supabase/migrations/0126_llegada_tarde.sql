-- 0126 (Diego 2026-10-23): solicitud de llegada tarde.
--   Además de avisar una falta, el elenco puede avisar que llegará tarde a un ensayo: elige el ensayo, la hora a la que
--   llegará y la razón. Se manda hasta que empieza el ensayo y la aprueba quien lleva los ensayos. Aprobada, esa hora es
--   su hora de entrada: llegar ahí (con la tolerancia de la obra) cuenta como asistencia, sin retardo ni advertencia;
--   si llega después, los minutos de retardo se cuentan desde esa hora. Si la aprueban cuando ya llegó, se recalcula su
--   registro y se anulan las advertencias automáticas de retardo que sobren.
-- Precede: 0125.

begin;

alter table member_requests drop constraint if exists member_requests_tipo_check;
alter table member_requests add constraint member_requests_tipo_check check (tipo in ('falta', 'llegada', 'documento', 'pago', 'otro'));
alter table member_requests add column if not exists llegada_hora timestamptz;
alter table member_requests drop constraint if exists member_requests_llegada;
alter table member_requests add constraint member_requests_llegada check (tipo <> 'llegada' or (motivo is not null and llegada_hora is not null));

-- "7:30 p.m." en hora de México.
create or replace function hora_mx(t timestamptz) returns text
language sql stable as $$
  select case when t is null then null else
    ltrim(to_char(t at time zone 'America/Mexico_City', 'HH12:MI'), '0')
    || case when extract(hour from t at time zone 'America/Mexico_City') < 12 then ' a.m.' else ' p.m.' end end
$$;

-- Hora de entrada de una persona a un ensayo: la de su llegada tarde aprobada o el inicio del ensayo.
create or replace function hora_entrada(rid uuid, uid uuid) returns timestamptz
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select max(q.llegada_hora) from member_request_rehearsals x join member_requests q on q.id = x.request_id
      where x.rehearsal_id = rid and q.user_id = uid and q.tipo = 'llegada' and q.estado = 'aprobada'),
    (select inicia from rehearsals where id = rid))
$$;
revoke execute on function hora_entrada(uuid, uuid) from public, anon;
grant execute on function hora_entrada(uuid, uuid) to authenticated;

-- ════════ Pedir ════════
create or replace function request_late(pid text, rid uuid, p_hora timestamptz, p_motivo text) returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r rehearsals%rowtype; cuando text; v_id uuid;
begin
  if uid is null then raise exception 'Necesitas iniciar sesión.'; end if;
  if not is_active_member(pid, uid) then raise exception 'Solo el elenco de la obra puede mandar solicitudes.'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Escribe la razón por la que llegarás tarde.'; end if;
  if p_hora is null then raise exception 'Escribe a qué hora vas a llegar.'; end if;
  select * into r from rehearsals where id = rid;
  if not found or r.production_id <> pid then raise exception 'Ensayo no válido.'; end if;
  cuando := r.titulo || ' (' || to_char(r.inicia at time zone 'America/Mexico_City', 'DD/MM HH24:MI') || ')';
  if r.estado <> 'programado' then raise exception 'El ensayo % está cancelado.', cuando; end if;
  if not rehearsal_cites(rid, uid) then raise exception 'No estás citado al ensayo %.', cuando; end if;
  if now() >= r.inicia then raise exception 'La llegada tarde se avisa antes de que empiece el ensayo. % ya empezó.', cuando; end if;
  if p_hora <= r.inicia then raise exception 'La hora de llegada tiene que ser después de que empiece el ensayo (%).', hora_mx(r.inicia); end if;
  if p_hora >= coalesce(r.termina, r.inicia + interval '6 hours') then
    raise exception 'Esa hora ya es después de que termina el ensayo. Mejor avisa una falta.';
  end if;
  if exists (select 1 from member_request_rehearsals x join member_requests q on q.id = x.request_id
              where x.rehearsal_id = rid and q.user_id = uid and q.estado in ('pendiente', 'aprobada')) then
    raise exception 'Ya mandaste una solicitud de falta o de llegada tarde para %.', cuando;
  end if;
  insert into member_requests (production_id, user_id, tipo, motivo, llegada_hora)
  values (pid, uid, 'llegada', btrim(p_motivo), date_trunc('minute', p_hora)) returning id into v_id;
  insert into member_request_rehearsals (request_id, rehearsal_id) values (v_id, rid);
  return v_id;
end $$;
revoke execute on function request_late(text, uuid, timestamptz, text) from public, anon;
grant execute on function request_late(text, uuid, timestamptz, text) to authenticated;

create or replace function can_review_request(pid text, p_tipo text) returns boolean
language sql stable security definer set search_path = public as $$
  select case p_tipo
    when 'falta' then has_perm(pid, 'ensayos.gestionar')
    when 'llegada' then has_perm(pid, 'ensayos.gestionar')
    when 'documento' then has_perm(pid, 'expedientes.ver')
    when 'pago' then has_perm(pid, 'mensualidades.gestionar')
    else has_perm(pid, 'ensayos.gestionar') or has_perm(pid, 'expedientes.ver') or has_perm(pid, 'mensualidades.gestionar')
  end
$$;

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
      raise exception 'Ya mandaste una solicitud de falta o de llegada tarde para %.', cuando;
    end if;
  end loop;

  insert into member_requests (production_id, user_id, tipo, motivo)
  values (pid, uid, 'falta', btrim(p_motivo)) returning id into v_id;
  insert into member_request_rehearsals (request_id, rehearsal_id)
  select distinct v_id, x from unnest(rehearsal_ids) x;
  return v_id;
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
  cfg_ret int;
  n_ret int;
  tol int;
  v_at rehearsal_attendance%rowtype;
  tarde int;
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
  elsif q.tipo = 'llegada' then
    -- Ya aprobada, su hora de entrada es la que pidió. Si ya llegó, se recalcula su registro con esa hora.
    update member_requests set estado = 'aprobada', respuesta = v_resp, revisado_por = auth.uid(), revisado_at = now() where id = q.id;
    select coalesce((select tolerancia_min from production_discipline where production_id = q.production_id), 10) into tol;
    for v_at in select ra.* from rehearsal_attendance ra join member_request_rehearsals x on x.rehearsal_id = ra.rehearsal_id
              where x.request_id = q.id and ra.user_id = q.user_id and ra.llegada_at is not null and ra.estado in ('presente', 'retardo') loop
      tarde := floor(extract(epoch from (v_at.llegada_at - q.llegada_hora)) / 60)::int;
      update rehearsal_attendance
         set estado = case when tarde > tol then 'retardo' else 'presente' end,
             minutos_tarde = case when tarde > tol then least(tarde, 600) end,
             nota = 'Llegada tarde aprobada (' || hora_mx(q.llegada_hora) || ')'
       where rehearsal_id = v_at.rehearsal_id and user_id = v_at.user_id;
    end loop;
    -- Si un retardo ya había generado advertencia automática, se anula la que sobra.
    select auto_retardos into cfg_ret from production_discipline where production_id = q.production_id;
    if not found then cfg_ret := 3; end if;
    if cfg_ret is not null then
      select count(*) into n_ret from rehearsal_attendance ra join rehearsals r on r.id = ra.rehearsal_id
       where r.production_id = q.production_id and ra.user_id = q.user_id and r.estado = 'programado' and ra.estado = 'retardo' and not ra.historico;
      update member_incidents
         set anulada_at = now(), anulada_motivo = 'Un retardo se justificó con una llegada tarde aprobada.'
       where production_id = q.production_id and user_id = q.user_id and origen = 'auto' and anulada_at is null
         and auto_key ~ '^retardos:[0-9]+$' and split_part(auto_key, ':', 2)::int > n_ret / cfg_ret;
    end if;
    return;
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

-- ════════ Avisos ════════
create or replace function request_label(q member_requests) returns text
language sql stable as $$
  select case q.tipo when 'falta' then 'Falta justificada'
                     when 'llegada' then 'Llegada tarde (' || coalesce(hora_mx(q.llegada_hora), '') || ')' when 'documento' then 'Documento: ' || coalesce(q.doc_nombre, '')
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
        when 'llegada' then users_with_perm(new.production_id, 'ensayos.gestionar')
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

-- ════════ Asistencia: los minutos se cuentan desde la hora de entrada ════════
create or replace function _llegada(r rehearsals, uid uuid, p_nota text) returns text
language plpgsql security definer set search_path = public as $$
declare tol int; tarde int; est text;
begin
  select coalesce((select tolerancia_min from production_discipline where production_id = r.production_id), 10) into tol;
  -- 0126: con una llegada tarde aprobada, los minutos se cuentan desde la hora que pidió.
  tarde := floor(extract(epoch from (now() - hora_entrada(r.id, uid))) / 60)::int;
  est := case when tarde > tol then 'retardo' else 'presente' end;
  insert into rehearsal_attendance (rehearsal_id, user_id, estado, minutos_tarde, nota, marcado_por, marcado_at, llegada_at)
  values (r.id, uid, est, case when est = 'retardo' then least(tarde, 600) end, p_nota, auth.uid(), now(), now())
  on conflict (rehearsal_id, user_id) do update
    set estado = excluded.estado, minutos_tarde = excluded.minutos_tarde, nota = excluded.nota,
        marcado_por = excluded.marcado_por, marcado_at = excluded.marcado_at, llegada_at = excluded.llegada_at;
  return est;
end $$;
revoke execute on function _llegada(rehearsals, uuid, text) from public, anon, authenticated;

-- ════════ Lista del ensayo: muestra la llegada tarde ════════
drop function if exists rehearsal_roster(uuid);
create function rehearsal_roster(rid uuid)
returns table (user_id uuid, nombre text, papeles text[], estado text, minutos_tarde int, nota text, aviso text,
               equipo boolean, encargado boolean, marcado_por text, llegada_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare pid text := rehearsal_production(rid); enc uuid[];
begin
  if not puede_pasar_lista(rid) then raise exception 'No autorizado'; end if;
  select r.encargados into enc from rehearsals r where r.id = rid;
  return query
    with citados as (
      select distinct m.user_id as uid from production_members m
       where m.production_id = pid and rehearsal_cites(rid, m.user_id))
    select c.uid,
           coalesce(nullif(btrim(pe.nombre), ''), nullif(btrim(pr.nombre), ''), split_part(u.email::text, '@', 1)),
           case when exists (select 1 from production_members m where m.production_id = pid and m.user_id = c.uid and m.role_id = 'integrante')
                then coalesce((select array_agg(coalesce(cr.papel, initcap(cr.tipo)) order by cr.tipo, cr.orden)
                                 from production_credits cr where cr.production_id = pid and cr.person_id = pe.id), '{}')
                else coalesce((select array_agg(rl.nombre order by rl.orden) from production_members m join panel_roles rl on rl.id = m.role_id
                                where m.production_id = pid and m.user_id = c.uid), '{}') end,
           a.estado, a.minutos_tarde, a.nota,
           coalesce(
             (select case when q.tipo = 'llegada'
                          then 'Llega a las ' || hora_mx(q.llegada_hora) || case q.estado when 'pendiente' then ' (por aprobar): ' else ' (aprobada): ' end
                          else case q.estado when 'pendiente' then 'Solicitó falta (por aprobar): ' else 'Falta justificada por solicitud: ' end end
                     || coalesce(q.motivo, '')
                from member_request_rehearsals x join member_requests q on q.id = x.request_id
               where x.rehearsal_id = rid and q.user_id = c.uid and q.estado in ('pendiente', 'aprobada')
               order by q.created_at desc limit 1),
             'Avisó que no viene: ' || ab.motivo),
           not exists (select 1 from production_members m where m.production_id = pid and m.user_id = c.uid and m.role_id = 'integrante'),
           c.uid = any(enc),
           (select coalesce(nullif(btrim(p2.nombre), ''), 'alguien del equipo') from profiles p2 where p2.id = a.marcado_por),
           a.llegada_at
      from citados c
      join auth.users u on u.id = c.uid
      left join profiles pr on pr.id = c.uid
      left join people pe on pe.profile_id = c.uid
      left join rehearsal_attendance a on a.rehearsal_id = rid and a.user_id = c.uid
      left join rehearsal_absences ab on ab.rehearsal_id = rid and ab.user_id = c.uid
     order by 8, 2;
end $$;

commit;
