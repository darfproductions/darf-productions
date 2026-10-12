-- DARF 2.0 — SOLO PARA EL PROYECTO SUPABASE "DARF 2.0 DEV".
-- Aplica la migración 0067 completa (DARFY y notificaciones push). Si la base no es DEV, aborta.
-- En DEV se aplicó en dos partes: 0067a_darfy (MCP) y apply_0067_push_dev.sql (SQL Editor),
-- que además activa pg_net y pone la dirección de la Edge Function push-send.
begin;
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV. No se ejecutó nada.';
  end if;
end $$;

-- ════════ A. DARFY ════════
create table darfy_faq (
  id uuid primary key default gen_random_uuid(),
  pregunta text not null check (length(btrim(pregunta)) between 3 and 200),
  respuesta text not null check (length(btrim(respuesta)) between 1 and 1500),
  palabras text[] not null default '{}',
  categoria text not null default 'general'
    check (categoria in ('boletos', 'funciones', 'audiciones', 'pagos', 'lugar', 'general')),
  liga text check (liga is null or liga like '/%' or liga like 'https://%'),
  orden int not null default 100,
  activa boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table darfy_faq enable row level security;
create policy darfy_faq_public_read on darfy_faq for select to anon using (activa);
create policy darfy_faq_auth_read on darfy_faq for select to authenticated using (activa or is_staff());
create policy darfy_faq_staff_write on darfy_faq for all to authenticated
  using (is_staff()) with check (is_staff());
grant select on darfy_faq to anon, authenticated;
grant insert, update, delete on darfy_faq to authenticated;

create or replace function darfy_faq_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  new.palabras := coalesce(new.palabras, '{}');
  return new;
end $$;
create trigger darfy_faq_stamp before insert or update on darfy_faq for each row execute function darfy_faq_stamp();

create table darfy_unanswered (
  id bigint generated always as identity primary key,
  pregunta text not null check (length(pregunta) <= 500),
  created_at timestamptz not null default now()
);
create index idx_darfy_unanswered on darfy_unanswered(created_at desc);
alter table darfy_unanswered enable row level security;
create policy darfy_unanswered_staff_read on darfy_unanswered for select to authenticated using (is_staff());
create policy darfy_unanswered_staff_remove on darfy_unanswered for delete to authenticated using (is_staff());
revoke all on darfy_unanswered from anon, authenticated;
grant select, delete on darfy_unanswered to authenticated;

-- Registra una pregunta sin respuesta (la llama el servidor de la web). Corta el texto y
-- limita a 300 por hora en total para que no se llene de basura.
create or replace function darfy_log(p_pregunta text) returns void
language plpgsql security definer set search_path = public as $$
declare t text := left(btrim(regexp_replace(coalesce(p_pregunta, ''), '\s+', ' ', 'g')), 500);
begin
  if length(t) < 3 then return; end if;
  if (select count(*) from darfy_unanswered where created_at > now() - interval '1 hour') >= 300 then return; end if;
  insert into darfy_unanswered (pregunta) values (t);
end $$;
revoke execute on function darfy_log(text) from public;
grant execute on function darfy_log(text) to anon, authenticated;

-- Preguntas iniciales (Diego las revisa y corrige desde Ajustes → DARFY).
insert into darfy_faq (pregunta, respuesta, palabras, categoria, liga, orden) values
('¿Cómo compro boletos?',
 'Entra a Cartelera, elige la producción y la función, escoge tus asientos y crea tu solicitud con tu cuenta DARF. Después pagas por WhatsApp o transferencia y, cuando se aprueba, tus boletos aparecen en Mi cuenta.',
 '{comprar,compro,boleto,boletos,entrada,entradas,ticket,tickets,asiento,asientos}', 'boletos', '/cartelera', 10),
('¿Cómo pago mis boletos?',
 'Al crear tu solicitud te damos un botón de WhatsApp con tu código de orden y el total. Ahí te compartimos los datos para pagar. Cuando confirmamos el pago, la orden se aprueba y tus boletos quedan en Mi cuenta.',
 '{pagar,pago,pagos,transferencia,deposito,tarjeta,efectivo,precio,costo}', 'pagos', '/cuenta', 20),
('¿Cuánto tiempo tengo para pagar?',
 'Tu solicitud se aparta hasta 24 horas, pero nunca después de 3 horas antes de la función. Si no se paga a tiempo, vence y los asientos se liberan. El tiempo restante lo ves en Mi cuenta.',
 '{tiempo,plazo,vence,vencio,vencida,apartar,apartado,expira,horas}', 'pagos', '/cuenta', 30),
('¿Dónde veo mis boletos?',
 'En Mi cuenta, dentro de tus compras. Cada boleto tiene su código QR y lo puedes descargar en PDF o mostrarlo en tu celular en la entrada.',
 '{ver,veo,mis,descargar,pdf,qr,codigo,cuenta,recoger,imprimir}', 'boletos', '/cuenta', 40),
('¿Necesito imprimir mi boleto?',
 'No. Basta con mostrar el código QR en tu celular en la puerta. Si prefieres, también lo puedes descargar en PDF.',
 '{imprimir,impreso,papel,celular,mostrar,puerta,entrada}', 'boletos', '/cuenta', 50),
('¿Hay cambios o reembolsos?',
 'Cada caso lo revisamos directamente. Escríbenos por WhatsApp con tu código de orden y te ayudamos.',
 '{cambio,cambiar,reembolso,devolucion,devolver,cancelar,cancelacion}', 'boletos', null, 60),
('¿Tienen descuentos?',
 'A veces hay códigos de descuento para funciones o grupos. Si tienes uno, lo escribes al crear tu solicitud de boletos y el total se ajusta solo.',
 '{descuento,descuentos,codigo,promocion,promo,grupo,estudiante}', 'boletos', '/cartelera', 70),
('¿Cómo hago una cuenta DARF?',
 'Toca "Entrar" arriba en la página y crea tu cuenta con tu correo. Con ella compras boletos, te inscribes a audiciones y ves todo en Mi cuenta.',
 '{cuenta,registrar,registro,crear,entrar,iniciar,sesion,contrasena,password}', 'general', '/entrar', 80),
('Olvidé mi contraseña',
 'En la pantalla de Entrar toca "¿Olvidaste tu contraseña?" y te mandamos un correo para crear una nueva.',
 '{olvide,olvido,contrasena,password,recuperar,acceso}', 'general', '/entrar/recuperar', 90),
('¿Cómo audiciono para una producción?',
 'En Audiciones ves las convocatorias abiertas. Entra a la que te interese, revisa los requisitos y llena tu solicitud con tu cuenta DARF. El estado de tu audición aparece en Mi cuenta.',
 '{audicion,audiciones,audicionar,casting,convocatoria,elenco,participar,actuar,cantar,bailar}', 'audiciones', '/audiciones', 100),
('¿Qué es el registro permanente?',
 'Es un registro de talento siempre abierto. Si no hay convocatoria para ti en este momento, déjanos tus datos ahí y te tomamos en cuenta para próximos proyectos.',
 '{registro,permanente,talento,banco,base,siempre,abierto}', 'audiciones', '/audiciones', 110),
('¿Qué edad necesito para audicionar?',
 'Depende de cada convocatoria: los requisitos de edad vienen en la página de cada audición. Si tienes dudas, escríbenos.',
 '{edad,anos,nino,ninos,adolescente,adulto,menor,mayor}', 'audiciones', '/audiciones', 120),
('¿Dónde son las funciones?',
 'El lugar de cada función aparece en la página de su producción, junto con fechas y horarios.',
 '{donde,lugar,teatro,direccion,ubicacion,sede,llegar,mapa}', 'lugar', '/cartelera', 130),
('¿Qué es la Fan Zone?',
 'Es el espacio con ensayos, videos y galerías de cada producción para que vivas el detrás del telón.',
 '{fan,zone,fanzone,videos,fotos,galeria,ensayos}', 'general', '/fan-zone', 140),
('¿Cómo los contacto?',
 'Puedes escribirnos por WhatsApp o desde la página de Contacto. También estamos en Instagram, TikTok y YouTube.',
 '{contacto,contactar,whatsapp,telefono,correo,mail,instagram,tiktok,redes,hablar,persona}', 'general', '/contacto', 150);

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

commit;
