// Reglas de audiciones que se muestran en pantalla (puras, con pruebas).
// La base vuelve a validar todo al inscribir (audition_apply, 0036).

export const ESTADO_SOLICITUD: Record<string, { label: string; cls: string }> = {
  inscrito: { label: "Inscrito", cls: "bg-[#3a3346] text-texto-2" },
  convocado: { label: "Convocado", cls: "bg-[#1e3a8a] text-[#dbeafe]" },
  en_espera: { label: "En espera", cls: "bg-[#5a4313] text-[#fde68a]" },
  no_cumple: { label: "No cumple requisitos", cls: "bg-[#5a1a22] text-[#fecdd3]" },
  callback: { label: "Callback", cls: "bg-[#581c87] text-[#f3e8ff]" },
  seleccionado: { label: "Seleccionado", cls: "bg-[#14532d] text-[#bbf7d0]" },
  no_seleccionado: { label: "No seleccionado", cls: "bg-[#2b2f3a] text-texto-3" },
  cancelado: { label: "Cancelado", cls: "bg-[#2b2f3a] text-texto-3" },
};

export const ESTADO_CONVOCATORIA: Record<string, string> = {
  borrador: "Borrador",
  abierta: "Inscripción abierta",
  cerrada: "Inscripción cerrada",
  finalizada: "Finalizada",
};

/** Edad cumplida en una fecha (misma cuenta que audition_age en la base). */
export function ageAt(nacimiento: string, fecha: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(nacimiento);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let edad = fecha.getUTCFullYear() - y;
  const antes = fecha.getUTCMonth() + 1 < mo || (fecha.getUTCMonth() + 1 === mo && fecha.getUTCDate() < d);
  if (antes) edad--;
  return edad;
}

/** Lugares que quedan en un horario. */
export function lugares(cupo: number, ocupados: number): number {
  return Math.max(0, cupo - ocupados);
}

/** Promedio legible ("4.5" o "—"). */
export function score(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === "") return "—";
  const v = Number(n);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

// ──────── Audiciones 2.0 (0037) ────────

export type AuditionOptions = {
  pedir_tutor: boolean;
  autorizacion_escuela: boolean;
  pedir_foto: boolean;
  elegir_horario: boolean;
  visibilidad: "publica" | "enlace";
  numeracion: "llegada" | "previa";
};

/** Plantillas para crear una convocatoria con las opciones ya puestas. */
export const PLANTILLAS: Record<string, { label: string; descripcion: string; opciones: AuditionOptions }> = {
  abierta: {
    label: "Audición abierta",
    descripcion: "Para todo público: foto, horario a elegir y datos del tutor si es menor.",
    opciones: { pedir_tutor: true, autorizacion_escuela: false, pedir_foto: true, elegir_horario: true, visibilidad: "publica", numeracion: "llegada" },
  },
  escuela: {
    label: "Audición en escuela",
    descripcion: "Alumnos de una escuela: sin datos de papás (la escuela ya tiene su autorización), solo con enlace y lista en orden previo.",
    opciones: { pedir_tutor: false, autorizacion_escuela: true, pedir_foto: false, elegir_horario: false, visibilidad: "enlace", numeracion: "previa" },
  },
  bailarines: {
    label: "Convocatoria de bailarines",
    descripcion: "Llamado general: foto, horario a elegir y número en orden previo para pasar por grupos.",
    opciones: { pedir_tutor: true, autorizacion_escuela: false, pedir_foto: true, elegir_horario: true, visibilidad: "publica", numeracion: "previa" },
  },
};

export type DayRow = { checked_in_at: string | null; entered_at: string | null; finished_at: string | null; estado: string };
export type DayStatus = "pendiente" | "llego" | "en_sala" | "termino" | "no_cumple";

/** En qué paso del día va cada aspirante. */
export function dayStatus(r: DayRow): DayStatus {
  if (r.finished_at) return "termino";
  if (r.entered_at) return "en_sala";
  if (r.checked_in_at) return "llego";
  return r.estado === "no_cumple" ? "no_cumple" : "pendiente";
}

export const DAY_LABEL: Record<DayStatus, { label: string; cls: string }> = {
  pendiente: { label: "No ha llegado", cls: "bg-[#2b2f3a] text-texto-3" },
  llego: { label: "Esperando", cls: "bg-[#5a4313] text-[#fde68a]" },
  en_sala: { label: "En sala", cls: "bg-[#1e3a8a] text-[#dbeafe]" },
  termino: { label: "Terminó", cls: "bg-[#14532d] text-[#bbf7d0]" },
  no_cumple: { label: "No cumple", cls: "bg-[#5a1a22] text-[#fecdd3]" },
};

/** Resumen del día: cuántos en cada paso y quién sigue (primero en espera, en orden de la lista). */
export function daySummary<T extends DayRow>(rows: T[]): { pendiente: number; llego: number; en_sala: number; termino: number; sigue: T | null } {
  const out = { pendiente: 0, llego: 0, en_sala: 0, termino: 0, sigue: null as T | null };
  for (const r of rows) {
    const s = dayStatus(r);
    if (s === "no_cumple") continue;
    out[s]++;
    if (s === "llego" && !out.sigue) out.sigue = r;
  }
  return out;
}

/** Hora corta en CDMX ("10:42"). */
export function hora(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Mexico_City" }).format(new Date(iso));
}

/** Minutos entre dos momentos (para "estuvo 7 min"). */
export function minutos(desde: string | null, hasta: string | null): number | null {
  if (!desde || !hasta) return null;
  return Math.max(0, Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / 60000));
}

/** De dónde es un enlace de video (para la etiqueta). Solo https. */
export function videoSource(url: string): "youtube" | "drive" | "otro" | null {
  let u: URL;
  try { u = new URL(url.trim()); } catch { return null; }
  if (u.protocol !== "https:") return null;
  const h = u.hostname.replace(/^www\./, "");
  if (h === "youtu.be" || h.endsWith("youtube.com")) return "youtube";
  if (h === "drive.google.com") return "drive";
  return "otro";
}
