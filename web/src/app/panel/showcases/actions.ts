"use server";

import { revalidatePath } from "next/cache";
import { mensajeError } from "@/lib/errores";
import { createClient } from "@/lib/supabase/server";
import { parseYoutube } from "@/lib/youtube";

// Panel → Showcases (0121). La base decide quién puede (Casa DARF con casa.showcases).

type St = { ok: boolean; message: string } | null;
const txt = (f: FormData, k: string) => { const v = String(f.get(k) ?? "").trim(); return v || null; };
const lineas = (f: FormData, k: string) => String(f.get(k) ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
const refrescar = () => { revalidatePath("/panel/showcases", "layout"); revalidatePath("/showcases", "layout"); revalidatePath("/eventos"); };
const fallo = (e: { message: string }): St => ({ ok: false, message: mensajeError(e) });

export async function guardarPlan(_p: St, f: FormData): Promise<St> {
  const id = txt(f, "id");
  const nombre = txt(f, "nombre");
  if (!nombre) return { ok: false, message: "El plan necesita nombre." };
  const precioTxt = txt(f, "precio");
  const precio = precioTxt == null ? null : Number(precioTxt);
  if (precio != null && (!Number.isFinite(precio) || precio < 0)) return { ok: false, message: "Revisa el precio." };
  const valores = {
    nombre, descripcion: txt(f, "descripcion"), precio, resumen: txt(f, "resumen"), detalle: txt(f, "detalle"),
    incluye: lineas(f, "incluye"), ideal_para: txt(f, "ideal_para"), nota: txt(f, "nota"), activo: f.get("activo") === "on", updated_at: new Date().toISOString(),
  };
  const supabase = await createClient();
  if (id) {
    const { error, count } = await supabase.from("showcase_planes").update(valores, { count: "exact" }).eq("id", id);
    if (error) return fallo(error);
    if (!count) return { ok: false, message: "No tienes permiso para editar showcases." };
  } else {
    const { data: ult } = await supabase.from("showcase_planes").select("orden").order("orden", { ascending: false }).limit(1).maybeSingle();
    const { error } = await supabase.from("showcase_planes").insert({ ...valores, orden: Number(ult?.orden ?? 0) + 1 });
    if (error) return fallo(error);
  }
  refrescar();
  return { ok: true, message: id ? "Plan guardado." : "Plan creado." };
}

export async function borrarPlan(_p: St, f: FormData): Promise<St> {
  const supabase = await createClient();
  const { error } = await supabase.from("showcase_planes").delete().eq("id", String(f.get("id")));
  if (error) return fallo(error);
  refrescar();
  return { ok: true, message: "Plan borrado. Sus solicitudes se quedan en la bandeja." };
}

export async function moverPlan(_p: St, f: FormData): Promise<St> {
  const supabase = await createClient();
  const { data } = await supabase.from("showcase_planes").select("id, orden").order("orden").order("created_at");
  const xs = (data ?? []) as { id: string; orden: number }[];
  const i = xs.findIndex((x) => x.id === String(f.get("id")));
  const j = f.get("dir") === "arriba" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= xs.length) return null;
  [xs[i], xs[j]] = [xs[j], xs[i]];
  for (const [k, x] of xs.entries()) {
    const { error } = await supabase.from("showcase_planes").update({ orden: k + 1 }).eq("id", x.id);
    if (error) return fallo(error);
  }
  refrescar();
  return { ok: true, message: "Orden guardado." };
}

/** Textos de la página, WhatsApp y si está publicada. */
export async function guardarPagina(_p: St, f: FormData): Promise<St> {
  const wa = String(f.get("whatsapp") ?? "").replace(/\D/g, "");
  if (wa && !/^52\d{10}$/.test(wa)) return { ok: false, message: "El WhatsApp debe ser 52 + 10 dígitos (ej. 52 446 522 0560)." };
  const titulo = txt(f, "titulo");
  if (!titulo) return { ok: false, message: "La página necesita título." };
  const supabase = await createClient();
  const { error, count } = await supabase.from("showcase_ajustes").update({
    titulo, lema: txt(f, "lema"), intro: txt(f, "intro"), importante: txt(f, "importante"),
    antes_reservar: lineas(f, "antes_reservar"), anticipacion: lineas(f, "anticipacion"),
    whatsapp: wa || null, publicado: f.get("publicado") === "on", updated_at: new Date().toISOString(),
  }, { count: "exact" }).eq("id", 1);
  if (error) return fallo(error);
  if (!count) return { ok: false, message: "No tienes permiso para editar showcases." };
  refrescar();
  return { ok: true, message: "Página guardada." };
}

/** Listas de título + texto (públicos, qué nos hace especiales, condiciones). */
export async function guardarBloques(_p: St, f: FormData): Promise<St> {
  const campo = String(f.get("campo"));
  if (!["publicos", "especial", "condiciones"].includes(campo)) return { ok: false, message: "Sección no válida." };
  const t = f.getAll("titulo").map(String);
  const x = f.getAll("texto").map(String);
  const bloques = t.map((titulo, i) => ({ titulo: titulo.trim(), texto: (x[i] ?? "").trim() })).filter((b) => b.titulo && b.texto);
  const supabase = await createClient();
  const { error, count } = await supabase.from("showcase_ajustes").update({ [campo]: bloques, updated_at: new Date().toISOString() }, { count: "exact" }).eq("id", 1);
  if (error) return fallo(error);
  if (!count) return { ok: false, message: "No tienes permiso para editar showcases." };
  refrescar();
  return { ok: true, message: "Guardado." };
}

/** Foto ya subida al Storage (bucket showcases). */
export async function agregarFoto(planId: string | null, categoria: string, path: string): Promise<{ ok: boolean; message: string }> {
  if (!path.startsWith("showcase/")) return { ok: false, message: "Ruta no válida." };
  const supabase = await createClient();
  const { error } = await supabase.from("showcase_media").insert({ plan_id: planId, categoria: planId ? "show" : categoria, tipo: "foto", path });
  if (error) return { ok: false, message: mensajeError(error) };
  refrescar();
  return { ok: true, message: "Foto agregada." };
}

export async function agregarVideo(_p: St, f: FormData): Promise<St> {
  const url = String(f.get("url") ?? "").trim();
  if (!/^https:\/\/\S+$/.test(url)) return { ok: false, message: "Pega la liga completa (https://…) de YouTube, Instagram o TikTok." };
  if (/youtu/.test(url) && !parseYoutube(url)) return { ok: false, message: "Esa liga de YouTube no se reconoce." };
  const plan = txt(f, "plan");
  const supabase = await createClient();
  const { error } = await supabase.from("showcase_media").insert({ plan_id: plan, categoria: plan ? "show" : String(f.get("categoria") ?? "show"), tipo: "video", url, titulo: txt(f, "titulo") });
  if (error) return fallo(error);
  refrescar();
  return { ok: true, message: "Video agregado." };
}

export async function borrarMedia(_p: St, f: FormData): Promise<St> {
  const supabase = await createClient();
  const id = String(f.get("id"));
  const { data: m } = await supabase.from("showcase_media").select("path").eq("id", id).maybeSingle();
  const { error } = await supabase.from("showcase_media").delete().eq("id", id);
  if (error) return fallo(error);
  if (m?.path) await supabase.storage.from("showcases").remove([m.path as string]).catch(() => null);
  refrescar();
  return { ok: true, message: "Quitado." };
}

export async function actualizarSolicitud(_p: St, f: FormData): Promise<St> {
  const estado = String(f.get("estado"));
  if (!["nueva", "cotizada", "confirmada", "descartada"].includes(estado)) return { ok: false, message: "Estado no válido." };
  const supabase = await createClient();
  const { error, count } = await supabase.from("showcase_solicitudes")
    .update({ estado, notas_internas: txt(f, "notas_internas"), updated_at: new Date().toISOString() }, { count: "exact" }).eq("id", String(f.get("id")));
  if (error) return fallo(error);
  if (!count) return { ok: false, message: "No tienes permiso." };
  refrescar();
  return { ok: true, message: "Guardado." };
}
