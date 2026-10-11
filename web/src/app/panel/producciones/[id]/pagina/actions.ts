"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { themeProblems } from "@/lib/themes";
import { parseYoutube } from "@/lib/youtube";

// Editor de la página de la obra. La base decide qué puede cada quien
// (0032: obra.editar para contenido, obra.publicar para el estado).

export type EditState = { ok: boolean; message: string } | null;

const txt = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v || null;
};
const done = (pid: string, message: string): EditState => {
  revalidatePath(`/panel/producciones/${pid}`, "layout");
  revalidatePath(`/producciones/${pid}`);
  return { ok: true, message };
};
const fail = (e: { message: string } | null, fallback = "No se pudo guardar."): EditState => ({ ok: false, message: e?.message ?? fallback });

async function update(pid: string, values: Record<string, unknown>) {
  const supabase = await createClient();
  const { error, count } = await supabase.from("productions").update(values, { count: "exact" }).eq("id", pid);
  if (error) return error;
  if (!count) return { message: "No tienes permiso para editar esta obra." };
  return null;
}

export async function saveGeneral(_p: EditState, f: FormData): Promise<EditState> {
  const pid = String(f.get("pid"));
  const nombre = txt(f, "nombre");
  const frase = txt(f, "frase");
  if (!nombre) return { ok: false, message: "La obra necesita un nombre." };
  if (frase && frase.length > 120) return { ok: false, message: "La frase corta debe tener máximo 120 caracteres." };
  const err = await update(pid, {
    nombre,
    frase,
    sinopsis: txt(f, "sinopsis"),
    venue: txt(f, "venue"),
    temporada: txt(f, "temporada"),
    fecha: txt(f, "fecha"),
    duracion: txt(f, "duracion"),
    clasificacion: txt(f, "clasificacion"),
    basada_en: txt(f, "basada_en"),
  });
  return err ? fail(err) : done(pid, "Datos guardados.");
}

export async function saveColors(_p: EditState, f: FormData): Promise<EditState> {
  const pid = String(f.get("pid"));
  const c = { fondo: String(f.get("color_fondo")), superficie: String(f.get("color_superficie")), texto: String(f.get("color_texto")), acento: String(f.get("color_acento")) };
  if (!Object.values(c).every((v) => /^#[0-9a-fA-F]{6}$/.test(v))) return { ok: false, message: "Revisa los colores." };
  const problems = themeProblems(c);
  // Se guarda aunque no se lea bien (para ir probando), pero no se podrá publicar.
  const err = await update(pid, { color_fondo: c.fondo, color_superficie: c.superficie, color_texto: c.texto, color_acento: c.acento });
  if (err) return fail(err);
  return problems.length
    ? { ok: false, message: `Guardado, pero así no se puede publicar: ${problems.join(" ")}` }
    : done(pid, "Colores guardados.");
}

export async function saveKitImage(pid: string, kind: "logo" | "ambiente", path: string): Promise<{ ok: boolean; message: string }> {
  if (!path.startsWith(`${pid}/kit/`)) return { ok: false, message: "Ruta de archivo no válida." };
  const err = await update(pid, kind === "logo" ? { logo_path: path } : { ambiente_path: path });
  if (err) return { ok: false, message: err.message };
  done(pid, "");
  return { ok: true, message: kind === "logo" ? "Logo actualizado." : "Imagen de ambiente actualizada." };
}

const ESTADOS = ["borrador", "publicada", "archivada", "oculta", "cancelada"];

export async function setEstado(_p: EditState, f: FormData): Promise<EditState> {
  const pid = String(f.get("pid"));
  const estado = String(f.get("estado"));
  if (!ESTADOS.includes(estado)) return { ok: false, message: "Estado no válido." };
  const err = await update(pid, { estado });
  return err ? fail(err) : done(pid, `La obra ahora está: ${estado}.`);
}

export async function saveSongs(_p: EditState, f: FormData): Promise<EditState> {
  const pid = String(f.get("pid"));
  const nombres = f.getAll("acto_nombre").map(String);
  const listas = f.getAll("acto_canciones").map(String);
  const actos = nombres.map((nombre, i) => ({
    nombre: nombre.trim(),
    canciones: (listas[i] ?? "").split("\n").map((s) => s.trim()).filter(Boolean),
  }));
  if (actos.length > 1 && actos.some((a) => !a.nombre && a.canciones.length)) {
    return { ok: false, message: "Cuando hay varios actos, cada uno necesita nombre (ej. Acto I)." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("panel_set_songs", { pid, actos });
  return error ? fail(error) : done(pid, "Canciones guardadas.");
}

export async function saveThanks(_p: EditState, f: FormData): Promise<EditState> {
  const pid = String(f.get("pid"));
  const items = String(f.get("thanks") ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
  const supabase = await createClient();
  const { error } = await supabase.rpc("panel_set_thanks", { pid, items });
  return error ? fail(error) : done(pid, "Agradecimientos guardados.");
}

export async function saveFacts(_p: EditState, f: FormData): Promise<EditState> {
  const pid = String(f.get("pid"));
  const etiquetas = f.getAll("etiqueta").map(String);
  const valores = f.getAll("valor").map(String);
  const items = etiquetas.map((etiqueta, i) => ({ etiqueta: etiqueta.trim(), valor: (valores[i] ?? "").trim() })).filter((x) => x.etiqueta && x.valor);
  const supabase = await createClient();
  const { error } = await supabase.rpc("panel_set_facts", { pid, items });
  return error ? fail(error) : done(pid, "Ficha guardada.");
}

/** Videos públicos ("video") o ensayos de la Fan Zone ("ensayo"). */
export async function saveVideos(_p: EditState, f: FormData): Promise<EditState> {
  const pid = String(f.get("pid"));
  const tipo = String(f.get("tipo")) === "ensayo" ? "ensayo" : "video";
  const titulos = f.getAll("titulo").map(String);
  const enlaces = f.getAll("enlace").map(String);
  const items: { titulo: string; youtube_id: string }[] = [];
  for (let i = 0; i < titulos.length; i++) {
    const titulo = titulos[i].trim();
    const enlace = (enlaces[i] ?? "").trim();
    if (!titulo && !enlace) continue;
    const id = parseYoutube(enlace);
    if (!id) return { ok: false, message: `El enlace del video ${i + 1} no es de YouTube.` };
    items.push({ titulo: titulo || "Video", youtube_id: id });
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("panel_set_media", { pid, p_tipo: tipo, items });
  return error ? fail(error) : done(pid, tipo === "ensayo" ? "Ensayos guardados." : "Videos guardados.");
}
