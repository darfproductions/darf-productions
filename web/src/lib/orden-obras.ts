/** Orden de las obras (Diego 2026-11-20): la más nueva arriba y la más vieja abajo. Primero el año de su temporada
 *  ("Temporada 2027" → 2027; si no dice, el año en que se creó) y, dentro del mismo año, la creada más recientemente
 *  primero. Así: Greased Lightning, La Familia Madrigal, Teen Beach Movie, Showman (2027), Mamma Mia! (2026),
 *  High School Musical (2025). */
export type ObraOrdenable = { temporada?: string | null; created_at?: string | null };

export function anioObra(o: ObraOrdenable): number {
  const m = /(?:19|20)\d{2}/.exec(o.temporada ?? "");
  if (m) return Number(m[0]);
  return o.created_at ? new Date(o.created_at).getUTCFullYear() : 9999;
}

export function compararObras(a: ObraOrdenable, b: ObraOrdenable): number {
  return anioObra(b) - anioObra(a) || (b.created_at ?? "").localeCompare(a.created_at ?? "");
}

export function ordenarObras<T extends ObraOrdenable>(obras: T[]): T[] {
  return [...obras].sort(compararObras);
}
