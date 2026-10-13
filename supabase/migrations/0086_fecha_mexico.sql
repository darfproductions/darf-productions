-- 0086: "hoy" es la fecha de México (Diego 2026-10-13). Varias funciones usaban current_date, que es
-- la fecha en UTC: entre las 18:00 y las 24:00 de Ciudad de México ya es "mañana". Así, una baja
-- hecha en la tarde-noche no se aplicaba hasta el día siguiente, los meses vencidos de mensualidades
-- y los periodos de evaluación se contaban con un día de diferencia, y la edad (menor de edad) podía
-- cambiar un día antes. is_active_member (0070) ya usaba la fecha de México; ahora todo igual.
-- Precede: 0085. Solo cambia current_date por hoy_mx(); el resto de cada función queda igual.

begin;

create or replace function hoy_mx() returns date language sql stable as $$
  select (now() at time zone 'America/Mexico_City')::date
$$;

alter table member_enrollment alter column ingreso set default hoy_mx();
alter table member_incidents alter column fecha set default hoy_mx();
alter table member_measures alter column fecha set default hoy_mx();
alter table profiles drop constraint profiles_fecha_nacimiento_check;
alter table profiles add constraint profiles_fecha_nacimiento_check check (fecha_nacimiento >= '1900-01-01' and fecha_nacimiento <= hoy_mx());

CREATE OR REPLACE FUNCTION public.audition_age(aid uuid, nacimiento date)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select date_part('year', age(coalesce((select min(inicia) from audition_slots where audition_id = aid)::date, hoy_mx()), nacimiento))::int
$function$
;

CREATE OR REPLACE FUNCTION public.badge_publico(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare b badges; pr profiles; persona people; pro pro_profiles; papel json; menor boolean; correo text; m fan_members; nivel text; corto text;
begin
  select * into b from badges where token = p_token;
  if not found then return null; end if;
  select * into pr from profiles where id = b.user_id;
  select * into m from fan_members where user_id = b.user_id;
  nivel := credencial_nivel(b.user_id);
  corto := btrim(coalesce(nullif(btrim(pr.nombres), ''), split_part(btrim(coalesce(pr.nombre, '')), ' ', 1)) || ' ' ||
           coalesce(left(nullif(btrim(coalesce(nullif(btrim(pr.apellidos), ''), nullif(split_part(btrim(coalesce(pr.nombre, '')), ' ', 2), ''))), ''), 1) || '.', ''));
  if nivel <> 'equipo' then
    return json_build_object('nivel', nivel, 'nombre', corto,
      'socio', case when m.user_id is not null then json_build_object('numero', m.numero, 'desde', m.created_at, 'fundador', m.numero <= 100) end);
  end if;
  papel := badge_papel(b.user_id);
  select * into persona from people where profile_id = b.user_id;
  if persona.id is not null then select * into pro from pro_profiles where person_id = persona.id; end if;
  menor := pr.fecha_nacimiento is not null and pr.fecha_nacimiento > (hoy_mx() - interval '18 years');
  select email into correo from auth.users where id = b.user_id;
  return json_build_object(
    'nivel', 'equipo', 'nombre', coalesce(pr.nombre, persona.nombre, ''),
    'franja', papel->>'franja', 'papel', papel->>'papel',
    'socio', case when m.user_id is not null then json_build_object('numero', m.numero, 'desde', m.created_at, 'fundador', m.numero <= 100) end,
    'retrato_path', case when pro.person_id is not null and pro_is_public(pro.person_id) then pro.retrato_path end,
    'telefono', case when b.compartir_telefono and not menor then pr.telefono end,
    'correo', case when b.compartir_correo and not menor then correo end,
    'instagram', case when b.compartir_instagram then pro.instagram end,
    'perfil', case when b.compartir_perfil and pro.person_id is not null and pro_is_public(pro.person_id) then pro.slug end);
end $function$
;

CREATE OR REPLACE FUNCTION public.discipline_scan_fees(pid text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.member_enrollment_on_join()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.role_id = 'integrante' then
    insert into member_enrollment (production_id, user_id, ingreso) values (new.production_id, new.user_id, hoy_mx())
    on conflict do nothing;
  end if;
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.member_withdraw(pid text, uid uuid, fecha date, motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not can_manage_enrollment(pid) then raise exception 'No autorizado'; end if;
  if coalesce(btrim(motivo), '') = '' then raise exception 'Escribe el motivo de la baja.'; end if;
  update member_enrollment set baja_at = coalesce(fecha, hoy_mx()), baja_motivo = btrim(motivo), baja_por = auth.uid()
   where production_id = pid and user_id = uid;
  if not found then raise exception 'Esa persona no es integrante de la obra.'; end if;
  update production_credits c set activo = false
    from people pe where pe.id = c.person_id and pe.profile_id = uid and c.production_id = pid;
end $function$
;

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
   where ap.estado = 'inscrito' and a.estado = 'abierta'
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

CREATE OR REPLACE FUNCTION public.person_is_minor(pid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select pr.fecha_nacimiento > (hoy_mx() - interval '18 years')::date
                     from people pe join profiles pr on pr.id = pe.profile_id where pe.id = pid), false)
$function$
;

CREATE OR REPLACE FUNCTION public.season_close(pid text, notas_ text, dar_baja boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n int; bajas_ int := 0; cid uuid;
begin
  if not has_perm(pid, 'obra.publicar') then raise exception 'No autorizado'; end if;
  if (select estado from productions where id = pid) = 'archivada' then raise exception 'La temporada ya está cerrada.'; end if;
  select count(*) into n from orders o join performances pf on pf.id = o.performance_id
   where pf.production_id = pid and o.status = 'pendiente';
  if n > 0 then raise exception 'Hay % órdenes por aprobar. Apruébalas o recházalas antes de cerrar.', n; end if;

  update performances set on_sale = false where production_id = pid and on_sale;

  if dar_baja then
    insert into member_enrollment (production_id, user_id, ingreso)
    select m.production_id, m.user_id, hoy_mx() from production_members m
     where m.production_id = pid and m.role_id = 'integrante'
    on conflict (production_id, user_id) do nothing;
    update member_enrollment set baja_at = greatest(hoy_mx(), ingreso), baja_motivo = 'Fin de temporada', baja_por = auth.uid()
     where production_id = pid and (baja_at is null or baja_at > hoy_mx());
    get diagnostics bajas_ = row_count;
  end if;

  insert into season_closures (production_id, notas, bajas, resumen)
  values (pid, nullif(btrim(coalesce(notas_, '')), ''), bajas_, season_summary(pid))
  returning id into cid;

  update productions set estado = 'archivada' where id = pid;
  return cid;
end $function$
;

commit;
