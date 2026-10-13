-- 0090: pulido general (Bloque 3, 2026-10-13). Base de datos:
--   1. Advertencias automáticas por mensualidades: corren solas cada día (antes solo al abrir
--      Expedientes). discipline_scan_fees conserva su permiso y usa la misma regla interna.
--   2. Limpieza automática diaria: bitácora de más de 24 meses, notificaciones leídas de más de
--      90 días, preguntas de DARFY de más de 12 meses y el historial del programador (14 días).
--   3. Bitácora sin datos sensibles: en medidas, incidencias, pagos, documentos, cuotas, perfil
--      profesional, fichas y solicitudes solo se guarda qué registro cambió y qué campos, no sus
--      valores. Al eliminar una cuenta se borran de la bitácora los datos de esa persona.
--   4. Contacto: no se repite el mismo mensaje y el aviso va solo al Director, agrupado (uno por
--      hora si aún no se lee). DARFY no guarda la misma pregunta dos veces el mismo día.
--   5. Fotos de audiciones: solo en convocatorias abiertas y máximo 10 por persona.
--   6. Asientos ocupados sin tope de 1,000 filas (lista en vez de filas sueltas).
--   7. Índices para búsquedas frecuentes por persona y por convocatoria.
--   8. "Por hacer" no pierde solicitudes sin revisar al cerrar la convocatoria.
--   9. Cierre: "Cobrado en taller" solo para quien maneja mensualidades o publica la obra.
--  10. Aviso de evento nuevo sin la hora repetida.
--  11. Buscador del panel: el código de una orden sin "DARF-" también la encuentra.
-- Precede: 0089.

begin;

-- ════════ 1. Advertencias diarias ════════
create or replace function _discipline_scan_fees(pid text) returns int
language plpgsql security definer set search_path = public as $$
declare
  cfg production_discipline%rowtype; f production_fees%rowtype; r record; vencidos int; n int; hechas int := 0;
begin
  select * into f from production_fees where production_id = pid;
  if not found or not f.cobrar or f.monto <= 0 then return 0; end if;
  select * into cfg from production_discipline where production_id = pid;
  if not found then cfg.auto_mensualidad_meses := 2; end if;
  if cfg.auto_mensualidad_meses is null then return 0; end if;
  for r in
    select m.user_id, coalesce(t.beca, false) as beca, coalesce(t.cuota_especial, f.monto) as debe,
           greatest(f.desde, date_trunc('month', coalesce(e.ingreso, f.desde))::date) as desde,
           least(f.hasta, coalesce(date_trunc('month', e.baja_at - 1)::date, f.hasta), date_trunc('month', hoy_mx())::date) as hasta
      from production_members m
      left join member_fee_terms t on t.production_id = pid and t.user_id = m.user_id
      left join member_enrollment e on e.production_id = pid and e.user_id = m.user_id
     where m.production_id = pid and m.role_id = 'integrante'
  loop
    continue when r.beca or r.debe <= 0 or r.hasta < r.desde;
    select count(*) into vencidos
      from generate_series(r.desde, r.hasta, interval '1 month') g(periodo)
     where (g.periodo::date + (f.dia_limite - 1)) < hoy_mx()
       and coalesce((select sum(p.monto) from member_payments p
                      where p.production_id = pid and p.user_id = r.user_id and p.concepto = 'mensualidad'
                        and p.periodo = g.periodo::date and p.anulado_at is null), 0) < r.debe;
    for n in 1 .. (vencidos / cfg.auto_mensualidad_meses) loop
      insert into member_incidents (production_id, user_id, tipo, nivel, descripcion, origen, auto_key, created_by)
      values (pid, r.user_id, 'mensualidad', 'advertencia',
              format('Mensualidad: %s meses vencidos sin pagar.', n * cfg.auto_mensualidad_meses), 'auto', 'mensualidad:' || n, null)
      on conflict (production_id, user_id, auto_key) where auto_key is not null do nothing;
      if found then hechas := hechas + 1; end if;
    end loop;
  end loop;
  return hechas;
end $$;

create or replace function discipline_scan_fees(pid text) returns int
language plpgsql security definer set search_path = public as $$
begin
  if not (can_manage_discipline(pid) or has_perm(pid, 'mensualidades.gestionar')) then raise exception 'No autorizado'; end if;
  return _discipline_scan_fees(pid);
end $$;

create or replace function discipline_scan_all() returns int
language plpgsql security definer set search_path = public as $$
declare p record; n int := 0;
begin
  for p in select f.production_id from production_fees f join productions pr on pr.id = f.production_id
            where f.cobrar and f.monto > 0 and not pr.concluded loop
    begin
      n := n + _discipline_scan_fees(p.production_id);
    exception when others then null;  -- una obra con datos raros no detiene a las demás
    end;
  end loop;
  return n;
end $$;
revoke execute on function _discipline_scan_fees(text), discipline_scan_all() from public, anon, authenticated;

-- ════════ 2. Limpieza automática ════════
create or replace function darf_limpieza() returns json
language plpgsql security definer set search_path = public as $$
declare a int; nt int; d int; c int := 0;
begin
  delete from audit_log where at < now() - interval '24 months';
  get diagnostics a = row_count;
  delete from notifications where read_at is not null and read_at < now() - interval '90 days';
  get diagnostics nt = row_count;
  delete from darfy_unanswered where created_at < now() - interval '12 months';
  get diagnostics d = row_count;
  if to_regclass('cron.job_run_details') is not null then
    execute $q$delete from cron.job_run_details where end_time < now() - interval '14 days'$q$;
    get diagnostics c = row_count;
  end if;
  return json_build_object('bitacora', a, 'notificaciones', nt, 'darfy', d, 'programador', c);
end $$;
revoke execute on function darf_limpieza() from public, anon, authenticated;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname in ('darf_advertencias', 'darf_limpieza');
    -- 7:05 y 3:20 de la mañana en México (13:05 y 9:20 UTC).
    perform cron.schedule('darf_advertencias', '5 13 * * *', 'select public.discipline_scan_all()');
    perform cron.schedule('darf_limpieza', '20 9 * * *', 'select public.darf_limpieza()');
  end if;
end $$;

-- ════════ 3. Bitácora sin datos sensibles ════════
create or replace function _audit_resumen(t text, o jsonb, n jsonb) returns jsonb
language sql immutable as $$
  select case when t in ('member_measures', 'member_incidents', 'member_payments', 'member_docs', 'member_fee_terms',
                         'pro_profiles', 'people', 'member_requests')
    then jsonb_strip_nulls(jsonb_build_object(
           'id', coalesce(n, o)->'id', 'user_id', coalesce(n, o)->'user_id', 'production_id', coalesce(n, o)->'production_id',
           'tipo', coalesce(n, o)->'tipo', 'estado', coalesce(n, o)->'estado',
           'campos', case when o is not null and n is not null then
             (select jsonb_agg(k order by k) from jsonb_object_keys(n) k where n->k is distinct from o->k) end,
           'privado', true))
  end
$$;
revoke execute on function _audit_resumen(text, jsonb, jsonb) from public, anon, authenticated;

create or replace function audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  r jsonb := coalesce(n, o);
  s jsonb := _audit_resumen(tg_table_name, o, n);
begin
  insert into audit_log (tabla, accion, registro_id, production_id, antes, despues)
  values (
    tg_table_name,
    lower(tg_op),
    coalesce(r->>'id', concat_ws(':', r->>'role_id', r->>'permission_id')),
    case when tg_table_name = 'productions' then r->>'id' else r->>'production_id' end,
    case when s is null then o when o is not null then s end,
    case when s is null then n when n is not null then s end
  );
  return null;
end $$;

-- Lo que ya estaba guardado de esas tablas se reduce igual.
update audit_log set antes = case when antes is not null then _audit_resumen(tabla, antes, despues) end,
                     despues = case when despues is not null then _audit_resumen(tabla, antes, despues) end
 where tabla in ('member_measures', 'member_incidents', 'member_payments', 'member_docs', 'member_fee_terms',
                 'pro_profiles', 'people', 'member_requests')
   and not coalesce((coalesce(despues, antes)->>'privado')::boolean, false);

create or replace function account_delete(p_confirm text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Necesitas iniciar sesión.'; end if;
  if p_confirm is distinct from 'ELIMINAR' then raise exception 'Escribe ELIMINAR para confirmar.'; end if;
  if exists (select 1 from profiles where id = uid and rol <> 'fan') then
    raise exception 'Tu cuenta es del equipo de DARF. Pide al Director que la dé de baja.';
  end if;
  if exists (select 1 from production_members where user_id = uid)
     or exists (select 1 from member_enrollment where user_id = uid)
     or exists (select 1 from rubric_teachers where user_id = uid)
     or exists (select 1 from audition_members where user_id = uid) then
    raise exception 'Tienes un expediente o un papel en una producción. Escríbenos desde Contacto y lo hacemos contigo.';
  end if;
  if exists (select 1 from orders o join sellers s on s.id = o.seller_id where s.user_id = uid) then
    raise exception 'Hay boletos vendidos con tu código de vendedor. Escríbenos desde Contacto y lo hacemos contigo.';
  end if;
  if exists (select 1 from orders where buyer_user_id = uid and status = 'pendiente') then
    raise exception 'Tienes una orden pendiente de pago. Espera a que se apruebe o se cancele.';
  end if;
  if exists (select 1 from orders o join performances pf on pf.id = o.performance_id
              where o.buyer_user_id = uid and o.status = 'aprobado' and pf.starts_at > now()) then
    raise exception 'Tienes boletos para una función que aún no pasa. Podrás eliminar tu cuenta después de tu función.';
  end if;
  update orders set buyer_user_id = null, buyer_nombre = 'Cuenta eliminada', buyer_telefono = '—' where buyer_user_id = uid;
  -- La bitácora no conserva datos de una cuenta eliminada.
  update audit_log set antes = null, despues = null, actor = null
   where actor = uid or registro_id = uid::text
      or antes->>'user_id' = uid::text or despues->>'user_id' = uid::text;
  delete from auth.users where id = uid;
end $$;

-- ════════ 4. Contacto y DARFY ════════
create or replace function contact_rate_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from contact_messages where lower(correo) = lower(new.correo)
              and btrim(mensaje) = btrim(new.mensaje) and created_at > now() - interval '24 hours') then
    raise exception 'Ya recibimos este mensaje. Te contestamos pronto.' using errcode = 'P0001';
  end if;
  if (select count(*) from contact_messages where lower(correo) = lower(new.correo) and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Ya recibimos varios mensajes de este correo. Intenta de nuevo en una hora.' using errcode = 'P0001';
  end if;
  if (select count(*) from contact_messages where created_at > now() - interval '1 hour') >= 300 then
    raise exception 'Estamos recibiendo muchos mensajes. Intenta de nuevo en un rato.' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- Solo al Director (es quien ve la bandeja de Contacto), uno a la vez mientras tenga uno sin leer de la última hora.
create or replace function notify_contact() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform notify((select coalesce(array_agg(p.id), '{}') from profiles p
                     where p.rol = 'admin'
                       and not exists (select 1 from notifications x where x.user_id = p.id and x.tipo = 'contacto'
                                         and x.read_at is null and x.created_at > now() - interval '1 hour')),
      'contacto', 'Nuevo mensaje de contacto', concat_ws(' · ', new.nombre, new.asunto), '/panel/contacto', null);
  exception when others then null;
  end;
  return new;
end $$;

create or replace function darfy_log(p_pregunta text) returns void
language plpgsql security definer set search_path = public as $$
declare t text := left(btrim(regexp_replace(coalesce(p_pregunta, ''), '\s+', ' ', 'g')), 500);
begin
  if length(t) < 3 then return; end if;
  if (select count(*) from darfy_unanswered where created_at > now() - interval '1 hour') >= 300 then return; end if;
  if exists (select 1 from darfy_unanswered where lower(pregunta) = lower(t) and created_at > now() - interval '1 day') then return; end if;
  insert into darfy_unanswered (pregunta) values (t);
end $$;

-- ════════ 5. Fotos de audiciones ════════
create or replace function audition_upload_ok(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select split_part(p_name, '/', 2) = auth.uid()::text
     and exists (select 1 from auditions a where a.id::text = split_part(p_name, '/', 1) and a.estado = 'abierta')
     and (select count(*) from storage.objects o
           where o.bucket_id = 'audiciones' and o.name like split_part(p_name, '/', 1) || '/' || auth.uid()::text || '/%') < 10
$$;
revoke execute on function audition_upload_ok(text) from public, anon;
grant execute on function audition_upload_ok(text) to authenticated;
drop policy if exists audiciones_own_insert on storage.objects;
create policy audiciones_own_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'audiciones' and audition_upload_ok(name));

-- ════════ 6. Asientos ocupados en una sola fila (sin el tope de 1,000 filas de la API) ════════
create or replace function taken_seats(p_performance uuid) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(s), '{}') from get_taken_seats(p_performance) s
$$;
revoke execute on function taken_seats(uuid) from public;
grant execute on function taken_seats(uuid) to anon, authenticated;

-- ════════ 7. Índices ════════
create index if not exists idx_tickets_seat on tickets(seat_id);
create index if not exists idx_blocked_seats_seat on blocked_seats(seat_id);
create index if not exists idx_orders_seller on orders(seller_id);
create index if not exists idx_audition_applications_user on audition_applications(user_id);
create index if not exists idx_audition_roles_audition on audition_roles(audition_id, orden);
create index if not exists idx_audition_slots_audition on audition_slots(audition_id);
create index if not exists idx_audition_fields_audition on audition_fields(audition_id);
create index if not exists idx_audition_votes_app on audition_votes(application_id);
create index if not exists idx_audition_cast_app on audition_cast(application_id);
create index if not exists idx_member_files_user on member_files(user_id);
create index if not exists idx_member_docs_user on member_docs(user_id, production_id);
create index if not exists idx_member_payments_user on member_payments(user_id);
create index if not exists idx_member_incidents_user on member_incidents(user_id);
create index if not exists idx_member_measures_user on member_measures(user_id);
create index if not exists idx_member_enrollment_user on member_enrollment(user_id);
create index if not exists idx_member_fee_terms_user on member_fee_terms(user_id);
create index if not exists idx_rehearsal_attendance_user on rehearsal_attendance(user_id);
create index if not exists idx_rehearsal_absences_user on rehearsal_absences(user_id);
create index if not exists idx_announcement_reads_user on announcement_reads(user_id);
create index if not exists idx_team_announcement_reads_user on team_announcement_reads(user_id);
create index if not exists idx_anuncio_registros_user on anuncio_registros(user_id);
create index if not exists idx_fan_encuentro_lugares_user on fan_encuentro_lugares(user_id);
create index if not exists idx_evento_ordenes_user on evento_ordenes(user_id);
create index if not exists idx_fan_encuentros_prod on fan_encuentros(production_id);
create index if not exists idx_anuncios_prod on anuncios(production_id);
create index if not exists idx_notifications_prod on notifications(production_id) where production_id is not null;
create index if not exists idx_audit_log_actor on audit_log(actor);
create index if not exists idx_contact_messages_correo on contact_messages(lower(correo), created_at desc);

-- ════════ 8. Por hacer: solicitudes sin revisar también de convocatorias cerradas ════════
CREATE OR REPLACE FUNCTION public.panel_pendientes()
 RETURNS TABLE(tipo text, production_id text, ref_id text, ref_titulo text, n integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare gestiona_aud boolean;
begin
  if auth.uid() is null then raise exception 'No autorizado'; end if;
  gestiona_aud := is_admin() or exists (select 1 from my_panel_access() a where a.permission_id = 'audiciones.gestionar');
  return query
  with mias as (
    select distinct a.production_id as pid from my_panel_access() a
      join productions p on p.id = a.production_id
     where p.estado <> 'archivada'
  )
  -- Solicitudes de audición: una fila por convocatoria (obra, general, registro permanente o equipo propio).
  select 'solicitudes'::text, a.production_id, a.id::text, a.titulo, count(*)::int
    from audition_applications ap join auditions a on a.id = ap.audition_id
   where ap.estado = 'inscrito' and a.estado in ('abierta', 'cerrada')
     and ((a.production_id in (select pid from mias) and has_perm(a.production_id, 'audiciones.gestionar'))
          or (a.production_id is null and not coalesce(a.permanente, false) and is_admin())
          or (coalesce(a.permanente, false) and gestiona_aud)
          or audition_member_perm(a.id, 'audiciones.gestionar'))
   group by a.production_id, a.id, a.titulo
  union all
  select 'ofertas', o.production_id, null, null, count(*)::int from casting_offers o
   where o.estado = 'enviada' and o.production_id in (select pid from mias) and has_perm(o.production_id, 'elenco.gestionar')
   group by o.production_id
  union all
  select 'documentos', d.production_id, null, null, count(*)::int from member_docs d
   where d.subido_at is not null and d.entregado_at is null
     and d.production_id in (select pid from mias) and has_perm(d.production_id, 'expedientes.ver')
   group by d.production_id
  union all
  select 'advertencias', i.production_id, null, null, count(*)::int from member_incidents i
   where i.nivel in ('advertencia', 'grave') and i.anulada_at is null and i.created_at > now() - interval '7 days'
     and i.production_id in (select pid from mias) and has_perm(i.production_id, 'expedientes.ver')
   group by i.production_id
  union all
  -- Personas en el límite de advertencias sin medida tomada (y sin baja).
  select 'decision', m.pid, null, null, (
      select count(*)::int from discipline_summary(m.pid) d
       where d.requiere_decision
         and not exists (select 1 from member_enrollment e where e.production_id = m.pid and e.user_id = d.user_id and e.baja_at is not null))
    from mias m
   where has_perm(m.pid, 'expedientes.ver') and (can_manage_discipline(m.pid) or has_perm(m.pid, 'mensualidades.gestionar'))
  union all
  select 'evaluaciones', r.production_id, null, null, count(*)::int from rubric_periods r
   where r.publicado_at is null and r.hasta is not null and r.hasta < hoy_mx() and rubric_active(r.production_id)
     and r.production_id in (select pid from mias) and has_perm(r.production_id, 'rubrica.gestionar')
   group by r.production_id
  union all
  select 'solicitudes_elenco', q.production_id, null, null, count(*)::int from member_requests q
   where q.estado = 'pendiente' and q.production_id in (select pid from mias) and can_review_request(q.production_id, q.tipo)
   group by q.production_id
  union all
  -- Pagos de eventos por revisar (de la obra o del equipo propio del evento).
  select 'pagos_evento', e.production_id, e.id::text, evento_nombre(e), count(*)::int
    from evento_ordenes o join fan_encuentros e on e.id = o.encuentro_id
   where o.status = 'pendiente' and evento_puede_fila(e.id, e.production_id, 'cobros')
   group by e.production_id, e.id
  union all
  select 'notas_equipo', u.production_id, null, null, u.notas::int from my_team_unread() u where u.notas > 0
  union all
  select 'avisos_equipo', u.production_id, null, null, u.avisos::int from my_team_unread() u where u.avisos > 0;
end $function$

;

-- ════════ 9. Cierre: lo cobrado en taller solo para quien maneja mensualidades o publica la obra ════════
CREATE OR REPLACE FUNCTION public.season_summary(pid text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare out jsonb;
begin
  if not (has_perm(pid, 'obra.publicar') or has_perm(pid, 'reportes.ver')) then raise exception 'No autorizado'; end if;
  with f as (
    select pf.id, pf.starts_at,
           (select coalesce(sum(o.total), 0) from orders o where o.performance_id = pf.id and o.status = 'aprobado') as ingresos,
           (select count(*) from tickets t join orders o on o.id = t.order_id
             where o.performance_id = pf.id and o.status = 'aprobado' and t.is_active) as boletos,
           (select count(*) from tickets t join orders o on o.id = t.order_id
             where o.performance_id = pf.id and o.status = 'aprobado' and t.is_active and t.checked_in_at is not null) as asistieron,
           performance_capacity(pf.id) as capacidad
      from performances pf
     where pf.production_id = pid
  ), o as (
    select count(*) filter (where o.status = 'aprobado') as ordenes,
           count(*) filter (where o.status = 'pendiente') as pendientes,
           coalesce(sum(o.total) filter (where o.status = 'aprobado'), 0) as ingresos,
           coalesce(sum(o.discount_amount) filter (where o.status = 'aprobado'), 0) as descuentos,
           count(*) filter (where o.status = 'aprobado' and o.created_by_staff_id is not null) as taquilla
      from orders o join performances pf on pf.id = o.performance_id where pf.production_id = pid
  )
  select jsonb_build_object(
    'obra', (select nombre from productions where id = pid),
    'generado_at', now(),
    'asientos', (select count(*) from seats where production_id = pid and is_active),
    'capacidad', (select coalesce(sum(capacidad), 0) from f),
    'funciones', coalesce((select jsonb_agg(jsonb_build_object('starts_at', starts_at, 'boletos', boletos, 'asistieron', asistieron, 'ingresos', ingresos, 'capacidad', capacidad) order by starts_at) from f), '[]'),
    'ventas', (select jsonb_build_object('ordenes', ordenes, 'pendientes', pendientes, 'ingresos', ingresos, 'descuentos', descuentos, 'ordenes_taquilla', taquilla,
                                         'boletos', (select coalesce(sum(boletos), 0) from f), 'asistieron', (select coalesce(sum(asistieron), 0) from f)) from o),
    'vendedores', coalesce((select jsonb_agg(x order by (x->>'monto')::numeric desc) from (
        select jsonb_build_object('nombre', coalesce((select nullif(btrim(pr.nombre), '') from profiles pr where pr.id = s.user_id), s.nombre),
                                  'codigo', s.codigo, 'ordenes', count(*), 'monto', sum(o.total)) as x
          from orders o join performances pf on pf.id = o.performance_id join sellers s on s.id = o.seller_id
         where pf.production_id = pid and o.status = 'aprobado'
         group by s.id) v), '[]'),
    'taller', jsonb_build_object(
        'cobrado', case when has_perm(pid, 'mensualidades.gestionar') or has_perm(pid, 'obra.publicar') then (select coalesce(sum(monto), 0) from member_payments where production_id = pid and anulado_at is null) end,
        'integrantes', (select count(*) from production_members where production_id = pid and role_id = 'integrante'),
        'activos', (select count(*) from production_members m where m.production_id = pid and m.role_id = 'integrante' and is_active_member(pid, m.user_id))),
    'ensayos', jsonb_build_object(
        'programados', (select count(*) from rehearsals where production_id = pid and estado = 'programado'),
        'presentes', (select count(*) from rehearsal_attendance a join rehearsals r on r.id = a.rehearsal_id where r.production_id = pid and a.estado in ('presente', 'retardo')),
        'faltas', (select count(*) from rehearsal_attendance a join rehearsals r on r.id = a.rehearsal_id where r.production_id = pid and a.estado = 'falta')),
    'elenco', coalesce((select jsonb_object_agg(tipo, n) from (select tipo, count(*) as n from production_credits where production_id = pid and activo group by tipo) c), '{}'),
    'audiciones', jsonb_build_object(
        'convocatorias', (select count(*) from auditions where production_id = pid),
        'solicitudes', (select count(*) from audition_applications a join auditions au on au.id = a.audition_id where au.production_id = pid))
  ) into out;
  return out;
end $function$

;

-- ════════ 10. Aviso de evento nuevo: la hora salía dos veces y Cada Palabra En Mayúscula ════════
CREATE OR REPLACE FUNCTION public.notify_evento_nuevo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare cuando timestamptz := evento_cuando(new);
begin
  if new.production_id is not null and not production_is_visible(new.production_id) then return new; end if;
  if cuando is null or cuando <= now() then return new; end if;
  perform notify(array(select user_id from fan_members), 'fanzone',
    'Nuevo evento: ' || evento_nombre(new),
    upper(left(cuando_mx(cuando), 1)) || substr(cuando_mx(cuando), 2)
      || case new.tipo when 'en_linea' then ' · en línea' else coalesce(' · ' || new.lugar, '') end
      || case when new.production_id is not null then ' · ' || production_name(new.production_id) else '' end,
    '/eventos', new.production_id);
  return new;
end $function$

;

-- ════════ 11. Buscador del panel: el código de orden sin "DARF-" ════════
CREATE OR REPLACE FUNCTION public.panel_buscar(q text)
 RETURNS TABLE(tipo text, titulo text, detalle text, href text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t text := sin_acentos(btrim(coalesce(q, ''))); cod text := upper(btrim(coalesce(q, ''))); -- 0090: el código sin "DARF-" ("83F2") también encuentra la orden
begin
  if auth.uid() is null then raise exception 'No autorizado'; end if;
  if cod ~ '^[0-9A-F]{4,6}$' then cod := 'DARF-' || cod; end if;
  if char_length(t) < 2 then return; end if;
  return query
  (
    -- Órdenes de boletos por código (DARF-XXXXXX): quien ve las ventas de esa obra.
    select 'orden'::text, o.order_code, coalesce(o.buyer_nombre, '') || ' · ' || pr.nombre || ' · ' || o.status,
           '/panel/producciones/' || pf.production_id || '/boletos?codigo=' || o.order_code
      from orders o join performances pf on pf.id = o.performance_id join productions pr on pr.id = pf.production_id
     where cod ~ '^DARF-' and o.order_code like cod || '%' and has_perm(pf.production_id, 'ventas.ver')
     limit 5
  ) union all (
    -- Órdenes de eventos (EV-XXXXXX): quien cobra en ese evento.
    select 'orden_evento', o.codigo, display_name(o.user_id) || ' · ' || evento_nombre(e) || ' · ' || o.status,
           '/panel/eventos#e-' || e.id
      from evento_ordenes o join fan_encuentros e on e.id = o.encuentro_id
     where cod ~ '^EV-' and o.codigo like cod || '%' and evento_puede_fila(e.id, e.production_id, 'cobros')
     limit 5
  ) union all (
    -- Personas: el Director, todas (su ficha); los demás, las de sus obras con expedientes.
    select 'persona', coalesce(nullif(btrim(p.nombre), ''), u.email::text), u.email::text, '/panel/talento/' || p.id
      from profiles p join auth.users u on u.id = p.id
     where is_admin() and (coincide(p.nombre, t) or lower(u.email) like '%' || t || '%')
     order by p.nombre
     limit 8
  ) union all (
    select distinct on (m.user_id) 'persona', coalesce(nullif(btrim(p.nombre), ''), 'Sin nombre'), pr.nombre,
           '/panel/producciones/' || m.production_id || '/expedientes/' || m.user_id
      from production_members m join profiles p on p.id = m.user_id join productions pr on pr.id = m.production_id
     where not is_admin() and has_perm(m.production_id, 'expedientes.ver') and m.role_id = 'integrante'
       and coincide(p.nombre, t)
     order by m.user_id
     limit 8
  ) union all (
    select 'convocatoria', a.titulo, coalesce(pr.nombre, 'General') || ' · ' || a.estado, '/panel/audiciones/' || a.id
      from auditions a left join productions pr on pr.id = a.production_id
     where coincide(a.titulo, t) and (audition_team(a.id) or (a.production_id is null and is_admin()))
     order by a.created_at desc
     limit 5
  ) union all (
    select 'evento', evento_nombre(e), coalesce(pr.nombre, 'DARF') || ' · ' || to_char(evento_cuando(e) at time zone 'America/Mexico_City', 'DD/MM HH24:MI'),
           '/panel/eventos#e-' || e.id
      from fan_encuentros e left join productions pr on pr.id = e.production_id
     where coincide(evento_nombre(e), t) and evento_puede_fila(e.id, e.production_id, 'ver')
       and evento_fin(e) > now() - interval '30 days'
     order by evento_cuando(e)
     limit 5
  );
end $function$
;

commit;
