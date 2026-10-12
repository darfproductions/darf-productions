// Rúbrica del taller (0058). Puro, con pruebas en rubric-rules.test.ts.

export type Criterio = { id: string; nombre: string; descripcion: string | null; orden: number };
export type Nivel = { id: string; nombre: string; orden: number };
export type Periodo = { id: string; nombre: string; orden: number; publicado_at: string | null };
export type Score = { criterion_id: string; level_id: string | null; numero: number | null };

/** Promedio de los números (1 decimal); null si no hay ninguno. */
export function promedio(scores: { numero: number | null }[]): number | null {
  const ns = scores.map((s) => s.numero).filter((n): n is number => n != null && !Number.isNaN(Number(n))).map(Number);
  return ns.length ? Math.round((ns.reduce((a, b) => a + b, 0) / ns.length) * 10) / 10 : null;
}

/** Número del formulario: vacío = null; acepta coma decimal; fuera de 0–10 = error. */
export function numeroDe(v: string): { ok: true; n: number | null } | { ok: false } {
  const s = v.trim().replace(",", ".");
  if (!s) return { ok: true, n: null };
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n <= 10 ? { ok: true, n: Math.round(n * 10) / 10 } : { ok: false };
}

/** ¿Está completa? (cada criterio tiene nivel o número) */
export function completa(criterios: Criterio[], scores: Score[]): boolean {
  return criterios.length > 0 && criterios.every((c) => scores.some((s) => s.criterion_id === c.id && (s.level_id || s.numero != null)));
}

/** El siguiente alumno pendiente después de `uid` (para "Guardar y siguiente"). */
export function siguiente(ids: string[], uid: string): string | null {
  const i = ids.indexOf(uid);
  return i >= 0 && i + 1 < ids.length ? ids[i + 1] : null;
}
