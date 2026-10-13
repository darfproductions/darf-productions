-- 0079: pagos con recibo (Diego 2026-10-12).
--   * Cada pago lleva folio consecutivo por año (DARF-2026-0001), también los que ya existían.
--   * "Quitar pago" pasa a ANULAR: el pago y su folio quedan en el historial, con quién, cuándo
--     y por qué; el recibo dice ANULADO y ya no cuenta en adeudos ni en lo cobrado. Solo se puede
--     borrar en los primeros 10 minutos (por si fue un error al capturar).
--   * Al registrar un pago (a mano o al aprobar un comprobante) se avisa al integrante con la liga
--     a su recibo; también si se anula.
--   * Recordatorios diarios (pg_cron): 3 días antes del día límite si no ha pagado el mes y otra
--     vez al día siguiente del límite si sigue debiendo. Uno de cada uno por mes y por persona.
--     Respeta becas, mensualidades especiales, ingreso tardío y bajas.
--   * Lo cobrado en el cierre de temporada y en el resumen del Director no cuenta los anulados.
-- Precede: 0078. No borra datos.

begin;

alter table member_payments
  add column folio text unique,
  add column anulado_at timestamptz,
  add column anulado_por uuid references auth.users(id) on delete set null,
  add column motivo_anulacion text check (motivo_anulacion is null or char_length(motivo_anulacion) <= 300);

-- ──────── Folio ────────
create table payment_folios (anio int primary key, ultimo int not null default 0);
alter table payment_folios enable row level security;
revoke all on payment_folios from anon, authenticated;

create or replace function payment_folio_next(ts timestamptz) returns text
language plpgsql security definer set search_path = public as $$
declare a int := extract(year from (ts at time zone 'America/Mexico_City'))::int; n int;
begin
  insert into payment_folios (anio, ultimo) values (a, 1)
  on conflict (anio) do update set ultimo = payment_folios.ultimo + 1
  returning ultimo into n;
  return format('DARF-%s-%s', a, case when n < 10000 then lpad(n::text, 4, '0') else n::text end);
end $$;

-- Los pagos que ya existían reciben folio en el orden en que se registraron (sin llenar la Bitácora).
alter table member_payments disable trigger audit_member_payments;
do $$ declare r record; begin
  for r in select id, registrado_at from member_payments order by registrado_at, id loop
    update member_payments set folio = payment_folio_next(r.registrado_at) where id = r.id;
  end loop;
end $$;
alter table member_payments enable trigger audit_member_payments;

create or replace function member_payments_folio() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.folio := payment_folio_next(coalesce(new.registrado_at, now()));
  new.anulado_at := null; new.anulado_por := null; new.motivo_anulacion := null;
  return new;
end $$;
create trigger member_payments_folio before insert on member_payments for each row execute function member_payments_folio();
alter table member_payments alter column folio set not null;

-- ──────── Permisos: registrar, ver y borrar solo recién capturado; anular con payment_annul ────────
drop policy member_payments_team on member_payments;
create policy member_payments_team_read on member_payments for select to authenticated
  using (has_perm(production_id, 'mensualidades.gestionar'));
create policy member_payments_team_insert on member_payments for insert to authenticated
  with check (has_perm(production_id, 'mensualidades.gestionar'));
create policy member_payments_team_delete on member_payments for delete to authenticated
  using (has_perm(production_id, 'mensualidades.gestionar') and registrado_at > now() - interval '10 minutes');

-- ──────── Textos ────────
create or replace function mes_es(d date) returns text language sql immutable as $$
  select (array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'])[extract(month from d)::int]
         || ' ' || extract(year from d)::int
$$;
create or replace function pesos_mx(n numeric) returns text language sql immutable as $$
  select '$' || case when n = trunc(n) then to_char(n, 'FM999,999,990') else to_char(n, 'FM999,999,990.00') end
$$;
create or replace function pago_concepto(p_concepto text, p_periodo date) returns text language sql immutable as $$
  select case when p_concepto = 'inscripcion' then 'inscripción' else 'mensualidad de ' || mes_es(p_periodo) end
$$;

-- ──────── Aviso al integrante ────────
create or replace function notify_pago() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform notify(array[new.user_id], 'pago',
    'Recibo ' || new.folio || ': ' || pago_concepto(new.concepto, new.periodo) || ', ' || pesos_mx(new.monto),
    production_name(new.production_id) || '. Puedes descargar tu recibo en Mis pagos.',
    '/cuenta/produccion/' || new.production_id || '#cuotas', new.production_id);
  return new;
end $$;
create trigger member_payments_notify after insert on member_payments for each row execute function notify_pago();

-- ──────── Anular ────────
create or replace function payment_annul(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare p member_payments; m text := left(nullif(btrim(coalesce(p_motivo, '')), ''), 300);
begin
  select * into p from member_payments where id = p_id for update;
  if not found then raise exception 'Ese pago no existe.'; end if;
  if not has_perm(p.production_id, 'mensualidades.gestionar') then raise exception 'No tienes permiso para anular pagos en esta obra.'; end if;
  if p.anulado_at is not null then raise exception 'Este pago ya estaba anulado.'; end if;
  if m is null then raise exception 'Escribe por qué se anula.'; end if;
  update member_payments set anulado_at = now(), anulado_por = auth.uid(), motivo_anulacion = m where id = p_id;
  perform notify(array[p.user_id], 'pago', 'Recibo ' || p.folio || ' anulado',
    pago_concepto(p.concepto, p.periodo) || ', ' || pesos_mx(p.monto) || '. Motivo: ' || m,
    '/cuenta/produccion/' || p.production_id || '#cuotas', p.production_id);
end $$;
revoke execute on function payment_annul(uuid, text) from public, anon;
grant execute on function payment_annul(uuid, text) to authenticated;

-- ──────── Recibo (para el PDF y WhatsApp): la persona o quien maneja pagos ────────
create or replace function payment_receipt(p_id uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare p member_payments; equipo boolean;
begin
  select * into p from member_payments where id = p_id;
  if not found then return null; end if;
  equipo := has_perm(p.production_id, 'mensualidades.gestionar');
  if not (p.user_id = auth.uid() or equipo) then return null; end if;
  return json_build_object(
    'id', p.id, 'folio', p.folio, 'production_id', p.production_id, 'obra', production_name(p.production_id),
    'user_id', p.user_id, 'nombre', coalesce((select nullif(btrim(pe.nombre), '') from people pe where pe.profile_id = p.user_id limit 1), display_name(p.user_id)),
    'concepto', p.concepto, 'periodo', p.periodo, 'monto', p.monto, 'metodo', p.metodo, 'nota', p.nota,
    'registrado_at', p.registrado_at, 'registrado_por', case when p.registrado_por is not null then display_name(p.registrado_por) end,
    'anulado_at', p.anulado_at, 'motivo_anulacion', p.motivo_anulacion,
    'telefono', case when equipo then coalesce((select nullif(btrim(telefono), '') from person_files where user_id = p.user_id),
                                              (select nullif(btrim(telefono), '') from profiles where id = p.user_id)) end);
end $$;
revoke execute on function payment_receipt(uuid) from public, anon;
grant execute on function payment_receipt(uuid) to authenticated;

-- ──────── Recordatorios ────────
create table payment_reminders (
  production_id text not null references productions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  periodo date not null,
  tipo text not null check (tipo in ('antes', 'despues')),
  sent_at timestamptz not null default now(),
  primary key (production_id, user_id, periodo, tipo)
);
alter table payment_reminders enable row level security;
revoke all on payment_reminders from anon, authenticated;

-- p_hoy solo para las pruebas; el cron la llama sin parámetros (fecha de CDMX).
create or replace function notify_pagos(p_hoy date default null) returns int
language plpgsql security definer set search_path = public as $$
declare
  hoy date := coalesce(p_hoy, (now() at time zone 'America/Mexico_City')::date);
  v_mes date := date_trunc('month', hoy)::date;
  f production_fees; r record; limite date; v_tipo text; v_pagado numeric; n int := 0;
begin
  for f in select * from production_fees pf where pf.cobrar and pf.monto > 0 and v_mes between date_trunc('month', pf.desde) and date_trunc('month', pf.hasta) loop
    limite := v_mes + (f.dia_limite - 1);
    if hoy between limite - 3 and limite - 1 then v_tipo := 'antes';
    elsif hoy between limite + 1 and limite + 3 then v_tipo := 'despues';
    else continue;
    end if;
    for r in
      select m.user_id, coalesce(t.cuota_especial, f.monto) as debe
        from production_members m
        left join member_fee_terms t on t.production_id = m.production_id and t.user_id = m.user_id
        left join member_enrollment e on e.production_id = m.production_id and e.user_id = m.user_id
       where m.production_id = f.production_id and m.role_id = 'integrante'
         and not coalesce(t.beca, false)
         and (e.ingreso is null or date_trunc('month', e.ingreso) <= v_mes)
         and (e.baja_at is null or e.baja_at > hoy)
    loop
      continue when r.debe <= 0;
      select coalesce(sum(p.monto), 0) into v_pagado from member_payments p
       where p.production_id = f.production_id and p.user_id = r.user_id and p.concepto = 'mensualidad'
         and p.periodo = v_mes and p.anulado_at is null;
      continue when v_pagado >= r.debe;
      insert into payment_reminders (production_id, user_id, periodo, tipo) values (f.production_id, r.user_id, v_mes, v_tipo)
      on conflict do nothing;
      if found then
        if v_tipo = 'antes' then
          perform notify(array[r.user_id], 'pago', 'Tu mensualidad de ' || mes_es(v_mes) || ' vence el ' || extract(day from limite)::int,
            production_name(f.production_id) || ' · ' || pesos_mx(r.debe - v_pagado) || '. Si ya pagaste, manda tu comprobante en Solicitudes.',
            '/cuenta/produccion/' || f.production_id || '#cuotas', f.production_id);
        else
          perform notify(array[r.user_id], 'pago', 'Tu mensualidad de ' || mes_es(v_mes) || ' está vencida',
            production_name(f.production_id) || ' · debes ' || pesos_mx(r.debe - v_pagado) || '. Si ya pagaste, manda tu comprobante en Solicitudes.',
            '/cuenta/produccion/' || f.production_id || '#cuotas', f.production_id);
        end if;
        n := n + 1;
      end if;
    end loop;
  end loop;
  return n;
end $$;
revoke execute on function notify_pagos(date), payment_folio_next(timestamptz), member_payments_folio(), notify_pago() from public, anon, authenticated;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'darf_pagos';
    perform cron.schedule('darf_pagos', '0 16 * * *', 'select public.notify_pagos()');
  end if;
end $$;

-- ──────── Avisos al teléfono: tipo nuevo "pago" ────────
create or replace function push_set_off(p_tipos text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Necesitas iniciar sesión'; end if;
  insert into push_prefs (user_id, apagados)
  values (auth.uid(), coalesce((select array_agg(distinct t) from unnest(p_tipos) t
                                 where t in ('contacto', 'audicion', 'orden', 'oferta', 'documento', 'ausencia', 'solicitud', 'boletos', 'equipo', 'cambio', 'prueba', 'anuncio', 'fanzone', 'pago')), '{}'))
  on conflict (user_id) do update set apagados = excluded.apagados;
end $$;

-- ──────── Lo cobrado y las advertencias ya no cuentan pagos anulados ────────
create or replace function discipline_scan_fees(pid text) returns int
language plpgsql security definer set search_path = public as $$
declare
  cfg production_discipline%rowtype; f production_fees%rowtype; r record; vencidos int; n int; hechas int := 0;
begin
  if not (can_manage_discipline(pid) or has_perm(pid, 'mensualidades.gestionar')) then raise exception 'No autorizado'; end if;
  select * into f from production_fees where production_id = pid;
  if not found or not f.cobrar or f.monto <= 0 then return 0; end if;
  select * into cfg from production_discipline where production_id = pid;
  if not found then cfg.auto_mensualidad_meses := 2; end if;
  if cfg.auto_mensualidad_meses is null then return 0; end if;
  for r in
    select m.user_id, coalesce(t.beca, false) as beca, coalesce(t.cuota_especial, f.monto) as debe,
           greatest(f.desde, date_trunc('month', coalesce(e.ingreso, f.desde))::date) as desde,
           least(f.hasta, coalesce(date_trunc('month', e.baja_at - 1)::date, f.hasta), date_trunc('month', current_date)::date) as hasta
      from production_members m
      left join member_fee_terms t on t.production_id = pid and t.user_id = m.user_id
      left join member_enrollment e on e.production_id = pid and e.user_id = m.user_id
     where m.production_id = pid and m.role_id = 'integrante'
  loop
    continue when r.beca or r.debe <= 0 or r.hasta < r.desde;
    select count(*) into vencidos
      from generate_series(r.desde, r.hasta, interval '1 month') g(periodo)
     where (g.periodo::date + (f.dia_limite - 1)) < current_date
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

create or replace function season_summary(pid text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
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
        'cobrado', (select coalesce(sum(monto), 0) from member_payments where production_id = pid and anulado_at is null),
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
end $$;

create or replace function director_overview()
returns table (production_id text, nombre text, estado text, funciones int, funciones_futuras int, asientos int,
               boletos int, asistieron int, ingresos numeric, pendientes int, cobrado_taller numeric,
               integrantes_activos int, solicitudes int, cerrado_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo el Director.'; end if;
  return query
    select p.id, p.nombre, p.estado,
           (select count(*)::int from performances f where f.production_id = p.id),
           (select count(*)::int from performances f where f.production_id = p.id and f.starts_at > now()),
           (select count(*)::int from seats s where s.production_id = p.id and s.is_active),
           (select count(*)::int from tickets t join orders o on o.id = t.order_id join performances f on f.id = o.performance_id
             where f.production_id = p.id and o.status = 'aprobado' and t.is_active),
           (select count(*)::int from tickets t join orders o on o.id = t.order_id join performances f on f.id = o.performance_id
             where f.production_id = p.id and o.status = 'aprobado' and t.is_active and t.checked_in_at is not null),
           (select coalesce(sum(o.total), 0) from orders o join performances f on f.id = o.performance_id
             where f.production_id = p.id and o.status = 'aprobado'),
           (select count(*)::int from orders o join performances f on f.id = o.performance_id
             where f.production_id = p.id and o.status = 'pendiente'),
           (select coalesce(sum(mp.monto), 0) from member_payments mp where mp.production_id = p.id and mp.anulado_at is null),
           (select count(*)::int from production_members m where m.production_id = p.id and m.role_id = 'integrante' and is_active_member(p.id, m.user_id)),
           (select count(*)::int from audition_applications a join auditions au on au.id = a.audition_id where au.production_id = p.id),
           (select max(c.cerrado_at) from season_closures c where c.production_id = p.id and c.reabierto_at is null)
      from productions p
     order by p.created_at desc;
end $$;

commit;
