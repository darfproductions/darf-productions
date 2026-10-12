// Inicio del panel "Tu día" (Bloque 2, migración 0061). Funciones puras: panel-home-rules.test.ts.

export type PendienteTipo = "ordenes" | "solicitudes" | "ofertas" | "documentos" | "advertencias" | "evaluaciones" | "notas_equipo" | "avisos_equipo";
export type Pendiente = { tipo: PendienteTipo; production_id: string | null; n: number };

const TEXTO: Record<PendienteTipo, [string, string]> = {
  ordenes: ["orden por aprobar", "órdenes por aprobar"],
  solicitudes: ["solicitud de audición sin revisar", "solicitudes de audición sin revisar"],
  ofertas: ["oferta de papel sin respuesta", "ofertas de papel sin respuesta"],
  documentos: ["documento por recibir", "documentos por recibir"],
  advertencias: ["llamada de atención esta semana", "llamadas de atención esta semana"],
  evaluaciones: ["periodo de evaluación sin publicar", "periodos de evaluación sin publicar"],
  notas_equipo: ["nota de dirección para ti", "notas de dirección para ti"],
  avisos_equipo: ["aviso del equipo sin leer", "avisos del equipo sin leer"],
};
const ORDEN: PendienteTipo[] = ["notas_equipo", "ordenes", "solicitudes", "ofertas", "documentos", "evaluaciones", "avisos_equipo", "advertencias"];

export function pendienteTexto(p: Pendiente): string {
  return `${p.n} ${TEXTO[p.tipo][p.n === 1 ? 0 : 1]}`;
}

/** A dónde se resuelve cada pendiente. */
export function pendienteHref(p: Pendiente): string {
  if (p.tipo === "notas_equipo" || p.tipo === "avisos_equipo") return `/cuenta/equipo/${p.production_id ?? "general"}`;
  if (!p.production_id) return "/panel/audiciones";
  const base = `/panel/producciones/${p.production_id}`;
  switch (p.tipo) {
    case "ordenes": return `${base}/boletos?estado=pendiente`;
    case "solicitudes":
    case "ofertas": return `${base}/audiciones`;
    case "documentos":
    case "advertencias": return `${base}/expedientes`;
    case "evaluaciones": return `${base}/evaluaciones`;
  }
}

export function ordenarPendientes(xs: Pendiente[]): Pendiente[] {
  return xs.filter((x) => x.n > 0).sort((a, b) => ORDEN.indexOf(a.tipo) - ORDEN.indexOf(b.tipo) || b.n - a.n);
}

/** Fecha (año-mes-día) en Ciudad de México. */
function diaMx(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(d);
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
  const y = hoy.getFullYear();
  const base = new Date(y, hoy.getMonth(), hoy.getDate());
  let d = new Date(y, c.mes - 1, c.dia);
  if (d < base) d = new Date(y + 1, c.mes - 1, c.dia);
  return Math.round((d.getTime() - base.getTime()) / 86400000);
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
