// audition-qr (Supabase Edge Function, 0131): manda por correo el QR de la audición a quien se inscribió.
//  * La llama la base (_audition_qr_mail, pg_net) con {id, motivo} y el encabezado x-invite-secret.
//    motivo: inscripcion | recordatorio | callback | recordatorio_callback.
//  * Misma configuración que team-invite (invite_config: dirección base y secreto). Correo con Resend.
//    Secretos (Edge Function secrets, nunca en el repo): RESEND_API_KEY, NOTIFY_FROM (opcional), SITE_URL.
//  * El QR va como imagen de la web (/audiciones/qr/<token>) y con un botón para guardarlo en WhatsApp.
//  * Guarda en la solicitud si se mandó (correo_qr_at) o por qué no (correo_qr_error).
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

/** "sábado 8 de noviembre, 10:00 a.m." en hora de México. */
function fechaMx(iso: string) {
  const d = new Date(iso);
  const dia = new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", weekday: "long", day: "numeric", month: "long" }).format(d);
  const hora = new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", hour: "numeric", minute: "2-digit", hour12: true }).format(d)
    .replace(/\s*a\.?\s*m\.?/i, " a.m.").replace(/\s*p\.?\s*m\.?/i, " p.m.");
  return `${dia}, ${hora}`;
}

type App = { id: string; audition_id: string; user_id: string | null; nombre: string; qr_token: string; estado: string; numero: number | null;
  checked_in_at: string | null; slot_id: string | null };
type Aud = { titulo: string; sede: string | null; production_id: string | null; callback_fecha: string | null; callback_lugar: string | null };
const MOTIVOS = ["inscripcion", "recordatorio", "callback", "recordatorio_callback"] as const;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const { data: cfg } = await supa.from("invite_config").select("hook_secret").eq("id", 1).single<{ hook_secret: string }>();
  if (!cfg?.hook_secret || !safeEqual(req.headers.get("x-invite-secret") ?? "", cfg.hook_secret)) return json({ error: "auth" }, 401);

  const apiKey = Deno.env.get("RESEND_API_KEY");
  const sitio = (Deno.env.get("SITE_URL") ?? "").replace(/\/+$/, "");
  const body = await req.json().catch(() => ({}));
  const id = String(body?.id ?? "");
  const motivo = String(body?.motivo ?? "") as (typeof MOTIVOS)[number];
  if (!/^[0-9a-f-]{36}$/.test(id) || !MOTIVOS.includes(motivo)) return json({ error: "id" }, 400);

  const { data: app } = await supa.from("audition_applications")
    .select("id, audition_id, user_id, nombre, qr_token, estado, numero, checked_in_at, slot_id").eq("id", id).maybeSingle<App>();
  if (!app?.user_id || app.checked_in_at || ["cancelado", "no_cumple"].includes(app.estado)) return json({ ok: true, enviado: false });
  const marcar = (campos: Record<string, unknown>) => supa.from("audition_applications").update(campos).eq("id", id);
  if (!apiKey || !sitio.startsWith("https://")) {
    await marcar({ correo_qr_error: "El correo no está configurado (RESEND_API_KEY / SITE_URL)." });
    return json({ error: "config" }, 500);
  }

  const [{ data: au }, { data: usuario }, { data: slot }] = await Promise.all([
    supa.from("auditions").select("titulo, sede, production_id, callback_fecha, callback_lugar").eq("id", app.audition_id).maybeSingle<Aud>(),
    supa.auth.admin.getUserById(app.user_id),
    app.slot_id ? supa.from("audition_slots").select("inicia, sala").eq("id", app.slot_id).maybeSingle<{ inicia: string; sala: string | null }>()
      : Promise.resolve({ data: null }),
  ]);
  const correo = usuario?.user?.email;
  if (!au || !correo) return json({ ok: true, enviado: false });
  const { data: obra } = au.production_id
    ? await supa.from("productions").select("nombre").eq("id", au.production_id).maybeSingle<{ nombre: string }>()
    : { data: null };

  const esCallback = motivo === "callback" || motivo === "recordatorio_callback";
  const cuando = esCallback ? au.callback_fecha : slot?.inicia ?? null;
  const donde = esCallback ? au.callback_lugar ?? au.sede : [au.sede, slot?.sala].filter(Boolean).join(" · ") || null;
  const evento = [au.titulo, obra?.nombre].filter(Boolean).join(" · ");
  const asunto = {
    inscripcion: `Tu QR para la audición: ${evento}`,
    recordatorio: `Mañana es tu audición: ${evento}`,
    callback: `¡Pasaste a callback! ${evento}`,
    recordatorio_callback: `Mañana es tu callback: ${evento}`,
  }[motivo];
  const intro = {
    inscripcion: "Ya quedaste inscrito. Este es tu QR: muéstralo en la entrada el día de la audición.",
    recordatorio: "Te esperamos mañana. Muestra este QR en la entrada para que te den tu turno.",
    callback: "Te llamamos a callback. Lleva el mismo QR: muéstralo en la entrada ese día.",
    recordatorio_callback: "Mañana es tu callback. Muestra este QR en la entrada.",
  }[motivo];
  const qrImg = `${sitio}/audiciones/qr/${app.qr_token}`;
  const pagina = `${sitio}/audiciones/${app.audition_id}`;
  const wa = `https://wa.me/?text=${encodeURIComponent(`Mi QR para ${evento}: ${qrImg}`)}`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#17121f">
<h2 style="margin-bottom:4px">${esc(asunto)}</h2>
<p>Hola, ${esc(app.nombre.split(" ")[0])}. ${esc(intro)}</p>
${cuando ? `<p style="margin:4px 0"><b>Cuándo:</b> ${esc(fechaMx(cuando))}</p>` : ""}
${donde ? `<p style="margin:4px 0"><b>Dónde:</b> ${esc(donde)}</p>` : ""}
<p style="text-align:center;margin:24px 0"><img src="${esc(qrImg)}" width="240" height="240" alt="Tu QR de audición" style="border:8px solid #fff;border-radius:12px"></p>
<p style="text-align:center;margin:24px 0">
<a href="${esc(wa)}" style="background:#25d366;color:#052e16;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:bold">Guardarlo en WhatsApp</a>
&nbsp;<a href="${esc(pagina)}" style="background:#340feb;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:bold">Ver en mi cuenta</a></p>
<p style="font-size:13px;color:#555">También lo encuentras en Mi cuenta. Si no esperabas este correo, ignóralo.</p>
<p style="font-size:13px;color:#555">DARF Productions</p></div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("NOTIFY_FROM") ?? "DARF Productions <no-reply@darfproductions.com>",
      to: [correo],
      subject: asunto.replace(/[\r\n]+/g, " ").slice(0, 150),
      html,
    }),
  });
  if (!res.ok) {
    console.error("Resend error", res.status, await res.text());
    await marcar({ correo_qr_error: `No se pudo mandar el correo (${res.status}).` });
    return json({ error: "email" }, 502);
  }
  await marcar({ correo_qr_at: new Date().toISOString(), correo_qr_error: null });
  return json({ ok: true, enviado: true });
});
