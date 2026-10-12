"use server";

import { getPermanentRegistry, listPublicAuditions } from "@/lib/auditions";
import { responder, type DarfyContexto, type FaqItem, type ObraInfo, type Respuesta } from "@/lib/darfy-rules";
import { formatPerformanceDate, formatPrice, getHomeData, getProduction } from "@/lib/productions";
import { createClient } from "@/lib/supabase/server";

// DARFY solo lee información pública (las mismas reglas RLS que ve un visitante).

const fechaCorta = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", timeZone: "America/Mexico_City" }).format(new Date(iso));

async function contexto(): Promise<DarfyContexto> {
  const supabase = await createClient();
  const [faqRes, home, auds, registro] = await Promise.all([
    supabase.from("darfy_faq").select("id, pregunta, respuesta, palabras, liga").eq("activa", true).order("orden"),
    getHomeData(),
    listPublicAuditions(),
    getPermanentRegistry(),
  ]);
  const ahora = Date.now();
  const obras: ObraInfo[] = await Promise.all(
    home.productions.map(async (p) => {
      const base: ObraInfo = { id: p.id, nombre: p.nombre, estado: p.estadoPublico, venue: p.venue, funciones: [], precios: null };
      if (p.estadoPublico !== "cartelera") return base;
      const d = await getProduction(p.id);
      if (!d) return base;
      base.funciones = d.performances
        .filter((f) => f.on_sale && f.starts_at && new Date(f.starts_at).getTime() > ahora)
        .map((f) => [formatPerformanceDate(f.starts_at), f.venue ?? p.venue].filter(Boolean).join(" · "));
      base.precios = d.prices.length ? d.prices.map((z) => `${z.nombre} ${formatPrice(z.price)}`).join(" · ") : null;
      return base;
    }),
  );
  return {
    faq: (faqRes.data ?? []) as FaqItem[],
    obras,
    audiciones: auds
      .filter((a) => a.estado === "abierta")
      .map((a) => ({ id: a.id, titulo: a.titulo, obra: a.productions?.nombre ?? null, cierra: a.inscripcion_cierra ? fechaCorta(a.inscripcion_cierra) : null })),
    registro: registro ? { id: registro.id } : null,
  };
}

export async function preguntarDarfy(pregunta: string): Promise<Respuesta> {
  const q = String(pregunta ?? "").trim().slice(0, 500);
  try {
    const r = responder(q, await contexto());
    if (r.tipo === "nose" && q.length >= 3) {
      const supabase = await createClient();
      await supabase.rpc("darfy_log", { p_pregunta: q });
    }
    return r;
  } catch {
    return { tipo: "nose", texto: "Ahorita no pude revisar la información. Escríbenos por WhatsApp o déjanos tus datos.", ligas: [] };
  }
}

export type DarfyContactState = { ok: boolean; message: string } | null;

/** Solicitud de contacto desde DARFY: llega a Contacto del panel (y su notificación). */
export async function contactoDarfy(_prev: DarfyContactState, form: FormData): Promise<DarfyContactState> {
  const get = (k: string) => String(form.get(k) ?? "").trim();
  if (get("sitio")) return { ok: true, message: "¡Gracias! Te contactamos pronto." }; // campo trampa para robots
  const nombre = get("nombre").slice(0, 120);
  const correo = get("correo").slice(0, 200);
  const telefono = get("telefono").slice(0, 40);
  const pregunta = get("pregunta").slice(0, 1500);
  const mensaje = get("mensaje").slice(0, 1500);
  if (!nombre || !correo) return { ok: false, message: "Escribe tu nombre y tu correo." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) return { ok: false, message: "Revisa tu correo." };
  if (!pregunta && !mensaje) return { ok: false, message: "Cuéntanos tu pregunta." };
  const supabase = await createClient();
  const { error } = await supabase.from("contact_messages").insert({
    nombre,
    correo,
    telefono: telefono || null,
    asunto: "Pregunta a DARFY",
    mensaje: [pregunta && `Pregunta: ${pregunta}`, mensaje].filter(Boolean).join("\n\n"),
  });
  if (error) return { ok: false, message: "No se pudo enviar. Intenta de nuevo en un momento." };
  return { ok: true, message: "¡Listo! Recibimos tu pregunta y alguien del equipo te contactará pronto." };
}
