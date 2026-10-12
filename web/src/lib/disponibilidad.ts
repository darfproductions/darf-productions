// Estado de venta de una función para la página de la obra (guía de UI). Función pura:
// disponibilidad.test.ts. Los números salen de performance_capacity, get_taken_seats y
// general_availability (0023, 0055, 0056), que el público ya puede consultar.

export type EstadoFuncion = "disponible" | "ultimos" | "agotado";

/** "Últimos lugares" cuando queda el 10 % o menos de la capacidad. */
export const UMBRAL_ULTIMOS = 0.1;

export function estadoFuncion(capacidad: number, ocupados: number): EstadoFuncion | null {
  if (!Number.isFinite(capacidad) || capacidad <= 0) return null; // sin mapa ni cupo: no se sabe
  const libres = Math.max(0, capacidad - Math.max(0, ocupados));
  if (libres === 0) return "agotado";
  return libres / capacidad <= UMBRAL_ULTIMOS ? "ultimos" : "disponible";
}

/** Texto y color del punto (el texto usa el color de la obra: se lee en temas claros y oscuros). */
export const ETIQUETA_FUNCION: Record<EstadoFuncion, { texto: string; punto: string }> = {
  disponible: { texto: "Disponible", punto: "bg-exito" },
  ultimos: { texto: "Últimos lugares", punto: "bg-aviso" },
  agotado: { texto: "Agotado", punto: "bg-current opacity-60" },
};

/** Partes de la fecha para el bloque de cada función: "vie", "22", "nov", "20:00 h" (hora de Querétaro). */
export function partesFuncion(iso: string): { dia: string; numero: string; mes: string; hora: string } {
  const partes = new Intl.DateTimeFormat("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "America/Mexico_City",
  }).formatToParts(new Date(iso));
  const v = (t: Intl.DateTimeFormatPartTypes) => (partes.find((x) => x.type === t)?.value ?? "").replace(".", "");
  return { dia: v("weekday"), numero: v("day"), mes: v("month"), hora: `${v("hour")}:${v("minute")} h` };
}
