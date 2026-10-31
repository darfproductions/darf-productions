-- 0131 (Diego 2026-10-28): el día de audiciones "en vivo", sencillo para recepción, host y jueces.
--   * Recepción también puede dar "Siguiente" (antes solo el host). Lo pueden presionar los dos: avanza desde quien
--     está en escena, así que no se salta a nadie.
--   * Cambiar el orden de quienes esperan durante el día: por llegada, por registro o por personaje. Solo se mueven
--     quienes aún no pasan. "Al final": manda a alguien al final de la fila (fue al baño, no está listo).
--   * Terminar audiciones: el host (o quien gestiona) elige ir directo a votación o hacer callbacks. En callbacks
--     palomea a quién llama y elige hoy u otra fecha (con hora y lugar). Los llamados conservan su número y su QR;
--     lo de la ronda 1 (llegada, entrada, salida) se guarda en rondas_previas y la fila se arma de nuevo:
--       - hoy: siguen registrados, solo vuelven a pasar.
--       - otra fecha: vuelven a escanear su mismo QR en la entrada ese día.
--     En la ronda de callback, "Siguiente" solo toma a los llamados.
--   * El QR se manda por correo (Edge Function audition-qr, hermana de team-invite): al inscribirse, un día antes de
--     su horario y al ser llamado a callback en otra fecha (más un recordatorio un día antes). Si la función no está,
--     nada se detiene: sigue el aviso en la app.
-- Precede: 0130.

begin;

alter table auditions add column if not exists callback_cuando text check (callback_cuando in ('hoy', 'otra_fecha'));
alter table auditions add column if not exists callback_fecha timestamptz;
alter table auditions add column if not exists callback_lugar text check (length(callback_lugar) <= 200);

alter table audition_applications add column if not exists rondas_previas jsonb not null default '[]'::jsonb;
alter table audition_applications add column if not exists qr_recordatorio_at timestamptz;
alter table audition_applications add column if not exists qr_cb_recordatorio_at timestamptz;
alter table audition_applications add column if not exists correo_qr_at timestamptz;
alter table audition_applications add column if not exists correo_qr_error text check (length(correo_qr_error) <= 300);

-- Quién mueve la fila el día de la audición: recepción, host o quien gestiona.
create or replace function audition_puede_fila(aid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select audition_perm(aid, 'audiciones.registro') or audition_perm(aid, 'audiciones.entrevista')
      or audition_perm(aid, 'audiciones.gestionar')
$$;
revoke all on function audition_puede_fila(uuid) from public, anon;
grant execute on function audition_puede_fila(uuid) to authenticated;

-- ──────── En escena: ahora también recepción ────────
create or replace function audition_en_escena(aid uuid, app uuid) returns json
language plpgsql security definer set search_path = public as $$
declare v audition_applications; prev uuid; f text;
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
    update audition_applications set finished_at = now(), updated_at = now()
     where id = prev and entered_at is not null and finished_at is null;
  end if;
  if app is not null then
    update audition_applications set entered_at = coalesce(entered_at, now()), entered_by = coalesce(entered_by, auth.uid()),
           finished_at = null, updated_at = now()
     where id = app;
  end if;
  update auditions set en_escena = app, en_escena_at = case when app is null then null else now() end where id = aid;
  return json_build_object('app', app, 'numero', v.numero, 'nombre', v.nombre);
end $$;
revoke all on function audition_en_escena(uuid, uuid) from public, anon;
grant execute on function audition_en_escena(uuid, uuid) to authenticated;

-- El siguiente por número: ya llegó, no ha pasado y no es quien está ahora. En el callback, solo los llamados.
create or replace function audition_siguiente(aid uuid) returns json
language plpgsql security definer set search_path = public as $$
declare cur uuid; cur_num int; nxt uuid; f text;
begin
  if not audition_puede_fila(aid) then raise exception 'No autorizado'; end if;
  -- Bloquea la audición: si recepción y host presionan a la vez, el segundo ve ya al nuevo en escena.
  select en_escena, fase into cur, f from auditions where id = aid for update;
  select numero into cur_num from audition_applications where id = cur;
  select a.id into nxt from audition_applications a
   where a.audition_id = aid and a.checked_in_at is not null and a.finished_at is null
     and a.estado not in ('cancelado', 'no_cumple') and a.id is distinct from cur
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

-- ──────── Llegada: en el callback se conserva el número y solo entran los llamados ────────
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
    select coalesce(max(numero), 0) + 1 into n from audition_applications where audition_id = aid and id <> v.id;
  end if;
  update audition_applications set checked_in_at = now(), checked_in_by = auth.uid(), numero = n, updated_at = now() where id = v.id;
  return json_build_object('result', 'ok', 'nombre', v.nombre, 'numero', n, 'es_menor', v.es_menor,
    'personajes', (select array_agg(ro.nombre order by ro.orden) from audition_roles ro where ro.id = any(v.roles)),
    'callback', au.fase = 'callback');
end $$;
revoke execute on function audition_checkin(uuid, text) from public, anon;
grant execute on function audition_checkin(uuid, text) to authenticated;

-- ──────── Cambiar el orden de quienes esperan ────────
-- Solo quienes aún no pasan (no han entrado) y ya tienen número o ya llegaron. Toman los números siguientes a los de
-- quienes ya pasaron. Quien llegue después recibe el número siguiente (al final).
create or replace function audition_reordenar(aid uuid, p_modo text) returns int
language plpgsql security definer set search_path = public as $$
declare base int; n int; au auditions;
begin
  if not audition_puede_fila(aid) then raise exception 'No autorizado'; end if;
  if p_modo not in ('llegada', 'registro', 'personaje') then raise exception 'Orden no válido.'; end if;
  select * into au from auditions where id = aid for update;
  create temp table _pend on commit drop as
    select a.id, a.numero, a.checked_in_at, a.created_at,
           (select min(ro.orden) from audition_roles ro where ro.id = any(a.roles)) as rol_orden
      from audition_applications a
     where a.audition_id = aid and a.entered_at is null and a.estado not in ('cancelado', 'no_cumple')
       and (a.numero is not null or a.checked_in_at is not null)
       and (au.fase <> 'callback' or a.estado = 'callback');
  update audition_applications set numero = null where id in (select id from _pend);
  select coalesce(max(numero), 0) into base from audition_applications where audition_id = aid;
  update audition_applications x set numero = base + o.rn, updated_at = now()
    from (select id, row_number() over (order by
            case p_modo when 'llegada' then extract(epoch from checked_in_at) end nulls last,
            case p_modo when 'personaje' then rol_orden end nulls last,
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
revoke all on function audition_reordenar(uuid, text) from public, anon;
grant execute on function audition_reordenar(uuid, text) to authenticated;

-- Mandar a alguien al final de la fila (aún no ha pasado).
create or replace function audition_al_final(aid uuid, app uuid) returns int
language plpgsql security definer set search_path = public as $$
declare v audition_applications; n int;
begin
  if not audition_puede_fila(aid) then raise exception 'No autorizado'; end if;
  perform 1 from auditions where id = aid for update;
  select * into v from audition_applications where id = app and audition_id = aid for update;
  if not found then raise exception 'Esa persona no es de esta audición.'; end if;
  if v.entered_at is not null then raise exception 'Ya pasó (o está en escena): no se puede mover.'; end if;
  if v.checked_in_at is null and v.numero is null then raise exception 'Todavía no tiene lugar en la fila.'; end if;
  select coalesce(max(numero), 0) + 1 into n from audition_applications where audition_id = aid;
  if v.numero = n - 1 then return v.numero; end if;   -- ya es el último
  update audition_applications set numero = n, updated_at = now() where id = app;
  return n;
end $$;
revoke all on function audition_al_final(uuid, uuid) from public, anon;
grant execute on function audition_al_final(uuid, uuid) to authenticated;

-- ──────── Correo con el QR (Edge Function audition-qr) ────────
-- Usa la misma configuración que team-invite: misma dirección base (cambia el nombre de la función) y mismo secreto.
-- Nunca detiene nada: si no está configurado o falla, sigue el aviso en la app.
create or replace function _audition_qr_mail(app uuid, motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare cfg invite_config%rowtype; url text;
begin
  begin
    select * into cfg from invite_config where id = 1;
    if cfg.hook_url is null or to_regnamespace('net') is null or position('team-invite' in cfg.hook_url) = 0 then return; end if;
    url := replace(cfg.hook_url, 'team-invite', 'audition-qr');
    execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 5000)'
      using url, jsonb_build_object('id', app, 'motivo', motivo),
            jsonb_build_object('Content-Type', 'application/json', 'x-invite-secret', cfg.hook_secret);
  exception when others then null;
  end;
end $$;
revoke all on function _audition_qr_mail(uuid, text) from public, anon, authenticated;

-- Al inscribirse con cuenta: correo con su QR.
create or replace function audition_applications_qr_mail() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is not null and not new.walk_in and new.checked_in_at is null
     and exists (select 1 from auditions where id = new.audition_id and modalidad <> 'en_linea') then
    perform _audition_qr_mail(new.id, 'inscripcion');
  end if;
  return new;
end $$;
revoke all on function audition_applications_qr_mail() from public, anon, authenticated;
drop trigger if exists audition_applications_qr_mail on audition_applications;
create trigger audition_applications_qr_mail after insert on audition_applications
  for each row execute function audition_applications_qr_mail();

-- Un día antes (cada hora): de su horario, o del primer horario de la convocatoria; y del callback en otra fecha.
create or replace function auditions_recordatorios_qr() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in
    select a.id from audition_applications a join auditions au on au.id = a.audition_id
      left join audition_slots s on s.id = a.slot_id
     where a.user_id is not null and a.checked_in_at is null and a.qr_recordatorio_at is null
       and a.estado not in ('cancelado', 'no_cumple') and au.estado in ('abierta', 'cerrada') and au.modalidad <> 'en_linea'
       and au.fase = 'audicion'
       and coalesce(s.inicia, (select min(x.inicia) from audition_slots x where x.audition_id = au.id and x.inicia > now()))
           between now() and now() + interval '26 hours'
  loop
    update audition_applications set qr_recordatorio_at = now() where id = r.id;
    perform _audition_qr_mail(r.id, 'recordatorio');
    n := n + 1;
  end loop;
  for r in
    select a.id from audition_applications a join auditions au on au.id = a.audition_id
     where a.user_id is not null and a.estado = 'callback' and a.checked_in_at is null and a.qr_cb_recordatorio_at is null
       and au.fase = 'callback' and au.callback_cuando = 'otra_fecha'
       and au.callback_fecha between now() and now() + interval '26 hours'
  loop
    update audition_applications set qr_cb_recordatorio_at = now() where id = r.id;
    perform _audition_qr_mail(r.id, 'recordatorio_callback');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function auditions_recordatorios_qr() from public, anon, authenticated;

do $$ begin if exists (select 1 from pg_extension where extname = 'pg_cron') then
  perform cron.unschedule(jobid) from cron.job where jobname = 'darf_audicion_recordatorio_qr';
  perform cron.schedule('darf_audicion_recordatorio_qr', '7 * * * *', 'select public.auditions_recordatorios_qr()');
end if; end $$;

-- ──────── Terminar audiciones: votación o callbacks ────────
-- El host (audiciones.entrevista) o quien gestiona. Solo convocatorias con personajes (la votación las necesita).
--   p_destino 'votacion': desde la audición (sin callback: se vota con lo de la ronda 1) o al terminar el callback.
--   p_destino 'callback': p_pasan = a quién se llama; p_cuando 'hoy' u 'otra_fecha' (con p_fecha y p_lugar).
create or replace function audition_cerrar_ronda(aid uuid, p_destino text, p_pasan uuid[] default null,
  p_cuando text default null, p_fecha timestamptz default null, p_lugar text default null)
returns text language plpgsql security definer set search_path = public as $$
declare au auditions; n int; titulo text; detalle text;
begin
  if not (audition_perm(aid, 'audiciones.entrevista') or audition_perm(aid, 'audiciones.gestionar')) then
    raise exception 'No autorizado';
  end if;
  select * into au from auditions where id = aid for update;
  if not found then raise exception 'No se encontró la audición.'; end if;
  if au.permanente or not exists (select 1 from audition_roles where audition_id = aid) then
    raise exception 'Esta convocatoria no tiene personajes: agrégalos para usar callbacks y votación.';
  end if;
  -- Quien estaba en escena termina.
  if au.en_escena is not null then perform audition_en_escena(aid, null); end if;

  if p_destino = 'votacion' then
    if au.fase not in ('audicion', 'seleccion_callback', 'callback') then raise exception 'La votación ya empezó.'; end if;
    if au.fase in ('audicion', 'seleccion_callback') then
      -- Sin callback: se vota con las opciones de la ronda 1. Nadie queda "llamado".
      update audition_applications set estado = 'convocado', updated_at = now() where audition_id = aid and estado = 'callback';
      update auditions set con_callback = false, fase = 'votacion' where id = aid;
    else
      update auditions set fase = 'votacion' where id = aid;
    end if;
    insert into audit_log (tabla, accion, production_id, antes, despues)
      values ('auditions', 'cerrar_ronda', au.production_id, jsonb_build_object('fase', au.fase), jsonb_build_object('fase', 'votacion'));
    return 'votacion';
  end if;

  if p_destino <> 'callback' then raise exception 'Destino no válido.'; end if;
  if au.fase not in ('audicion', 'seleccion_callback') then raise exception 'El callback ya se abrió.'; end if;
  if coalesce(cardinality(p_pasan), 0) = 0 then raise exception 'Palomea al menos a una persona para el callback.'; end if;
  if p_cuando not in ('hoy', 'otra_fecha') then raise exception 'Elige si el callback es hoy o en otra fecha.'; end if;
  if p_cuando = 'otra_fecha' and (p_fecha is null or p_fecha < now()) then raise exception 'Pon la fecha y hora del callback.'; end if;
  if (select count(*) from audition_applications where id = any(p_pasan) and audition_id = aid and estado not in ('cancelado', 'no_cumple'))
     <> cardinality(p_pasan) then
    raise exception 'Alguna de las personas no es de esta audición.';
  end if;

  update audition_applications set estado = 'convocado', updated_at = now() where audition_id = aid and estado = 'callback' and not (id = any(p_pasan));
  -- Lo de la ronda 1 se guarda; la fila del callback empieza limpia (mismo número, mismo QR).
  update audition_applications
     set estado = 'callback', ronda = greatest(ronda, 2),
         rondas_previas = rondas_previas || jsonb_build_array(jsonb_build_object('ronda', 1, 'numero', numero,
           'checked_in_at', checked_in_at, 'entered_at', entered_at, 'finished_at', finished_at)),
         entered_at = null, entered_by = null, finished_at = null,
         checked_in_at = case when p_cuando = 'otra_fecha' then null else checked_in_at end,
         checked_in_by = case when p_cuando = 'otra_fecha' then null else checked_in_by end,
         qr_cb_recordatorio_at = null, updated_at = now()
   where id = any(p_pasan);
  get diagnostics n = row_count;
  insert into audition_picks (application_id, judge_id, ronda, opcion, role_id, ensamble)
  select application_id, judge_id, 2, opcion, role_id, ensamble from audition_picks
   where application_id = any(p_pasan) and ronda = 1
  on conflict do nothing;
  update auditions set con_callback = true, fase = 'callback', callback_cuando = p_cuando,
         callback_fecha = case when p_cuando = 'otra_fecha' then p_fecha end,
         callback_lugar = case when p_cuando = 'otra_fecha' then nullif(btrim(coalesce(p_lugar, '')), '') end
   where id = aid;

  titulo := '¡Pasaste a callback!';
  detalle := concat_ws(' · ', au.titulo, production_name(au.production_id),
    case when p_cuando = 'hoy' then 'Es hoy: quédate cerca, te llamamos.'
         else 'Es el ' || to_char(p_fecha at time zone 'America/Mexico_City', 'DD/MM/YYYY "a las" HH24:MI')
              || coalesce(' en ' || nullif(btrim(coalesce(p_lugar, '')), ''), '') || '. Lleva tu mismo QR.' end);
  begin
    perform notify((select array_agg(user_id) from audition_applications where id = any(p_pasan) and user_id is not null),
      'audicion', titulo, detalle, '/audiciones/' || aid, au.production_id);
  exception when others then null;
  end;
  if p_cuando = 'otra_fecha' then
    perform _audition_qr_mail(x, 'callback') from unnest(p_pasan) x;
  end if;
  insert into audit_log (tabla, accion, production_id, antes, despues)
    values ('auditions', 'cerrar_ronda', au.production_id, jsonb_build_object('fase', au.fase),
            jsonb_build_object('fase', 'callback', 'cuando', p_cuando, 'fecha', p_fecha, 'lugar', p_lugar, 'llamados', n));
  return 'callback';
end $$;
revoke all on function audition_cerrar_ronda(uuid, text, uuid[], text, timestamptz, text) from public, anon;
grant execute on function audition_cerrar_ronda(uuid, text, uuid[], text, timestamptz, text) to authenticated;

-- Para el host: lo que necesita para decidir (por personaje, cuántas marcas de los jueces y el promedio).
create or replace function audition_cierre_datos(aid uuid) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not (audition_perm(aid, 'audiciones.entrevista') or audition_perm(aid, 'audiciones.gestionar')) then
    raise exception 'No autorizado';
  end if;
  return json_build_object(
    'personajes', coalesce((select json_agg(json_build_object('id', r.id, 'nombre', r.nombre) order by r.orden)
                              from audition_roles r where r.audition_id = aid), '[]'::json),
    'personas', coalesce((select json_agg(p order by p.numero nulls last, p.nombre) from (
        select a.id, a.numero, a.nombre, a.estado, a.roles,
               (a.entered_at is not null or jsonb_array_length(a.rondas_previas) > 0) as paso,
               (select round(avg(e.value::numeric), 1) from audition_scores s cross join jsonb_each_text(s.puntos) e
                 where s.application_id = a.id and s.ronda = 1 and e.value ~ '^[0-9]+(\.[0-9]+)?$') as promedio,
               coalesce((select json_object_agg(coalesce(k.role_id::text, 'ensamble'), k.n) from (
                  select role_id, count(*) as n from audition_picks
                   where application_id = a.id and ronda = 1 group by role_id) k), '{}'::json) as marcas
          from audition_applications a
         where a.audition_id = aid and a.estado not in ('cancelado', 'no_cumple')
           and (a.checked_in_at is not null or a.estado = 'callback' or jsonb_array_length(a.rondas_previas) > 0)) p), '[]'::json));
end $$;
revoke all on function audition_cierre_datos(uuid) from public, anon;
grant execute on function audition_cierre_datos(uuid) to authenticated;

commit;
