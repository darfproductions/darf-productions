-- 0083: una sola credencial por persona y eventos con cobro (Diego 2026-10-12).
--   * Credencial única: cada cuenta tiene UN QR personal (tabla badges, ahora para todos). Se ve
--     según su nivel más alto: equipo/elenco (gafete) > Club Fan (dorada) > cuenta (básica). Si un
--     fan entra al equipo, su credencial sube de nivel sola; los códigos viejos (FAN-XXXX, /f/…)
--     siguen sirviendo. credencial_resolver() acepta cualquier código o liga de la persona.
--   * El equipo y los elencos cuentan como socios del Club Fan (is_fan_member).
--   * Eventos con costo: precio y precio para socios. Al apartar se crea una orden propia
--     (evento_ordenes, código EV-XXXXXX), se paga por transferencia/WhatsApp como los boletos,
--     el lugar se aparta por tiempo limitado y el equipo la aprueba. Vencida o rechazada, se
--     libera el lugar. Las órdenes de eventos van aparte de las de boletos (no se mezclan en
--     reportes de venta ni en el cupo de asientos).
--   * Cupo: vacío = ilimitado; con número = los primeros N.
-- Precede: 0082.

begin;

-- ════════ Credencial única ════════

alter table badges drop constraint badges_codigo_check;
alter table badges add constraint badges_codigo_check check (codigo ~ '^(DRF|FAN)-[2-9A-HJ-NP-Z]{4}$');
alter table fan_members drop constraint fan_members_codigo_check;
alter table fan_members add constraint fan_members_codigo_check check (codigo ~ '^(DRF|FAN)-[2-9A-HJ-NP-Z]{4}$');

-- Códigos únicos entre gafetes y credenciales del club (los FAN-… viejos siguen existiendo).
create or replace function badge_nuevo_codigo() returns text language plpgsql volatile set search_path = public as $$
declare alfabeto text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; c text;
begin
  loop
    c := 'DRF-' || (select string_agg(substr(alfabeto, 1 + floor(random() * length(alfabeto))::int, 1), '') from generate_series(1, 4));
    exit when not exists (select 1 from badges where codigo = c) and not exists (select 1 from fan_members where codigo = c);
  end loop;
  return c;
end $$;

-- Los socios que aún no tenían credencial personal la reciben con su mismo QR y código.
insert into badges (user_id, token, codigo)
select m.user_id, m.token, m.codigo from fan_members m
 where not exists (select 1 from badges b where b.user_id = m.user_id)
on conflict do nothing;

-- Al unirse al club: si ya tiene credencial (equipo o cuenta), el socio usa ese mismo QR.
create or replace function fan_members_credencial() returns trigger
language plpgsql security definer set search_path = public as $$
declare b badges;
begin
  select * into b from badges where user_id = new.user_id;
  if found then
    new.token := coalesce(new.token, b.token);
    new.codigo := coalesce(new.codigo, b.codigo);
  else
    new.token := coalesce(new.token, badge_nuevo_token());
    new.codigo := coalesce(new.codigo, badge_nuevo_codigo());
    insert into badges (user_id, token, codigo) values (new.user_id, new.token, new.codigo) on conflict do nothing;
  end if;
  return new;
end $$;

-- Nivel de la persona: equipo > club > cuenta.
create or replace function credencial_nivel(uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select case when badge_puede(uid) and badge_papel(uid) is not null then 'equipo'
              when exists (select 1 from fan_members where user_id = uid) then 'club'
              else 'cuenta' end
$$;

-- El equipo y los elencos cuentan como socios del club.
create or replace function is_fan_member() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and (exists (select 1 from fan_members where user_id = auth.uid()) or badge_puede(auth.uid()))
$$;

-- Mi credencial (la crea la primera vez para cualquier cuenta).
create or replace function credencial_mia() returns json
language plpgsql security definer set search_path = public as $$
declare b badges; m fan_members; nivel text; papel json;
begin
  if auth.uid() is null then return null; end if;
  select * into b from badges where user_id = auth.uid();
  if not found then
    insert into badges (user_id, token, codigo) values (auth.uid(), badge_nuevo_token(), badge_nuevo_codigo()) returning * into b;
  end if;
  select * into m from fan_members where user_id = auth.uid();
  nivel := credencial_nivel(auth.uid());
  papel := case when nivel = 'equipo' then badge_papel(auth.uid()) end;
  return json_build_object(
    'token', b.token, 'codigo', b.codigo, 'nivel', nivel, 'desde', (select created_at from profiles where id = auth.uid()),
    'franja', papel->>'franja', 'papel', papel->>'papel',
    'socio', case when m.user_id is not null then json_build_object('numero', m.numero, 'desde', m.created_at, 'fundador', m.numero <= 100) end,
    'compartir_telefono', b.compartir_telefono, 'compartir_correo', b.compartir_correo,
    'compartir_instagram', b.compartir_instagram, 'compartir_perfil', b.compartir_perfil);
end $$;
revoke execute on function credencial_mia() from public, anon;
grant execute on function credencial_mia() to authenticated;

-- Credencial nueva: cambia el QR y el código de la persona (y los del club, que son los mismos).
create or replace function badge_regenerar() returns void
language plpgsql security definer set search_path = public as $$
declare t text := badge_nuevo_token(); c text := badge_nuevo_codigo();
begin
  update badges set token = t, codigo = c, updated_at = now() where user_id = auth.uid();
  update fan_members set token = t, codigo = c where user_id = auth.uid();
end $$;
create or replace function fan_regenerar() returns void
language sql security definer set search_path = public as $$ select badge_regenerar() $$;

-- Cualquier código o liga de la persona → su cuenta: /g/<token>, /f/<token>, el token solo,
-- DRF-XXXX o FAN-XXXX.
create or replace function credencial_resolver(p_code text) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare e text := btrim(coalesce(p_code, '')); u uuid;
begin
  if e ~ '/[gf]/' then e := split_part(split_part(regexp_replace(e, '^.*/[gf]/', ''), '?', 1), '#', 1); end if;
  if upper(e) ~ '^(DRF|FAN)-[2-9A-HJ-NP-Z]{4}$' then
    select user_id into u from badges where codigo = upper(e);
    if u is null then select user_id into u from fan_members where codigo = upper(e); end if;
  elsif e ~ '^[0-9a-f]{24,80}$' then
    select user_id into u from badges where token = e;
    if u is null then select user_id into u from fan_members where token = e; end if;
  end if;
  return u;
end $$;
revoke execute on function credencial_resolver(text) from public, anon, authenticated;

-- Lo que ve quien escanea la credencial con su celular, según el nivel. Equipo: como el gafete
-- (0078/0080) más el sello si es socio; club y cuenta: nombre corto, sin contacto.
create or replace function badge_publico(p_token text) returns json
language plpgsql stable security definer set search_path = public as $$
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
  menor := pr.fecha_nacimiento is not null and pr.fecha_nacimiento > (current_date - interval '18 years');
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
end $$;

-- Las ligas /f/ viejas: también reconocen la credencial personal.
create or replace function fan_publico(p_token text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'nombre', btrim(coalesce(nullif(btrim(p.nombres), ''), split_part(btrim(coalesce(p.nombre, '')), ' ', 1)) || ' ' ||
                    coalesce(left(nullif(btrim(coalesce(nullif(btrim(p.apellidos), ''), nullif(split_part(btrim(coalesce(p.nombre, '')), ' ', 2), ''))), ''), 1) || '.', '')),
    'numero', m.numero, 'desde', m.created_at, 'fundador', m.numero <= 100)
    from fan_members m left join profiles p on p.id = m.user_id
   where m.user_id = (select coalesce((select user_id from fan_members where token = p_token), (select user_id from badges where token = p_token)))
$$;

-- Asistencia a ensayos: también con la credencial (cualquier código de la persona).
create or replace function rehearsal_checkin(rid uuid, p_code text) returns json
language plpgsql security definer set search_path = public as $$
declare r rehearsals; pid text; uid uuid; previo rehearsal_attendance; tol int; tarde int; est text; nombre text; foto text;
begin
  select * into r from rehearsals where id = rid;
  if not found then raise exception 'Ese ensayo no existe.'; end if;
  pid := r.production_id;
  if not has_perm(pid, 'ensayos.gestionar') then raise exception 'No tienes permiso para tomar asistencia en esta obra.'; end if;
  if r.estado = 'cancelado' then raise exception 'Este ensayo está cancelado.'; end if;
  uid := credencial_resolver(p_code);
  if uid is null then return json_build_object('resultado', 'no_encontrado'); end if;
  select coalesce(p.nombre, ''), p.foto_path into nombre, foto from profiles p where p.id = uid;
  if not rehearsal_cites(rid, uid) then
    return json_build_object('resultado', 'no_citado', 'user_id', uid, 'nombre', nombre, 'foto_path', foto);
  end if;
  select * into previo from rehearsal_attendance where rehearsal_id = rid and user_id = uid;
  if found and previo.estado in ('presente', 'retardo') then
    return json_build_object('resultado', 'ya', 'user_id', uid, 'nombre', nombre, 'foto_path', foto,
                             'estado', previo.estado, 'minutos', previo.minutos_tarde, 'llegada', coalesce(previo.llegada_at, previo.marcado_at));
  end if;
  select coalesce((select tolerancia_min from production_discipline where production_id = pid), 10) into tol;
  tarde := floor(extract(epoch from (now() - r.inicia)) / 60)::int;
  if tarde > tol then est := 'retardo'; else est := 'presente'; end if;
  insert into rehearsal_attendance (rehearsal_id, user_id, estado, minutos_tarde, nota, marcado_por, marcado_at, llegada_at)
  values (rid, uid, est, case when est = 'retardo' then least(tarde, 600) end, 'Gafete', auth.uid(), now(), now())
  on conflict (rehearsal_id, user_id) do update
    set estado = excluded.estado, minutos_tarde = excluded.minutos_tarde, nota = excluded.nota,
        marcado_por = excluded.marcado_por, marcado_at = excluded.marcado_at, llegada_at = excluded.llegada_at;
  return json_build_object('resultado', est, 'user_id', uid, 'nombre', nombre, 'foto_path', foto,
                           'minutos', case when est = 'retardo' then least(tarde, 600) end, 'llegada', now());
end $$;

-- ════════ Eventos con costo ════════

alter table fan_encuentros
  add column precio numeric(10,2) check (precio is null or precio > 0),
  add column precio_socio numeric(10,2) check (precio_socio is null or precio_socio >= 0),
  add constraint fan_encuentros_pago_ok check (precio is null or requiere_registro),
  add constraint fan_encuentros_precio_socio_ok check (precio_socio is null or (precio is not null and precio_socio <= precio));

create table evento_ordenes (
  id uuid primary key default gen_random_uuid(),
  encuentro_id uuid not null references fan_encuentros(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  codigo text not null unique,
  monto numeric(10,2) not null check (monto >= 0),
  status text not null default 'pendiente' check (status in ('pendiente', 'aprobado', 'rechazado')),
  expires_at timestamptz,
  vencida_at timestamptz,
  aprobada_por uuid references auth.users(id) on delete set null,
  aprobada_at timestamptz,
  rechazada_por uuid references auth.users(id) on delete set null,
  rechazada_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index evento_ordenes_una_viva on evento_ordenes (encuentro_id, user_id) where status in ('pendiente', 'aprobado');
create index evento_ordenes_pendientes on evento_ordenes (expires_at) where status = 'pendiente';
alter table evento_ordenes enable row level security;
create policy evento_ordenes_own on evento_ordenes for select to authenticated using (user_id = auth.uid());
create policy evento_ordenes_editor on evento_ordenes for select to authenticated
  using (exists (select 1 from fan_encuentros e where e.id = encuentro_id and evento_editor(e.production_id)));

create or replace function evento_nuevo_codigo() returns text language plpgsql volatile set search_path = public as $$
declare c text;
begin
  loop
    c := 'EV-' || upper(substr(md5(gen_random_uuid()::text), 1, 6));
    exit when not exists (select 1 from evento_ordenes where codigo = c);
  end loop;
  return c;
end $$;

-- Precio que le toca a quien aparta: el de socio si es socio (o equipo) y hay precio de socio.
create or replace function evento_precio(e fan_encuentros, uid uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select case when e.precio is null then 0
              when e.precio_socio is not null and (exists (select 1 from fan_members where user_id = uid) or badge_puede(uid)) then e.precio_socio
              else e.precio end
$$;

-- ¿Ya pagó (o es gratis)?
create or replace function evento_pagado(eid uuid, uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (select precio from fan_encuentros where id = eid) is null
      or exists (select 1 from evento_ordenes where encuentro_id = eid and user_id = uid and status = 'aprobado')
$$;
revoke execute on function evento_precio(fan_encuentros, uuid), evento_pagado(uuid, uuid), credencial_nivel(uuid) from public, anon, authenticated;

-- Apartar: gratis = lugar; con costo = lugar + orden pendiente que vence (como los boletos).
create or replace function fan_encuentro_apartar(eid uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare e fan_encuentros; usados int; cuando timestamptz; monto numeric; o evento_ordenes;
begin
  if auth.uid() is null then raise exception 'Inicia sesión para apartar tu lugar.'; end if;
  select * into e from fan_encuentros where id = eid for update;
  if not found then raise exception 'Este evento no existe.'; end if;
  if not evento_puede_ver(e) then
    if e.acceso = 'club' then raise exception 'Únete al Club Fan para apartar tu lugar.'; end if;
    raise exception 'Este evento no existe.';
  end if;
  if not p_on then
    select * into o from evento_ordenes where encuentro_id = eid and user_id = auth.uid() and status in ('pendiente', 'aprobado');
    if found and o.status = 'aprobado' and o.monto > 0 then
      raise exception 'Tu lugar ya está pagado. Para cancelarlo, escríbenos.';
    end if;
    update evento_ordenes set status = 'rechazado', rechazada_at = now(), rechazada_por = auth.uid()
     where encuentro_id = eid and user_id = auth.uid() and status = 'pendiente';
    delete from fan_encuentro_lugares where encuentro_id = eid and user_id = auth.uid() and llegada_at is null;
    return;
  end if;
  if not e.requiere_registro then raise exception 'Este evento no necesita registro.'; end if;
  cuando := evento_cuando(e);
  if cuando <= now() then raise exception 'Este evento ya empezó.'; end if;
  if not e.abierto then raise exception 'El registro para este evento está cerrado.'; end if;
  if e.requiere_boleto and e.performance_id is not null
     and not exists (select 1 from orders o2 where o2.performance_id = e.performance_id and o2.buyer_user_id = auth.uid() and o2.status = 'aprobado') then
    raise exception 'Necesitas un boleto aprobado para esta función.';
  end if;
  if exists (select 1 from fan_encuentro_lugares where encuentro_id = eid and user_id = auth.uid()) then return; end if;
  if e.cupo is not null then
    select count(*) into usados from fan_encuentro_lugares where encuentro_id = eid;
    if usados >= e.cupo then raise exception 'Ya no hay lugares para este evento.'; end if;
  end if;
  insert into fan_encuentro_lugares (encuentro_id, user_id) values (eid, auth.uid());
  if e.precio is not null then
    monto := evento_precio(e, auth.uid());
    insert into evento_ordenes (encuentro_id, user_id, codigo, monto, status, expires_at, aprobada_at)
    values (eid, auth.uid(), evento_nuevo_codigo(), monto, case when monto = 0 then 'aprobado' else 'pendiente' end,
            case when monto > 0 then greatest(now() + interval '30 minutes', least(now() + interval '24 hours', cuando - interval '3 hours')) end,
            case when monto = 0 then now() end);
  end if;
end $$;

-- Aprobar o rechazar el pago (quien edita el evento o quien opera ventas en la obra).
create or replace function evento_orden_revisar(oid uuid, p_aprobar boolean) returns void
language plpgsql security definer set search_path = public as $$
declare o evento_ordenes; e fan_encuentros;
begin
  select * into o from evento_ordenes where id = oid for update;
  if not found then raise exception 'Esa orden no existe.'; end if;
  select * into e from fan_encuentros where id = o.encuentro_id;
  if not (evento_editor(e.production_id) or (e.production_id is not null and has_perm(e.production_id, 'ventas.operar'))) then
    raise exception 'No tienes permiso para revisar pagos de este evento.';
  end if;
  if o.status <> 'pendiente' then raise exception 'Esta orden ya fue revisada.'; end if;
  if p_aprobar then
    update evento_ordenes set status = 'aprobado', aprobada_por = auth.uid(), aprobada_at = now() where id = oid;
  else
    update evento_ordenes set status = 'rechazado', rechazada_por = auth.uid(), rechazada_at = now() where id = oid;
    delete from fan_encuentro_lugares where encuentro_id = o.encuentro_id and user_id = o.user_id and llegada_at is null;
  end if;
end $$;
revoke execute on function evento_orden_revisar(uuid, boolean) from public, anon;
grant execute on function evento_orden_revisar(uuid, boolean) to authenticated;

-- Vencer apartados sin pago (cada minuto con pg_cron).
create or replace function expire_evento_ordenes() returns int
language plpgsql security definer set search_path = public as $$
declare o evento_ordenes; n int := 0;
begin
  for o in select * from evento_ordenes where status = 'pendiente' and expires_at <= now() for update skip locked loop
    update evento_ordenes set status = 'rechazado', rechazada_at = now(), vencida_at = now() where id = o.id;
    delete from fan_encuentro_lugares where encuentro_id = o.encuentro_id and user_id = o.user_id and llegada_at is null;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function expire_evento_ordenes() from public, anon, authenticated;

-- Avisos: al equipo cuando hay un pago por revisar; a la persona cuando se aprueba, se rechaza o vence.
create or replace function notify_evento_orden() returns trigger
language plpgsql security definer set search_path = public as $$
declare e fan_encuentros; nombre text;
begin
  select * into e from fan_encuentros where id = new.encuentro_id;
  nombre := evento_nombre(e);
  if tg_op = 'INSERT' and new.status = 'pendiente' then
    perform notify(case when e.production_id is null then admin_ids()
                        else users_with_perm(e.production_id, 'fanzone.editar') || users_with_perm(e.production_id, 'ventas.operar') end,
      'orden', 'Pago de evento por revisar', display_name(new.user_id) || ' apartó ' || nombre || ' (' || pesos_mx(new.monto) || ', ' || new.codigo || ').',
      '/panel/eventos', e.production_id);
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'aprobado' then
      perform notify(array[new.user_id], 'boletos', '¡Tu lugar está confirmado!', nombre || '. Entra con tu credencial.', '/eventos', e.production_id);
    elsif new.status = 'rechazado' and new.vencida_at is not null then
      perform notify(array[new.user_id], 'boletos', 'Tu apartado venció', nombre || ': no recibimos el pago a tiempo y se liberó tu lugar.', '/eventos', e.production_id);
    elsif new.status = 'rechazado' and new.rechazada_por is distinct from new.user_id then
      perform notify(array[new.user_id], 'boletos', 'Tu apartado fue cancelado', nombre || '. Si crees que es un error, escríbenos.', '/eventos', e.production_id);
    end if;
  end if;
  return new;
end $$;
create trigger evento_ordenes_aviso after insert or update of status on evento_ordenes for each row execute function notify_evento_orden();
revoke execute on function notify_evento_orden() from public, anon, authenticated;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'darf_eventos_vencer';
    perform cron.schedule('darf_eventos_vencer', '* * * * *', 'select public.expire_evento_ordenes()');
  end if;
end $$;

-- Lista para quien visita: agrega precio, mi precio y mi orden; la liga en línea pide pago.
drop function fan_encuentros_lista(text);
create function fan_encuentros_lista(pid text default null)
returns table (id uuid, production_id text, obra text, performance_id uuid, tipo text, categoria text, titulo text, descripcion text,
               lugar text, starts_at timestamptz, termina timestamptz, venue text, cupo int, libres int, abierto boolean, notas text,
               requiere_registro boolean, requiere_boleto boolean, acceso text, apartado boolean, con_boleto boolean,
               recordar boolean, en_vivo boolean, liga text, precio numeric, precio_socio numeric, mi_precio numeric,
               orden_codigo text, orden_status text, orden_monto numeric, orden_expira timestamptz, pagado boolean)
language sql stable security definer set search_path = public as $$
  select e.id, e.production_id, pr.nombre, e.performance_id, e.tipo, e.categoria, evento_nombre(e), e.descripcion,
         e.lugar, evento_cuando(e), evento_fin(e), coalesce(e.lugar, pf.venue, pr.venue), e.cupo,
         case when e.cupo is null then null else greatest(0, e.cupo - (select count(*) from fan_encuentro_lugares l where l.encuentro_id = e.id))::int end,
         e.abierto, e.notas, e.requiere_registro, e.requiere_boleto, e.acceso,
         exists (select 1 from fan_encuentro_lugares l where l.encuentro_id = e.id and l.user_id = auth.uid()),
         not e.requiere_boleto or e.performance_id is null
           or exists (select 1 from orders o where o.performance_id = e.performance_id and o.buyer_user_id = auth.uid() and o.status = 'aprobado'),
         exists (select 1 from evento_recordatorios r where r.encuentro_id = e.id and r.user_id = auth.uid()),
         now() between evento_cuando(e) - interval '15 minutes' and evento_fin(e),
         case when e.tipo = 'en_linea' and now() between evento_cuando(e) - interval '15 minutes' and evento_fin(e)
                   and (not e.requiere_registro or exists (select 1 from fan_encuentro_lugares l where l.encuentro_id = e.id and l.user_id = auth.uid()))
                   and (e.precio is null or evento_pagado(e.id, auth.uid()))
              then e.liga end,
         e.precio, e.precio_socio, case when auth.uid() is null then e.precio else nullif(evento_precio(e, auth.uid()), 0) end,
         o.codigo, o.status, o.monto, o.expires_at,
         e.precio is null or o.status = 'aprobado'
    from fan_encuentros e
    left join performances pf on pf.id = e.performance_id
    left join productions pr on pr.id = e.production_id
    left join lateral (select * from evento_ordenes x where x.encuentro_id = e.id and x.user_id = auth.uid() and x.status in ('pendiente', 'aprobado')
                       order by x.created_at desc limit 1) o on true
   where evento_puede_ver(e)
     and evento_fin(e) > now()
     and (pid is null or e.production_id = pid)
   order by evento_cuando(e)
$$;
revoke execute on function fan_encuentros_lista(text) from public;
grant execute on function fan_encuentros_lista(text) to anon, authenticated;

-- Entrar a un evento en línea con costo: solo con el pago aprobado.
create or replace function evento_entrar(eid uuid) returns text
language plpgsql security definer set search_path = public as $$
declare e fan_encuentros;
begin
  select * into e from fan_encuentros where id = eid;
  if not found or e.tipo <> 'en_linea' or not evento_puede_ver(e) then return null; end if;
  if now() not between evento_cuando(e) - interval '15 minutes' and evento_fin(e) then return null; end if;
  if e.requiere_registro and not exists (select 1 from fan_encuentro_lugares where encuentro_id = eid and user_id = auth.uid()) then return null; end if;
  if e.precio is not null and not evento_pagado(eid, auth.uid()) then return null; end if;
  if auth.uid() is not null then
    insert into fan_encuentro_lugares (encuentro_id, user_id, llegada_at) values (eid, auth.uid(), now())
    on conflict (encuentro_id, user_id) do update set llegada_at = coalesce(fan_encuentro_lugares.llegada_at, now());
  end if;
  return e.liga;
end $$;

-- Escaparate: también el precio.
drop function eventos_cartelera(int);
create function eventos_cartelera(p_limite int default 6)
returns table (id uuid, production_id text, obra text, tipo text, categoria text, titulo text, lugar text,
               starts_at timestamptz, termina timestamptz, acceso text, requiere_registro boolean, en_vivo boolean,
               precio numeric, precio_socio numeric)
language sql stable security definer set search_path = public as $$
  select e.id, e.production_id, pr.nombre, e.tipo, e.categoria, evento_nombre(e),
         case when e.tipo = 'en_linea' then null else coalesce(e.lugar, pf.venue, pr.venue) end,
         evento_cuando(e), evento_fin(e), e.acceso, e.requiere_registro,
         now() between evento_cuando(e) - interval '15 minutes' and evento_fin(e),
         e.precio, e.precio_socio
    from fan_encuentros e
    left join performances pf on pf.id = e.performance_id
    left join productions pr on pr.id = e.production_id
   where (e.production_id is null or production_is_visible(e.production_id))
     and evento_fin(e) > now()
   order by evento_cuando(e)
   limit greatest(1, least(coalesce(p_limite, 6), 50))
$$;
revoke execute on function eventos_cartelera(int) from public;
grant execute on function eventos_cartelera(int) to anon, authenticated;

-- Equipo: lista con el estado del pago de cada quien.
drop function fan_encuentro_personas(uuid);
create function fan_encuentro_personas(eid uuid)
returns table (user_id uuid, nombre text, telefono text, numero int, created_at timestamptz, llegada_at timestamptz,
               orden_id uuid, orden_codigo text, orden_status text, orden_monto numeric, orden_expira timestamptz)
language sql stable security definer set search_path = public as $$
  select l.user_id, coalesce(p.nombre, ''), p.telefono, m.numero, l.created_at, l.llegada_at,
         o.id, o.codigo, o.status, o.monto, o.expires_at
    from fan_encuentro_lugares l
    join fan_encuentros e on e.id = l.encuentro_id
    left join profiles p on p.id = l.user_id
    left join fan_members m on m.user_id = l.user_id
    left join lateral (select * from evento_ordenes x where x.encuentro_id = l.encuentro_id and x.user_id = l.user_id and x.status in ('pendiente', 'aprobado')
                       order by x.created_at desc limit 1) o on true
   where l.encuentro_id = eid and (evento_editor(e.production_id) or (e.production_id is not null and (has_perm(e.production_id, 'puerta.validar') or has_perm(e.production_id, 'ventas.operar'))))
   order by l.llegada_at nulls last, l.created_at
$$;
revoke execute on function fan_encuentro_personas(uuid) from public, anon;
grant execute on function fan_encuentro_personas(uuid) to authenticated;

-- Validar en la entrada: cualquier código de la persona; con costo, pide el pago aprobado.
create or replace function fan_checkin(eid uuid, p_code text) returns json
language plpgsql security definer set search_path = public as $$
declare e fan_encuentros; uid uuid; m fan_members; l fan_encuentro_lugares; nombre text; foto text; usados int; base json; nivel text;
begin
  select * into e from fan_encuentros where id = eid for update;
  if not found then raise exception 'Ese evento no existe.'; end if;
  if not (evento_editor(e.production_id) or (e.production_id is not null and has_perm(e.production_id, 'puerta.validar'))) then
    raise exception 'No tienes permiso para validar credenciales en este evento.';
  end if;
  if e.tipo = 'en_linea' then raise exception 'Este evento es en línea: no se valida en una entrada.'; end if;
  uid := credencial_resolver(p_code);
  if uid is null then return json_build_object('resultado', 'no_encontrado'); end if;
  select * into m from fan_members where user_id = uid;
  nivel := credencial_nivel(uid);
  select coalesce(p.nombre, ''), p.foto_path into nombre, foto from profiles p where p.id = uid;
  base := json_build_object('user_id', uid, 'nombre', nombre, 'foto_path', foto, 'numero', m.numero, 'fundador', coalesce(m.numero <= 100, false), 'nivel', nivel);
  select * into l from fan_encuentro_lugares where encuentro_id = eid and user_id = uid;
  if found and l.llegada_at is not null then
    return (base::jsonb || jsonb_build_object('resultado', 'ya', 'llegada', l.llegada_at))::json;
  end if;
  if e.acceso = 'club' and m.user_id is null and nivel <> 'equipo' then
    return (base::jsonb || jsonb_build_object('resultado', 'no_socio'))::json;
  end if;
  if e.requiere_boleto and e.performance_id is not null
     and not exists (select 1 from orders o where o.performance_id = e.performance_id and o.buyer_user_id = uid and o.status = 'aprobado') then
    return (base::jsonb || jsonb_build_object('resultado', 'sin_boleto'))::json;
  end if;
  if l.user_id is null then
    if e.requiere_registro then return (base::jsonb || jsonb_build_object('resultado', 'sin_lugar'))::json; end if;
    if e.cupo is not null then
      select count(*) into usados from fan_encuentro_lugares where encuentro_id = eid;
      if usados >= e.cupo then return (base::jsonb || jsonb_build_object('resultado', 'lleno'))::json; end if;
    end if;
    insert into fan_encuentro_lugares (encuentro_id, user_id, llegada_at, marcado_por) values (eid, uid, now(), auth.uid());
  else
    if e.precio is not null and not evento_pagado(eid, uid) then
      return (base::jsonb || jsonb_build_object('resultado', 'sin_pago'))::json;
    end if;
    update fan_encuentro_lugares set llegada_at = now(), marcado_por = auth.uid() where encuentro_id = eid and user_id = uid;
  end if;
  return (base::jsonb || jsonb_build_object('resultado', 'ok', 'llegada', now()))::json;
end $$;

-- Lo que la persona apartó o pagó (Mi cuenta → Mis eventos).
create or replace function mis_eventos() returns table (id uuid, titulo text, tipo text, obra text, starts_at timestamptz, lugar text,
  orden_codigo text, orden_status text, orden_monto numeric, orden_expira timestamptz, vencida boolean, llegada_at timestamptz)
language sql stable security definer set search_path = public as $$
  select e.id, evento_nombre(e), e.tipo, pr.nombre, evento_cuando(e), case when e.tipo = 'en_linea' then 'En línea' else e.lugar end,
         o.codigo, o.status, o.monto, o.expires_at, o.vencida_at is not null, l.llegada_at
    from fan_encuentros e
    left join productions pr on pr.id = e.production_id
    left join fan_encuentro_lugares l on l.encuentro_id = e.id and l.user_id = auth.uid()
    left join lateral (select * from evento_ordenes x where x.encuentro_id = e.id and x.user_id = auth.uid() order by x.created_at desc limit 1) o on true
   where auth.uid() is not null and (l.user_id is not null or o.id is not null)
   order by evento_cuando(e) desc
$$;
revoke execute on function mis_eventos() from public, anon;
grant execute on function mis_eventos() to authenticated;

commit;
