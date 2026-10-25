"use server";

import { revalidatePath } from "next/cache";
import { leerFranja } from "@/lib/banner-form";
import { createClient } from "@/lib/supabase/server";
import { themeProblems } from "@/lib/themes";
import { parseYoutube } from "@/lib/youtube";
import { FORMATOS, FORMATOS_ALT, POSTER_ALT_COLUMNS, columna, columnaAlt, type Formato, type FormatoAlt } from "@/lib/poster";
import { SECCIONES, type Seccion } from "@/lib/obra-capa-rules";
import { refrescarPublico } from "@/lib/supabase/publico";

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
  refrescarPublico();
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

/** Rutas del kit que la obra usa hoy: publicadas y en cambios sin publicar (0119). */
async function rutasKit(pid: string): Promise<Set<string>> {
  const supabase = await createClient();
  const [{ data: p }, { data: rows }] = await Promise.all([
    supabase.from("productions").select(`logo_path, ambiente_path, ${FORMATOS.flatMap((f) => [columna(f, false), columna(f, true)]).join(", ")}, ${POSTER_ALT_COLUMNS}`).eq("id", pid).maybeSingle(),
    supabase.from("obra_borradores").select("borrador, fans").eq("production_id", pid).in("seccion", ["kit", "poster"]),
  ]);
  const out = new Set<string>();
  const add = (o: unknown) => { if (o && typeof o === "object") for (const v of Object.values(o)) if (typeof v === "string" && v) out.add(v); };
  add(p);
  for (const r of (rows ?? []) as { borrador: unknown; fans: unknown }[]) { add(r.borrador); add(r.fans); }
  return out;
}

/** Hace el cambio y borra del Storage las imágenes del kit que dejaron de usarse (pósters viejos, logos reemplazados…). */
async function conLimpieza<T>(pid: string, cambio: () => Promise<T>): Promise<T> {
  const antes = await rutasKit(pid).catch(() => new Set<string>());
  const r = await cambio();
  const despues = await rutasKit(pid).catch(() => null);
  if (despues) {
    const sobran = [...antes].filter((x) => !despues.has(x) && x.startsWith(`${pid}/kit/`));
    if (sobran.length) {
      // Una obra duplicada puede seguir usando la misma imagen: esas no se borran.
      const supabase = await createClient();
      const { data: enUso, error } = await supabase.rpc("kit_en_uso", { paths: sobran });
      const libres = error ? [] : sobran.filter((x) => !((enUso ?? []) as string[]).includes(x));
      if (libres.length) await supabase.storage.from("producciones").remove(libres).catch(() => null);
    }
  }
  return r;
}

/** 0119: con la obra pública el cambio queda en borrador; si no, se guarda directo. */
async function guardar(pid: string, seccion: Seccion, datos: Record<string, unknown>, listo: string, parche = false): Promise<EditState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("obra_borrador_guardar", { pid, p_seccion: seccion, datos, p_parche: parche });
  if (error) return fail(error);
  return done(pid, data === "borrador" ? "Guardado en borrador: el público aún no lo ve. Publícalo en «Cambios sin publicar», arriba." : listo);
}

export async function saveGeneral(_p: EditState, f: FormData): Promise<EditState> {
  const pid = String(f.get("pid"));
  const nombre = txt(f, "nombre");
  const frase = txt(f, "frase");
  if (!nombre) return { ok: false, message: "La obra necesita un nombre." };
  if (frase && frase.length > 120) return { ok: false, message: "La frase corta debe tener máximo 120 caracteres." };
  return guardar(pid, "datos", {
    nombre,
    frase,
    sinopsis: txt(f, "sinopsis"),
    venue: txt(f, "venue"),
    temporada: txt(f, "temporada"),
    fecha: txt(f, "fecha"),
    duracion: txt(f, "duracion"),
    clasificacion: txt(f, "clasificacion"),
    idioma: txt(f, "idioma"),
    basada_en: txt(f, "basada_en"),
  }, "Datos guardados.");
}

export async function saveColors(_p: EditState, f: FormData): Promise<EditState> {
  const pid = String(f.get("pid"));
  const c = { fondo: String(f.get("color_fondo")), superficie: String(f.get("color_superficie")), texto: String(f.get("color_texto")), acento: String(f.get("color_acento")) };
  if (!Object.values(c).every((v) => /^#[0-9a-fA-F]{6}$/.test(v))) return { ok: false, message: "Revisa los colores." };
  const problems = themeProblems(c);
  // Se guarda aunque no se lea bien (para ir probando), pero no se podrá publicar.
  const r = await guardar(pid, "colores", { color_fondo: c.fondo, color_superficie: c.superficie, color_texto: c.texto, color_acento: c.acento }, "Colores guardados.");
  if (!r?.ok) return r;
  return problems.length ? { ok: false, message: `Guardado, pero así no se puede publicar: ${problems.join(" ")}` } : r;
}

export async function saveKitImage(pid: string, kind: "logo" | "ambiente", path: string): Promise<{ ok: boolean; message: string }> {
  if (!path.startsWith(`${pid}/kit/`)) return { ok: false, message: "Ruta de archivo no válida." };
  const r = await conLimpieza(pid, () => guardar(pid, "kit", kind === "logo" ? { logo_path: path } : { ambiente_path: path }, kind === "logo" ? "Logo actualizado." : "Imagen de ambiente actualizada.", true));
  return { ok: !!r?.ok, message: r?.message ?? "No se pudo guardar." };
}

/** Póster oficial (0093) o alterno (0124): un formato y versión; path vacío lo quita. */
export async function savePoster(pid: string, formato: string, info: boolean, path: string, alt = false): Promise<{ ok: boolean; message: string }> {
  if (!((alt ? FORMATOS_ALT : FORMATOS) as readonly string[]).includes(formato)) return { ok: false, message: "Formato no válido." };
  if (path && !path.startsWith(`${pid}/kit/`)) return { ok: false, message: "Ruta de archivo no válida." };
  const col = alt ? columnaAlt(formato as FormatoAlt, info) : columna(formato as Formato, info);
  const r = await conLimpieza(pid, () => guardar(pid, "poster", { [col]: path || null }, path ? "Póster guardado." : "Póster quitado.", true));
  return { ok: !!r?.ok, message: r?.message ?? "No se pudo guardar." };
}

/** Póster alterno (0124): igual que el oficial, en 3:4 y 9:16. */
export async function savePosterAlt(pid: string, formato: string, info: boolean, path: string): Promise<{ ok: boolean; message: string }> {
  return savePoster(pid, formato, info, path, true);
}

export async function quitarPoster(_p: EditState, f: FormData): Promise<EditState> {
  const pid = String(f.get("pid"));
  const r = await savePoster(pid, String(f.get("formato")), f.get("info") === "1", "", f.get("alt") === "1");
  return r.ok ? done(pid, r.message) : { ok: false, message: r.message };
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
  return guardar(pid, "canciones", { actos }, "Canciones guardadas.");
}

export async function saveThanks(_p: EditState, f: FormData): Promise<EditState> {
  const pid = String(f.get("pid"));
  const items = String(f.get("thanks") ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
  return guardar(pid, "gracias", { items }, "Agradecimientos guardados.");
}

export async function saveFacts(_p: EditState, f: FormData): Promise<EditState> {
  const pid = String(f.get("pid"));
  const etiquetas = f.getAll("etiqueta").map(String);
  const valores = f.getAll("valor").map(String);
  const items = etiquetas.map((etiqueta, i) => ({ etiqueta: etiqueta.trim(), valor: (valores[i] ?? "").trim() })).filter((x) => x.etiqueta && x.valor);
  return guardar(pid, "ficha", { items }, "Ficha guardada.");
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
  // Los ensayos son de la Fan Zone (ya son solo para fans): se guardan directo.
  if (tipo === "video") return guardar(pid, "videos", { items }, "Videos guardados.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("panel_set_media", { pid, p_tipo: tipo, items });
  return error ? fail(error) : done(pid, "Ensayos guardados.");
}

/** Franja de avisos abajo del Hero (0069): estilo, color, encendida y la lista de avisos. */
export async function saveBanner(_p: EditState, f: FormData): Promise<EditState> {
  const pid = String(f.get("pid"));
  const r = leerFranja(f);
  if (!r.ok) return r;
  const { estilo, color, items } = r;
  return guardar(pid, "franja", { estilo, color: color || null, activa: f.get("activa") === "1", items }, "Franja guardada.");
}

const secciones = (f: FormData): Seccion[] | null => {
  const xs = f.getAll("seccion").map(String).filter((x): x is Seccion => (SECCIONES as readonly string[]).includes(x));
  return xs.length ? xs : null;
};

/** 0119: publicar cambios a fans o a todos (una sección o todas). */
export async function publicarCambios(_p: EditState, f: FormData): Promise<EditState> {
  const pid = String(f.get("pid"));
  const destino = String(f.get("destino")) === "fans" ? "fans" : "publico";
  const supabase = await createClient();
  const r = await conLimpieza(pid, async () => supabase.rpc("obra_publicar", { pid, p_secciones: secciones(f), p_destino: destino }));
  if (r.error) return fail(r.error);
  const n = Number(r.data ?? 0);
  if (!n) return { ok: false, message: destino === "fans" ? "No hay borradores para publicar a fans." : "No hay cambios para publicar." };
  return done(pid, destino === "fans" ? `Publicado para el Club Fan (${n === 1 ? "1 sección" : `${n} secciones`}). El público aún no lo ve.` : `Publicado para todos (${n === 1 ? "1 sección" : `${n} secciones`}).`);
}

/** 0119: tirar el borrador, o quitar lo de fans (vuelven a ver lo público). */
export async function descartarCambios(_p: EditState, f: FormData): Promise<EditState> {
  const pid = String(f.get("pid"));
  const capa = String(f.get("capa")) === "fans" ? "fans" : "borrador";
  const supabase = await createClient();
  const r = await conLimpieza(pid, async () => supabase.rpc("obra_descartar", { pid, p_secciones: secciones(f), p_capa: capa }));
  if (r.error) return fail(r.error);
  return done(pid, capa === "fans" ? "Los fans vuelven a ver lo publicado." : "Borrador descartado.");
}
