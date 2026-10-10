// Reglas de la portada. Funciones puras (sin base de datos ni servidor) para
// poder probarlas: ver home-rules.test.ts.

type Rankable = { id: string; concluded: boolean; created_at: string };

export type Featured<T extends Rankable> = {
  production: T;
  /** "cartelera": hay obra activa. "archivo": no hay; se destaca la más reciente. */
  mode: "cartelera" | "archivo";
};

/** Última fecha de función (con fecha) por producción. */
export function lastPerformanceDates(
  rows: { production_id: string; starts_at: string | null }[],
): Map<string, string> {
  const last = new Map<string, string>();
  for (const r of rows) {
    if (!r.starts_at) continue;
    const prev = last.get(r.production_id);
    if (!prev || new Date(r.starts_at) > new Date(prev)) last.set(r.production_id, r.starts_at);
  }
  return last;
}

/** Fecha para ordenar: última función con fecha; si no hay, alta de la producción. */
function recency(p: Rankable, lastDates: Map<string, string>): number {
  return new Date(lastDates.get(p.id) ?? p.created_at).getTime();
}

/** En cartelera primero; dentro de cada grupo, la más reciente primero. */
export function sortForHome<T extends Rankable>(productions: T[], lastDates: Map<string, string>): T[] {
  return [...productions].sort((a, b) => {
    if (a.concluded !== b.concluded) return a.concluded ? 1 : -1;
    return recency(b, lastDates) - recency(a, lastDates);
  });
}

/**
 * Producción destacada de la portada. Espera la lista ya ordenada por
 * sortForHome: si hay obra en cartelera, es ella; si no, la más reciente del
 * archivo (cuando no hay obra en cartelera, el spot se lo lleva el archivo).
 */
export function pickFeatured<T extends Rankable>(sorted: T[]): Featured<T> | null {
  const first = sorted[0];
  if (!first) return null;
  return { production: first, mode: first.concluded ? "archivo" : "cartelera" };
}
