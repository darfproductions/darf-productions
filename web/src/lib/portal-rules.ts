// Portal del integrante en 6 bloques (0141): qué sigue hoy, documentos, materiales, avisos, pedir o avisar y mi obra.
// Puro, con pruebas en portal-rules.test.ts.
import { isoMx } from "@/lib/dates";
import type { Rehearsal } from "@/lib/rehearsal-rules";

export type Proximo = { r: Rehearsal; esHoy: boolean; enCurso: boolean };

/** El siguiente ensayo o llamado que no ha terminado (si no tiene hora de fin, se supone que dura 3 horas). */
export function proximoEvento(ensayos: Rehearsal[], ahora: Date = new Date()): Proximo | null {
  const fin = (r: Rehearsal) => (r.termina ? new Date(r.termina).getTime() : new Date(r.inicia).getTime() + 3 * 3600_000);
  const r = [...ensayos].filter((x) => x.estado !== "cancelado" && fin(x) > ahora.getTime()).sort((a, b) => a.inicia.localeCompare(b.inicia))[0];
  if (!r) return null;
  const inicio = new Date(r.inicia).getTime();
  return { r, esHoy: isoMx(new Date(r.inicia)) === isoMx(ahora), enCurso: inicio <= ahora.getTime() };
}

/** "Hoy", "En curso" o "Próximo". */
export function etiquetaProximo(p: Proximo | null): string {
  if (!p) return "Próximo";
  return p.enCurso ? "En curso" : p.esHoy ? "Hoy" : "Próximo";
}

export const TIPO_LUGAR: Record<string, string> = { teatro: "Teatro", ensayo: "Ensayos", audicion: "Audiciones", otro: "Lugar" };

export type Hito = { nombre: string; mes: string | null; dia: string | null; notas: string | null };

/** "1 de marzo de 2027" si tiene día; si no, "Marzo de 2027". */
export function textoHito(h: Pick<Hito, "mes" | "dia">): string {
  const tz = { timeZone: "UTC" } as const;
  if (h.dia) return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", year: "numeric", ...tz }).format(new Date(`${h.dia}T12:00:00Z`));
  if (h.mes) {
    const m = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", ...tz }).format(new Date(`${h.mes}T12:00:00Z`));
    return m.charAt(0).toUpperCase() + m.slice(1);
  }
  return "";
}

/** Solo los hitos que no han pasado (los de un mes sin día se quedan todo el mes). */
export function hitosPendientes(hitos: Hito[], hoy: string = isoMx()): Hito[] {
  return hitos.filter((h) => (h.dia ? h.dia >= hoy : h.mes ? h.mes.slice(0, 7) >= hoy.slice(0, 7) : true));
}

export type BloquePortal = { id: string; label: string; aviso?: number };

/** Las pestañas del portal: siempre las 6, en este orden; el número de avisos sin leer va en Avisos. */
export function bloquesPortal(o: { sinLeer: number; pendientes: number }): BloquePortal[] {
  return [
    { id: "hoy", label: "Hoy" },
    { id: "docs", label: "Mis documentos", aviso: o.pendientes || undefined },
    { id: "materiales", label: "Materiales" },
    { id: "avisos", label: "Avisos", aviso: o.sinLeer || undefined },
    { id: "pedir", label: "Pedir o avisar" },
    { id: "obra", label: "Mi obra" },
  ];
}
