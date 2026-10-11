// Reglas de ensayos que se muestran en pantalla (puras, con pruebas). La base decide
// quién está citado y quién toma asistencia (0043).

import { TIPO_CREDITO } from "@/lib/casting-rules";

export const ASISTENCIA: Record<string, { label: string; cls: string }> = {
  presente: { label: "Presente", cls: "bg-[#14532d] text-[#bbf7d0]" },
  retardo: { label: "Retardo", cls: "bg-[#5a4313] text-[#fde68a]" },
  falta: { label: "Falta", cls: "bg-[#5a1a22] text-[#fecdd3]" },
  justificada: { label: "Justificada", cls: "bg-[#1e3a8a] text-[#dbeafe]" },
};

export type Rehearsal = {
  id: string; titulo: string; inicia: string; termina: string | null; lugar: string | null; notas: string | null;
  convocatoria: "todos" | "grupos" | "personas"; grupos: string[]; personas: string[]; estado: string;
};

/** "Todo el elenco" / "Ensamble y Crew" / "3 personas". */
export function citados(r: Pick<Rehearsal, "convocatoria" | "grupos" | "personas">): string {
  if (r.convocatoria === "grupos") return r.grupos.map((g) => TIPO_CREDITO[g] ?? g).join(" y ");
  if (r.convocatoria === "personas") return r.personas.length === 1 ? "1 persona" : `${r.personas.length} personas`;
  return "Todo el elenco";
}

/** Porcentaje de asistencia (presente y retardo cuentan como asistió; justificada no cuenta en contra). */
export function porcentaje(s: { presentes: number; retardos: number; faltas: number; justificadas: number }): number | null {
  const base = s.presentes + s.retardos + s.faltas;
  if (!base) return null;
  return Math.round(((s.presentes + s.retardos) / base) * 100);
}

export function fechaEnsayo(iso: string, fin?: string | null): string {
  const f = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: "America/Mexico_City" }).format(new Date(iso));
  if (!fin) return f;
  const h = new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit", timeZone: "America/Mexico_City" }).format(new Date(fin));
  return `${f} a ${h}`;
}
