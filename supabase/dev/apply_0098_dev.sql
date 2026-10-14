-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV" (la base oficial de la 2.0).
-- 0098: Apple Wallet se actualiza solo (boletos y credencial). Requiere 0097.
-- Si la base no es DEV, aborta. Se corre completa en Supabase → SQL Editor.
-- Al final deja la dirección del aviso en https://www.darfproductions.com/wallet/apple/aviso.
-- Después: copiar el secreto (select hook_secret from wallet_config;) a Vercel → WALLET_HOOK_SECRET.
begin;
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
end $$;

-- ════════ Tablas ════════
create table if not exists wallet_pases (
  serial text primary key check (serial ~ '^(boleto-[0-9a-f-]{36}|cred-[0-9a-f]{24})$'),
  tipo text not null check (tipo in ('boleto', 'credencial')),
  ticket_id uuid references tickets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  auth_token text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  creado_at timestamptz not null default now(),
  cambiado_at timestamptz not null default now(),
  check ((tipo = 'boleto') = (ticket_id is not null))
);
create index if not exists wallet_pases_ticket on wallet_pases (ticket_id) where ticket_id is not null;
create index if not exists wallet_pases_user on wallet_pases (user_id);

create table if not exists wallet_registros (
  device_id text not null check (device_id ~ '^[A-Za-z0-9._-]{1,128}$'),
  serial text not null references wallet_pases(serial) on delete cascade,
  push_token text not null check (push_token ~ '^[A-Za-z0-9]{1,200}$'),
  creado_at timestamptz not null default now(),
  primary key (device_id, serial)
);
create index if not exists wallet_registros_serial on wallet_registros (serial);
create index if not exists wallet_registros_push on wallet_registros (push_token);

-- Dirección del aviso (null = no se avisa; los pases siguen sirviendo, solo no se actualizan solos).
create table if not exists wallet_config (
  id int primary key default 1 check (id = 1),
  hook_url text check (hook_url is null or hook_url like 'https://%'),
  hook_secret text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
);
insert into wallet_config (id) values (1) on conflict do nothing;

alter table wallet_pases enable row level security;
alter table wallet_registros enable row level security;
alter table wallet_config enable row level security;
revoke all on wallet_pases, wallet_registros, wallet_config from anon, authenticated;

-- Serial de la credencial: igual que serialCredencial() en web/src/lib/wallet-pases.ts.
create or replace function wallet_serial_cred(uid uuid) returns text
language sql immutable set search_path = public as $$
  select 'cred-' || left(encode(sha256(convert_to('darf-credencial:' || uid::text, 'UTF8')), 'hex'), 24)
$$;

-- ════════ Credencial de cualquier cuenta (sin crearla) ════════
-- credencial_mia() la crea la primera vez y devuelve esto mismo para quien tiene sesión.
create or replace function credencial_de(uid uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare b badges; m fan_members; nivel text; papel json;
begin
  select * into b from badges where user_id = uid;
  if not found then return null; end if;
  select * into m from fan_members where user_id = uid;
  nivel := credencial_nivel(uid);
  papel := case when nivel = 'equipo' then badge_papel(uid) end;
  return json_build_object(
    'token', b.token, 'codigo', b.codigo, 'nivel', nivel, 'desde', (select created_at from profiles where id = uid),
    'franja', papel->>'franja', 'papel', papel->>'papel',
    'socio', case when m.user_id is not null then json_build_object('numero', m.numero, 'desde', m.created_at, 'fundador', m.numero <= 100) end,
    'compartir_telefono', b.compartir_telefono, 'compartir_correo', b.compartir_correo,
    'compartir_instagram', b.compartir_instagram, 'compartir_perfil', b.compartir_perfil);
end $$;
revoke execute on function credencial_de(uuid) from public, anon, authenticated;

create or replace function credencial_mia() returns json
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return null; end if;
  if not exists (select 1 from badges where user_id = auth.uid()) then
    insert into badges (user_id, token, codigo) values (auth.uid(), badge_nuevo_token(), badge_nuevo_codigo());
  end if;
  return credencial_de(auth.uid());
end $$;
revoke execute on function credencial_mia() from public, anon;
grant execute on function credencial_mia() to authenticated;

-- ════════ Alta del pase (al descargarlo, con sesión) ════════
-- p_ticket = boleto propio; null = mi credencial. Devuelve {serial, token} (el token no cambia).
create or replace function wallet_pase_alta(p_ticket uuid default null) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); s text; tk text;
begin
  if uid is null then raise exception 'Inicia sesión.'; end if;
  if p_ticket is not null then
    if not exists (select 1 from tickets t join orders o on o.id = t.order_id
                    where t.id = p_ticket and o.buyer_user_id = uid) then
      raise exception 'Boleto no encontrado.';
    end if;
    s := 'boleto-' || p_ticket::text;
  else
    s := wallet_serial_cred(uid);
  end if;
  insert into wallet_pases (serial, tipo, ticket_id, user_id)
  values (s, case when p_ticket is null then 'credencial' else 'boleto' end, p_ticket, uid)
  on conflict (serial) do nothing;
  select auth_token into tk from wallet_pases where serial = s and user_id = uid;
  if tk is null then raise exception 'Boleto no encontrado.'; end if;
  return json_build_object('serial', s, 'token', tk);
end $$;
revoke execute on function wallet_pase_alta(uuid) from public, anon;
grant execute on function wallet_pase_alta(uuid) to authenticated;

-- ════════ Web service de Apple (sin sesión; valida el token del pase) ════════
create or replace function wallet_token_ok(p_serial text, p_token text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from wallet_pases where serial = p_serial and auth_token = p_token and length(coalesce(p_token, '')) >= 32)
$$;
revoke execute on function wallet_token_ok(text, text) from public, anon, authenticated;

-- Registrar un iPhone: 'nuevo' | 'existente' | null (token inválido).
create or replace function wallet_dispositivo_alta(p_device text, p_serial text, p_token text, p_push text) returns text
language plpgsql security definer set search_path = public as $$
declare nuevo boolean;
begin
  if not wallet_token_ok(p_serial, p_token) then return null; end if;
  if p_device !~ '^[A-Za-z0-9._-]{1,128}$' or p_push !~ '^[A-Za-z0-9]{1,200}$' then raise exception 'Datos inválidos.'; end if;
  insert into wallet_registros (device_id, serial, push_token) values (p_device, p_serial, p_push)
  on conflict (device_id, serial) do update set push_token = excluded.push_token
  returning (xmax = 0) into nuevo;
  return case when nuevo then 'nuevo' else 'existente' end;
end $$;

-- Quitar el pase de un iPhone: true si el token es válido.
create or replace function wallet_dispositivo_baja(p_device text, p_serial text, p_token text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not wallet_token_ok(p_serial, p_token) then return false; end if;
  delete from wallet_registros where device_id = p_device and serial = p_serial;
  return true;
end $$;

-- Qué pases de este iPhone cambiaron después de la marca (microsegundos desde 1970).
create or replace function wallet_series_cambiadas(p_device text, p_desde bigint default null) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
           'serials', coalesce(json_agg(w.serial order by w.serial), '[]'::json),
           'ultimo', max((extract(epoch from w.cambiado_at) * 1000000)::bigint)::text)
    from wallet_registros r join wallet_pases w on w.serial = r.serial
   where r.device_id = p_device
     and (p_desde is null or (extract(epoch from w.cambiado_at) * 1000000)::bigint > p_desde)
$$;

-- Lo necesario para armar el pase de nuevo (mismas columnas que lee la página con sesión).
create or replace function wallet_pase_datos(p_serial text, p_token text) returns json
language plpgsql stable security definer set search_path = public as $$
declare w wallet_pases; r json;
begin
  if not wallet_token_ok(p_serial, p_token) then return null; end if;
  select * into w from wallet_pases where serial = p_serial;
  if w.tipo = 'boleto' then
    select json_build_object(
      'id', t.id, 'qr_token', t.qr_token, 'is_active', t.is_active,
      'cancelled_at', t.cancelled_at, 'checked_in_at', t.checked_in_at,
      'seats', (select json_build_object('seat_label', s.seat_label) from seats s where s.id = t.seat_id),
      'price_categories', (select json_build_object('nombre', pc.nombre) from price_categories pc where pc.id = t.price_category_id),
      'orders', json_build_object(
        'order_code', o.order_code, 'status', o.status, 'buyer_nombre', o.buyer_nombre, 'buyer_user_id', o.buyer_user_id,
        'performances', json_build_object(
          'id', f.id, 'starts_at', f.starts_at, 'venue', f.venue, 'cancelada_at', f.cancelada_at,
          'productions', (select json_build_object(
              'id', p.id, 'nombre', p.nombre, 'venue', p.venue, 'estado', p.estado,
              'color_fondo', p.color_fondo, 'color_superficie', p.color_superficie, 'color_texto', p.color_texto,
              'color_acento', p.color_acento, 'logo_path', p.logo_path, 'ambiente_path', p.ambiente_path, 'frase', p.frase,
              'poster_3x4_path', p.poster_3x4_path, 'poster_3x4_info_path', p.poster_3x4_info_path,
              'poster_9x16_path', p.poster_9x16_path, 'poster_9x16_info_path', p.poster_9x16_info_path,
              'poster_4x3_path', p.poster_4x3_path, 'poster_4x3_info_path', p.poster_4x3_info_path,
              'poster_16x9_path', p.poster_16x9_path, 'poster_16x9_info_path', p.poster_16x9_info_path)
            from productions p where p.id = f.production_id))))
      into r
      from tickets t join orders o on o.id = t.order_id join performances f on f.id = t.performance_id
     where t.id = w.ticket_id and o.buyer_user_id = w.user_id;
    return json_build_object('tipo', 'boleto', 'user_id', w.user_id, 'cambiado_at', w.cambiado_at, 'boleto', r);
  end if;
  return json_build_object(
    'tipo', 'credencial', 'user_id', w.user_id, 'cambiado_at', w.cambiado_at,
    'credencial', credencial_de(w.user_id),
    'nombre', (select nombre from profiles where id = w.user_id),
    -- Sin sesión no se puede leer la foto privada: se usa el retrato público del perfil profesional.
    'retrato_path', (select pro.retrato_path from people pe join pro_profiles pro on pro.person_id = pe.id
                      where pe.profile_id = w.user_id and pro_is_public(pro.person_id) and pro.retrato_path is not null
                      limit 1));
end $$;

-- Teléfonos que Apple dice que ya no existen (410): se borran. Solo con el secreto del aviso.
create or replace function wallet_push_baja(p_secret text, p_tokens text[]) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_secret is null or p_secret <> (select hook_secret from wallet_config where id = 1) then return 0; end if;
  delete from wallet_registros where push_token = any(p_tokens);
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function wallet_dispositivo_alta(text, text, text, text) from public;
revoke execute on function wallet_dispositivo_baja(text, text, text) from public;
revoke execute on function wallet_series_cambiadas(text, bigint) from public;
revoke execute on function wallet_pase_datos(text, text) from public;
revoke execute on function wallet_push_baja(text, text[]) from public;
grant execute on function wallet_dispositivo_alta(text, text, text, text) to anon, authenticated;
grant execute on function wallet_dispositivo_baja(text, text, text) to anon, authenticated;
grant execute on function wallet_series_cambiadas(text, bigint) to anon, authenticated;
grant execute on function wallet_pase_datos(text, text) to anon, authenticated;
grant execute on function wallet_push_baja(text, text[]) to anon, authenticated;

-- ════════ Marcar cambios y avisar ════════
-- Marca los pases como cambiados y, si hay iPhones registrados, avisa a la página (pg_net manda
-- después del commit). Nunca bloquea la escritura que lo disparó.
create or replace function wallet_marcar(p_series text[]) returns void
language plpgsql security definer set search_path = public as $$
declare cfg wallet_config%rowtype; toks text[];
begin
  if p_series is null or cardinality(p_series) = 0 then return; end if;
  begin
    update wallet_pases set cambiado_at = clock_timestamp() where serial = any(p_series);
    select array_agg(distinct push_token) into toks from wallet_registros where serial = any(p_series);
    if toks is null then return; end if;
    select * into cfg from wallet_config where id = 1;
    if cfg.hook_url is null or to_regnamespace('net') is null then return; end if;
    execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 5000)'
      using cfg.hook_url, jsonb_build_object('tokens', to_jsonb(toks)),
            jsonb_build_object('Content-Type', 'application/json', 'x-wallet-secret', cfg.hook_secret);
  exception when others then null;
  end;
end $$;
revoke execute on function wallet_marcar(text[]) from public, anon, authenticated;

-- Pases de boleto que existen para estos boletos (solo los que alguien agregó a Wallet).
create or replace function wallet_series_boletos(p_tickets uuid[]) returns text[]
language sql stable security definer set search_path = public as $$
  select array_agg(serial) from wallet_pases where ticket_id = any(p_tickets)
$$;
revoke execute on function wallet_series_boletos(uuid[]) from public, anon, authenticated;

create or replace function wallet_marcar_cuentas(p_users uuid[]) returns void
language sql security definer set search_path = public as $$
  select wallet_marcar((select array_agg(serial) from wallet_pases
                         where tipo = 'credencial' and user_id = any(p_users)))
$$;
revoke execute on function wallet_marcar_cuentas(uuid[]) from public, anon, authenticated;

-- Boleto: activo/cancelado, escaneado en la puerta (y deshacer), asiento.
create or replace function wallet_trg_ticket() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform wallet_marcar(wallet_series_boletos(array[new.id]));
  return null;
end $$;
drop trigger if exists wallet_ticket on tickets;
create trigger wallet_ticket after update of is_active, cancelled_at, checked_in_at, seat_id on tickets
  for each row when (old.is_active is distinct from new.is_active or old.cancelled_at is distinct from new.cancelled_at
                     or old.checked_in_at is distinct from new.checked_in_at or old.seat_id is distinct from new.seat_id)
  execute function wallet_trg_ticket();

-- Orden: aprobada, rechazada, cancelada, vencida; nombre del comprador.
create or replace function wallet_trg_order() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform wallet_marcar(wallet_series_boletos(array(select id from tickets where order_id = new.id)));
  return null;
end $$;
drop trigger if exists wallet_order on orders;
create trigger wallet_order after update of status, buyer_nombre on orders
  for each row when (old.status is distinct from new.status or old.buyer_nombre is distinct from new.buyer_nombre)
  execute function wallet_trg_order();

-- Función: fecha, hora, lugar o cancelada.
create or replace function wallet_trg_performance() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform wallet_marcar((select array_agg(w.serial) from wallet_pases w join tickets t on t.id = w.ticket_id
                          where t.performance_id = new.id));
  return null;
end $$;
drop trigger if exists wallet_performance on performances;
create trigger wallet_performance after update of starts_at, venue, cancelada_at on performances
  for each row when (old.starts_at is distinct from new.starts_at or old.venue is distinct from new.venue
                     or old.cancelada_at is distinct from new.cancelada_at)
  execute function wallet_trg_performance();

-- Obra: nombre, lugar, colores, logo, imagen o póster.
create or replace function wallet_trg_production() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform wallet_marcar((select array_agg(w.serial) from wallet_pases w join tickets t on t.id = w.ticket_id
                           join performances f on f.id = t.performance_id where f.production_id = new.id));
  return null;
end $$;
drop trigger if exists wallet_production on productions;
create trigger wallet_production after update on productions
  for each row when ((old.nombre, old.venue, old.color_fondo, old.color_superficie, old.color_texto, old.color_acento,
                      old.logo_path, old.ambiente_path, old.poster_3x4_path, old.poster_3x4_info_path)
                     is distinct from
                     (new.nombre, new.venue, new.color_fondo, new.color_superficie, new.color_texto, new.color_acento,
                      new.logo_path, new.ambiente_path, new.poster_3x4_path, new.poster_3x4_info_path))
  execute function wallet_trg_production();

-- Credencial: Club Fan (entrar, salir, código), credencial nueva, nombre/foto/rol, equipo y créditos.
create or replace function wallet_trg_cuenta() returns trigger
language plpgsql security definer set search_path = public as $$
declare j jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end; u uuid[];
begin
  u := case tg_table_name
         when 'fan_members' then array[(j->>'user_id')::uuid]
         when 'badges' then array[(j->>'user_id')::uuid]
         when 'production_members' then array[(j->>'user_id')::uuid]
         when 'profiles' then array[(j->>'id')::uuid]
         else array(select profile_id from people
                     where id = (j->>'person_id')::uuid and profile_id is not null)
       end;
  perform wallet_marcar_cuentas(u);
  return null;
end $$;

drop trigger if exists wallet_fan on fan_members;
create trigger wallet_fan after insert or delete or update of token, codigo on fan_members
  for each row execute function wallet_trg_cuenta();
drop trigger if exists wallet_badge on badges;
create trigger wallet_badge after update of token, codigo on badges
  for each row when (old.token is distinct from new.token or old.codigo is distinct from new.codigo)
  execute function wallet_trg_cuenta();
drop trigger if exists wallet_profile on profiles;
create trigger wallet_profile after update of nombre, foto_path, rol on profiles
  for each row when (old.nombre is distinct from new.nombre or old.foto_path is distinct from new.foto_path or old.rol is distinct from new.rol)
  execute function wallet_trg_cuenta();
drop trigger if exists wallet_member on production_members;
create trigger wallet_member after insert or delete on production_members
  for each row execute function wallet_trg_cuenta();
drop trigger if exists wallet_credit on production_credits;
create trigger wallet_credit after insert or delete or update of tipo, papel, activo on production_credits
  for each row execute function wallet_trg_cuenta();
drop trigger if exists wallet_team on team_members;
create trigger wallet_team after insert or delete or update of cargo on team_members
  for each row execute function wallet_trg_cuenta();
drop trigger if exists wallet_pro on pro_profiles;
create trigger wallet_pro after update of retrato_path, publico on pro_profiles
  for each row execute function wallet_trg_cuenta();

update wallet_config set hook_url = 'https://www.darfproductions.com/wallet/apple/aviso' where id = 1;

select 'Listo 0098. Pases registrados: ' || (select count(*) from wallet_pases)
       || ' · aviso: ' || (select hook_url from wallet_config) as resultado;
commit;
