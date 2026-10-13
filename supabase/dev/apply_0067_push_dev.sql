-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV".
-- Segunda parte de la 0067 en DEV (la primera, DARFY, ya se aplicó por MCP como 0067a_darfy):
-- notificaciones push + pg_net + dirección de la Edge Function push-send. Si la base no es DEV, aborta.
-- Se corre completa en Supabase → SQL Editor (proyecto DARF 2.0 DEV).
begin;
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
end $$;
create extension if not exists pg_net with schema extensions;
-- ════════ B. Notificaciones push ════════
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (endpoint like 'https://%' and length(endpoint) <= 1000),
  p256dh text not null check (length(p256dh) <= 200),
  auth text not null check (length(auth) <= 100),
  user_agent text check (length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  last_ok_at timestamptz
);
create index idx_push_subscriptions_user on push_subscriptions(user_id);
alter table push_subscriptions enable row level security;
create policy push_own_read on push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy push_own_remove on push_subscriptions for delete to authenticated using (user_id = auth.uid());
revoke all on push_subscriptions from anon, authenticated;
grant select, delete on push_subscriptions to authenticated;

-- Suscribe este navegador a la persona actual (si el navegador era de otra cuenta, pasa a esta).
create or replace function push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_ua text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Necesitas iniciar sesión'; end if;
  delete from push_subscriptions where endpoint = p_endpoint and user_id <> auth.uid();
  insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_ua, 300))
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent;
end $$;
revoke execute on function push_subscribe(text, text, text, text) from public;
grant execute on function push_subscribe(text, text, text, text) to authenticated;

-- Tipos de aviso que la persona NO quiere en el teléfono (en el panel siguen apareciendo).
create table push_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  apagados text[] not null default '{}'
);
alter table push_prefs enable row level security;
create policy push_prefs_own on push_prefs for select to authenticated using (user_id = auth.uid());
revoke all on push_prefs from anon, authenticated;
grant select on push_prefs to authenticated;

create or replace function push_set_off(p_tipos text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Necesitas iniciar sesión'; end if;
  insert into push_prefs (user_id, apagados)
  values (auth.uid(), coalesce((select array_agg(distinct t) from unnest(p_tipos) t
                                 where t in ('contacto', 'audicion', 'orden', 'oferta', 'documento', 'ausencia', 'equipo', 'cambio', 'prueba')), '{}'))
  on conflict (user_id) do update set apagados = excluded.apagados;
end $$;
revoke execute on function push_set_off(text[]) from public;
grant execute on function push_set_off(text[]) to authenticated;

-- Configuración privada del envío (una fila). Sin políticas: nadie la lee desde la web.
create table push_config (
  id int primary key default 1 check (id = 1),
  hook_url text,
  hook_secret text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  vapid_public text,
  vapid_private text,
  vapid_subject text not null default 'mailto:contact@darfproductions.com'
);
insert into push_config (id) values (1);
alter table push_config enable row level security;
revoke all on push_config from anon, authenticated;

create or replace function push_public_key() returns text
language sql stable security definer set search_path = public as $$
  select vapid_public from push_config where id = 1
$$;
revoke execute on function push_public_key() from public;
grant execute on function push_public_key() to anon, authenticated;

-- Notificación de prueba para mí (botón "Probar" en la web).
create or replace function push_test() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Necesitas iniciar sesión'; end if;
  insert into notifications (user_id, tipo, titulo, detalle, href)
  values (auth.uid(), 'prueba', 'Prueba de notificación', 'Si ves esto en tu teléfono, ya quedó.', '/panel/notificaciones');
end $$;
revoke execute on function push_test() from public;
grant execute on function push_test() to authenticated;

-- Al crear una notificación: si la persona tiene teléfonos suscritos y no apagó ese tipo,
-- se le pide a push-send que la mande. Nunca detiene la notificación.
create or replace function notifications_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare cfg push_config%rowtype;
begin
  begin
    if not exists (select 1 from push_subscriptions where user_id = new.user_id) then return new; end if;
    if exists (select 1 from push_prefs where user_id = new.user_id and new.tipo = any(apagados)) then return new; end if;
    select * into cfg from push_config where id = 1;
    if cfg.hook_url is null or to_regnamespace('net') is null then return new; end if;
    execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 5000)'
      using cfg.hook_url, jsonb_build_object('id', new.id),
            jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', cfg.hook_secret);
  exception when others then null;
  end;
  return new;
end $$;
create trigger notifications_push after insert on notifications for each row execute function notifications_push();

update push_config set hook_url = 'https://qgywscczyzuqinutuvak.supabase.co/functions/v1/push-send' where id = 1;
commit;
select 'LISTO: 0067 push aplicada en DEV' as resultado;
