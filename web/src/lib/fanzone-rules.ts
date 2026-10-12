import { parseYoutube } from "@/lib/youtube";

// Fan Zone ampliada (0052). Puro, con pruebas en fanzone-rules.test.ts.

export type FanTipo = "video" | "foto" | "documento" | "enlace" | "texto";
export type FanItem = {
  id: string; production_id: string; tipo: FanTipo; titulo: string; descripcion: string | null;
  youtube_id: string | null; archivo_path: string | null; url: string | null;
  destacado: boolean; visible: boolean; orden: number; created_at: string;
};

export const FAN_TIPOS: Record<FanTipo, { label: string; help: string; icono: string }> = {
  video: { label: "Video", help: "Enlace de YouTube (puede ser no listado).", icono: "▶" },
  foto: { label: "Foto", help: "JPG, PNG o WebP, hasta 20 MB.", icono: "◼" },
  documento: { label: "Documento", help: "PDF, hasta 20 MB.", icono: "▤" },
  enlace: { label: "Enlace", help: "Cualquier página que empiece con https:// (playlist, nota, Instagram…).", icono: "↗" },
  texto: { label: "Texto", help: "Un aviso o una nota para los fans.", icono: "¶" },
};

/** Destacados primero; luego por orden y fecha. */
export function ordenFanzone<T extends Pick<FanItem, "destacado" | "orden" | "created_at">>(xs: T[]): T[] {
  return [...xs].sort((a, b) => Number(b.destacado) - Number(a.destacado) || a.orden - b.orden || a.created_at.localeCompare(b.created_at));
}

export type FanInput = { tipo: string; titulo: string; descripcion: string; enlace: string; archivo: string | null };
export type FanRow = { tipo: FanTipo; titulo: string; descripcion: string | null; youtube_id: string | null; url: string | null; archivo_path: string | null };

/** Valida lo que llega del formulario y arma la fila, o explica qué falta. */
export function fanRow(pid: string, i: FanInput): { ok: true; row: FanRow } | { ok: false; message: string } {
  if (!(i.tipo in FAN_TIPOS)) return { ok: false, message: "Elige qué tipo de contenido es." };
  const tipo = i.tipo as FanTipo;
  const titulo = i.titulo.trim();
  if (!titulo) return { ok: false, message: "Escribe un título." };
  if (titulo.length > 160) return { ok: false, message: "El título es muy largo." };
  const descripcion = i.descripcion.trim() || null;
  if (descripcion && descripcion.length > 4000) return { ok: false, message: "El texto es muy largo (máx. 4000)." };
  const row: FanRow = { tipo, titulo, descripcion, youtube_id: null, url: null, archivo_path: null };
  if (tipo === "video") {
    row.youtube_id = parseYoutube(i.enlace);
    if (!row.youtube_id) return { ok: false, message: "Pega un enlace de YouTube válido." };
  } else if (tipo === "enlace") {
    if (!/^https:\/\/\S+$/i.test(i.enlace.trim())) return { ok: false, message: "El enlace debe empezar con https://" };
    row.url = i.enlace.trim();
  } else if (tipo === "foto" || tipo === "documento") {
    if (!i.archivo || !i.archivo.startsWith(`${pid}/fanzone/`)) return { ok: false, message: "Sube el archivo." };
    row.archivo_path = i.archivo;
  } else if (!descripcion) {
    return { ok: false, message: "Escribe el texto." };
  }
  return { ok: true, row };
}

/** Dominio para mostrar en una tarjeta de enlace ("open.spotify.com"). */
export function dominio(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}
