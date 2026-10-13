// Rúbrica del taller (0058). Puro, con pruebas en rubric-rules.test.ts.

export type Criterio = { id: string; nombre: string; descripcion: string | null; orden: number; compartido?: boolean };
export type Nivel = { id: string; nombre: string; orden: number };
export type Periodo = { id: string; nombre: string; orden: number; publicado_at: string | null; desde?: string | null; hasta?: string | null };
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

export type SharedScore = Score & { teacher_id: string };

/** ¿Está completa? Cada criterio tiene nivel o número; los compartidos, al menos un maestro. */
export function completa(criterios: Criterio[], scores: Score[], shared: SharedScore[] = []): boolean {
  const tiene = (s: Score) => !!s.level_id || s.numero != null;
  return criterios.length > 0 && criterios.every((c) =>
    (c.compartido ? shared : scores).some((s) => s.criterion_id === c.id && tiene(s)));
}

/** Nivel más repetido (empate: el mejor, el de menor orden). */
function moda(ids: string[], niveles: Nivel[]): string | null {
  if (!ids.length) return null;
  const n = new Map<string, number>();
  for (const id of ids) n.set(id, (n.get(id) ?? 0) + 1);
  const orden = new Map(niveles.map((l) => [l.id, l.orden]));
  return [...n.entries()].sort((a, b) => b[1] - a[1] || (orden.get(a[0]) ?? 99) - (orden.get(b[0]) ?? 99))[0][0];
}

export type FilaBoleta = { criterio: string; nivel: string | null; numero: number | null; maestros?: number };

/** Filas de la boleta: las materias tal cual; los compartidos, promedio de los maestros (y el nivel más repetido). */
export function filasBoleta(criterios: Criterio[], niveles: Nivel[], scores: Score[], shared: SharedScore[]): FilaBoleta[] {
  const nombre = new Map(niveles.map((l) => [l.id, l.nombre]));
  return criterios.map((c) => {
    if (c.compartido) {
      const xs = shared.filter((s) => s.criterion_id === c.id);
      const nivel = moda(xs.map((x) => x.level_id).filter((x): x is string => !!x), niveles);
      return { criterio: c.nombre, nivel: nivel ? nombre.get(nivel) ?? null : null, numero: promedio(xs), maestros: xs.length };
    }
    const s = scores.find((x) => x.criterion_id === c.id);
    return { criterio: c.nombre, nivel: s?.level_id ? nombre.get(s.level_id) ?? null : null, numero: s?.numero ?? null };
  });
}

export type Extras = {
  citados: number; presentes: number; retardos: number; faltas: number; justificadas: number;
  incidencias: { fecha: string; nivel: string; tipo: string; descripcion: string }[];
  notas: { maestro: string; materias: string[]; comentario: string }[];
};

/** % de asistencia del periodo: (presentes + retardos) / (presentes + retardos + faltas). */
export function asistenciaPct(x: Pick<Extras, "presentes" | "retardos" | "faltas">): number | null {
  const base = x.presentes + x.retardos + x.faltas;
  return base ? Math.round(((x.presentes + x.retardos) / base) * 100) : null;
}

/** El siguiente alumno pendiente después de `uid` (para "Guardar y siguiente"). */
export function siguiente(ids: string[], uid: string): string | null {
  const i = ids.indexOf(uid);
  return i >= 0 && i + 1 < ids.length ? ids[i + 1] : null;
}
