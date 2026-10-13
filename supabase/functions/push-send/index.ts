// push-send (Supabase Edge Function, 0067): manda al teléfono una notificación del panel.
//  * La llama el trigger notifications_push (pg_net) con {id} y el encabezado x-push-secret.
//  * {init: true} genera las llaves VAPID la primera vez (no necesita secreto; si ya existen, no hace nada).
//  * Las llaves y el secreto viven en public.push_config (solo la service role la lee).
//  * Si un teléfono ya no existe (404/410), se borra su suscripción.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

type Config = { hook_secret: string; vapid_public: string | null; vapid_private: string | null; vapid_subject: string };

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const body = await req.json().catch(() => ({}));
  const { data: cfg, error } = await supa.from("push_config").select("hook_secret, vapid_public, vapid_private, vapid_subject").eq("id", 1).single<Config>();
  if (error || !cfg) return json({ error: "config" }, 500);

  if (body?.init === true) {
    if (cfg.vapid_public && cfg.vapid_private) return json({ ok: true, llaves: "existentes" });
    const k = webpush.generateVAPIDKeys();
    const { error: e } = await supa.from("push_config").update({ vapid_public: k.publicKey, vapid_private: k.privateKey }).eq("id", 1).is("vapid_public", null);
    return e ? json({ error: "guardar" }, 500) : json({ ok: true, llaves: "nuevas" });
  }

  if (!cfg.hook_secret || !safeEqual(req.headers.get("x-push-secret") ?? "", cfg.hook_secret)) return json({ error: "auth" }, 401);
  if (!cfg.vapid_public || !cfg.vapid_private) return json({ error: "sin llaves" }, 500);
  const id = Number(body?.id);
  if (!Number.isFinite(id)) return json({ error: "id" }, 400);

  const { data: n } = await supa.from("notifications").select("id, user_id, tipo, titulo, detalle, href").eq("id", id).maybeSingle();
  if (!n) return json({ ok: true, enviados: 0 });
  const { data: subs } = await supa.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", n.user_id);
  if (!subs?.length) return json({ ok: true, enviados: 0 });

  webpush.setVapidDetails(cfg.vapid_subject, cfg.vapid_public, cfg.vapid_private);
  const payload = JSON.stringify({ id: n.id, title: n.titulo, body: n.detalle ?? "", href: n.href ?? "/panel/notificaciones" });
  let enviados = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400, urgency: "high" });
      enviados++;
      await supa.from("push_subscriptions").update({ last_ok_at: new Date().toISOString() }).eq("id", s.id);
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await supa.from("push_subscriptions").delete().eq("id", s.id);
      else console.error("push", code ?? String(e));
    }
  }));
  return json({ ok: true, enviados });
});
