// Inicio del panel "Tu día" (Bloque 2, migración 0061). Funciones puras: panel-home-rules.test.ts.
import { partesMx } from "@/lib/dates";

export type PendienteTipo = "ordenes" | "pagos_evento" | "solicitudes" | "solicitudes_elenco" | "ofertas" | "documentos" | "adeudos" | "decision" | "advertencias" | "evaluaciones" | "notas_equipo" | "avisos_equipo";
/** ref_id/ref_titulo (0085): la convocatoria o el evento al que se refiere, para ir directo. */
export type Pendiente = { tipo: PendienteTipo; production_id: string | null; n: number; ref_id?: string | null; ref_titulo?: string | null };

const TEXTO: Record<PendienteTipo, [string, string]> = {
  ordenes: ["orden de boletos por aprobar", "órdenes de boletos por aprobar"],
  pagos_evento: ["pago de evento por revisar", "pagos de evento por revisar"],
  adeudos: ["persona con pagos vencidos", "personas con pagos vencidos"],
  decision: ["persona requiere decisión (advertencias)", "personas requieren decisión (advertencias)"],
  solicitudes: ["solicitud de audición sin revisar", "solicitudes de audición sin revisar"],
  solicitudes_elenco: ["solicitud del elenco por revisar", "solicitudes del elenco por revisar"],
  ofertas: ["oferta de papel sin respuesta", "ofertas de papel sin respuesta"],
  documentos: ["documento subido por revisar", "documentos subidos por revisar"],
  advertencias: ["llamada de atención esta semana", "llamadas de atención esta semana"],
  evaluaciones: ["periodo de evaluación sin publicar", "periodos de evaluación sin publicar"],
  notas_equipo: ["nota de dirección para ti", "notas de dirección para ti"],
  avisos_equipo: ["aviso del equipo sin leer", "avisos del equipo sin leer"],
};
const ORDEN: PendienteTipo[] = ["notas_equipo", "ordenes", "pagos_evento", "solicitudes_elenco", "decision", "solicitudes", "ofertas", "documentos", "adeudos", "evaluaciones", "avisos_equipo", "advertencias"];

export function pendienteTexto(p: Pendiente): string {
  return `${p.n} ${TEXTO[p.tipo][p.n === 1 ? 0 : 1]}`;
}

/** A dónde se resuelve cada pendiente: directo a la acción (0085). */
export function pendienteHref(p: Pendiente): string {
  if (p.tipo === "notas_equipo" || p.tipo === "avisos_equipo") return `/cuenta/equipo/${p.production_id ?? "general"}`;
  if (p.tipo === "pagos_evento") return p.ref_id ? `/panel/eventos#e-${p.ref_id}` : "/panel/eventos";
  if (p.tipo === "solicitudes") return p.ref_id ? `/panel/audiciones/${p.ref_id}/solicitudes` : "/panel/audiciones";
  if (!p.production_id) return "/panel/audiciones";
  const base = `/panel/producciones/${p.production_id}`;
  switch (p.tipo) {
    case "ordenes": return `${base}/boletos?estado=pendiente`;
    case "ofertas": return `${base}/elenco`;
    case "documentos": return `${base}/expedientes?docs=subidos`;
    case "adeudos": return `${base}/expedientes/adeudos?ver=vencidos`;
    case "decision": return `${base}/expedientes#decision`;
    case "advertencias": return `${base}/expedientes`;
    case "evaluaciones": return `${base}/evaluaciones`;
    case "solicitudes_elenco": return `${base}/solicitudes`;
  }
}

/** Pendientes agrupados por obra (null = DARF / general), en el orden de importancia. */
export function porObra(xs: Pendiente[]): { production_id: string | null; items: Pendiente[]; total: number }[] {
  const grupos = new Map<string | null, Pendiente[]>();
  for (const p of ordenarPendientes(xs)) grupos.set(p.production_id, [...(grupos.get(p.production_id) ?? []), p]);
  return [...grupos.entries()].map(([production_id, items]) => ({ production_id, items, total: items.reduce((s, x) => s + x.n, 0) }));
}

/** Total para el número del menú. */
export function totalPendientes(xs: Pendiente[]): number {
  return xs.reduce((s, x) => s + (x.n > 0 ? x.n : 0), 0);
}

export function ordenarPendientes(xs: Pendiente[]): Pendiente[] {
  return xs.filter((x) => x.n > 0).sort((a, b) => ORDEN.indexOf(a.tipo) - ORDEN.indexOf(b.tipo) || b.n - a.n);
}

/** Fecha (año-mes-día) en Ciudad de México. */
function diaMx(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(d);
}

/** ¿Es hoy (en CDMX)? */
export function esHoy(iso: string, ahora: Date = new Date()): boolean {
  return diaMx(new Date(iso)) === diaMx(ahora);
}

/** "Hoy · 19:00", "Mañana · 10:00" o "jue 15 oct · 19:00". */
export function cuando(iso: string, ahora: Date = new Date()): string {
  const d = new Date(iso);
  const hora = new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  const hoy = diaMx(ahora);
  const manana = diaMx(new Date(ahora.getTime() + 86400000));
  const dia = diaMx(d);
  if (dia === hoy) return `Hoy · ${hora}`;
  if (dia === manana) return `Mañana · ${hora}`;
  const f = new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", weekday: "short", day: "numeric", month: "short" }).format(d).replace(/\./g, "").replace(" de ", " ");
  return `${f} · ${hora}`;
}

/** Días que faltan para el cumpleaños (0 = hoy). */
export function diasParaCumple(c: { dia: number; mes: number }, hoy: Date = new Date()): number {
  const h = partesMx(hoy);
  const base = Date.UTC(h.y, h.m - 1, h.d);
  let d = Date.UTC(h.y, c.mes - 1, c.dia);
  if (d < base) d = Date.UTC(h.y + 1, c.mes - 1, c.dia);
  return Math.round((d - base) / 86400000);
}

/** Cumpleaños de los próximos `dias` días, sin repetir persona, del más cercano al más lejano. */
export function cumplesProximos<T extends { user_id: string; nombre: string; dia: number; mes: number }>(xs: T[], dias = 7, hoy: Date = new Date()): (T & { faltan: number })[] {
  const vistos = new Set<string>();
  return xs
    .filter((x) => (vistos.has(x.user_id) ? false : (vistos.add(x.user_id), true)))
    .map((x) => ({ ...x, faltan: diasParaCumple(x, hoy) }))
    .filter((x) => x.faltan < dias)
    .sort((a, b) => a.faltan - b.faltan || a.nombre.localeCompare(b.nombre));
}

/** Pestaña de la obra donde se resuelve cada pendiente (para los números en las pestañas, 0085). */
const PESTANA: Partial<Record<PendienteTipo, string>> = {
  ordenes: "boletos", pagos_evento: "fanzone", solicitudes: "audiciones", solicitudes_elenco: "solicitudes", ofertas: "elenco",
  documentos: "expedientes", adeudos: "expedientes", decision: "expedientes", evaluaciones: "evaluaciones",
};

/** Pendientes de una obra sumados por pestaña. */
export function conteoPorPestana(xs: Pendiente[], pid: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of xs) {
    const tab = PESTANA[p.tipo];
    if (p.production_id === pid && tab && p.n > 0) out[tab] = (out[tab] ?? 0) + p.n;
  }
  return out;
}
