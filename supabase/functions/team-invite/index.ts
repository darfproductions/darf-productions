// team-invite (Supabase Edge Function, 0094): manda por correo la invitación al equipo de una obra.
//  * La llama el trigger production_invites_mail (pg_net) con {id} y el encabezado x-invite-secret.
//  * El secreto y la dirección viven en public.invite_config (solo la service role la lee).
//  * Correo con Resend, igual que notify-contact. Secretos (Edge Function secrets, nunca en el repo):
//    RESEND_API_KEY, NOTIFY_FROM (opcional), SITE_URL (p. ej. https://dev.darfproductions.com).
//  * Guarda en la invitación si se mandó (enviado_at) o por qué no (envio_error).
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

type Invite = { id: string; production_id: string; email: string; roles: string[]; token: string; invitado_por: string | null; aceptada_at: string | null; cancelada_at: string | null; expira_at: string };

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const { data: cfg } = await supa.from("invite_config").select("hook_secret").eq("id", 1).single<{ hook_secret: string }>();
  if (!cfg?.hook_secret || !safeEqual(req.headers.get("x-invite-secret") ?? "", cfg.hook_secret)) return json({ error: "auth" }, 401);

  const apiKey = Deno.env.get("RESEND_API_KEY");
  const sitio = (Deno.env.get("SITE_URL") ?? "").replace(/\/+$/, "");
  const body = await req.json().catch(() => ({}));
  const id = String(body?.id ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) return json({ error: "id" }, 400);

  const { data: inv } = await supa.from("production_invites")
    .select("id, production_id, email, roles, token, invitado_por, aceptada_at, cancelada_at, expira_at").eq("id", id).maybeSingle<Invite>();
  if (!inv || inv.aceptada_at || inv.cancelada_at || new Date(inv.expira_at) < new Date()) return json({ ok: true, enviado: false });
  const marcar = (campos: Record<string, unknown>) => supa.from("production_invites").update(campos).eq("id", id);
  if (!apiKey || !sitio.startsWith("https://")) {
    await marcar({ envio_error: "El correo no está configurado (RESEND_API_KEY / SITE_URL)." });
    return json({ error: "config" }, 500);
  }

  const [{ data: obra }, { data: roles }, { data: quien }] = await Promise.all([
    supa.from("productions").select("nombre").eq("id", inv.production_id).maybeSingle<{ nombre: string }>(),
    supa.from("panel_roles").select("nombre, orden").in("id", inv.roles).order("orden"),
    inv.invitado_por ? supa.from("profiles").select("nombre").eq("id", inv.invitado_por).maybeSingle<{ nombre: string | null }>() : Promise.resolve({ data: null }),
  ]);
  const nombreObra = obra?.nombre ?? "una obra";
  const listaRoles = (roles ?? []).map((r) => r.nombre).join(", ");
  const liga = `${sitio}/invitacion/${inv.token}`;
  const de = quien?.nombre ? `${quien.nombre} te invitó` : "Te invitaron";
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#17121f">
<h2 style="margin-bottom:4px">${esc(de)} al equipo de ${esc(nombreObra)}</h2>
<p>Tu rol: <b>${esc(listaRoles)}</b>.</p>
<p>Para entrar al panel de la obra, crea tu cuenta de DARF (o entra) con este mismo correo: <b>${esc(inv.email)}</b>.</p>
<p style="margin:28px 0"><a href="${esc(liga)}" style="background:#340feb;color:#fff;padding:14px 22px;border-radius:999px;text-decoration:none;font-weight:bold">Aceptar invitación</a></p>
<p style="font-size:13px;color:#555">La liga vence en 30 días. Si no esperabas este correo, ignóralo.</p>
<p style="font-size:13px;color:#555">DARF Productions</p></div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("NOTIFY_FROM") ?? "DARF Productions <no-reply@darfproductions.com>",
      to: [inv.email],
      subject: `${de} al equipo de ${nombreObra}`.replace(/[\r\n]+/g, " ").slice(0, 150),
      html,
    }),
  });
  if (!res.ok) {
    console.error("Resend error", res.status, await res.text());
    await marcar({ envio_error: `No se pudo mandar el correo (${res.status}).` });
    return json({ error: "email" }, 502);
  }
  await marcar({ enviado_at: new Date().toISOString(), envio_error: null });
  return json({ ok: true, enviado: true });
});
