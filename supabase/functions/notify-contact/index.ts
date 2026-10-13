// notify-contact — avisa por correo (Resend) cuando entra un mensaje en contact_messages.
// Lo invoca un Database Webhook (INSERT en contact_messages) con el header
// `x-webhook-secret`. Secretos (Edge Function secrets, nunca en el repo):
//   RESEND_API_KEY, NOTIFY_EMAIL, WEBHOOK_SECRET
// Remitente: onboarding@resend.dev (solo entrega al dueño de la cuenta de Resend
// hasta que se verifique un dominio propio).

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const secret = Deno.env.get("WEBHOOK_SECRET") ?? "";
  const sent = req.headers.get("x-webhook-secret") ?? "";
  if (!secret || !safeEqual(sent, secret)) return new Response("Unauthorized", { status: 401 });

  const apiKey = Deno.env.get("RESEND_API_KEY");
  const to = Deno.env.get("NOTIFY_EMAIL");
  if (!apiKey || !to) return new Response("Missing config", { status: 500 });

  let payload: { type?: string; table?: string; record?: Record<string, unknown> };
  try { payload = await req.json(); } catch { return new Response("Bad JSON", { status: 400 }); }
  if (payload.type !== "INSERT" || payload.table !== "contact_messages" || !payload.record) {
    return new Response("Ignored", { status: 200 });
  }

  const r = payload.record;
  const asunto = String(r.asunto ?? "").slice(0, 120) || "(sin asunto)";
  const html = `<h2>Nuevo mensaje de contacto</h2>
<p><b>Nombre:</b> ${esc(r.nombre)}<br>
<b>Correo:</b> ${esc(r.correo)}<br>
<b>Teléfono:</b> ${esc(r.telefono) || "—"}<br>
<b>Asunto:</b> ${esc(asunto)}</p>
<p style="white-space:pre-wrap">${esc(r.mensaje)}</p>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "DARF Productions <onboarding@resend.dev>",
      to: [to],
      reply_to: String(r.correo ?? "") || undefined,
      subject: `Nuevo mensaje de contacto: ${asunto}`.replace(/[\r\n]+/g, " "),
      html,
    }),
  });

  if (!res.ok) {
    console.error("Resend error", res.status, await res.text());
    return new Response("Email failed", { status: 502 });
  }
  return new Response("OK", { status: 200 });
});
