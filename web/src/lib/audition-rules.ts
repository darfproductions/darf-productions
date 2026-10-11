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
