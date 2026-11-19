/** Orden de las obras (Diego 2026-11-19): de la más vieja a la más nueva. Primero el año de su temporada
 *  ("Temporada 2027" → 2027; si no dice, el año en que se creó) y, dentro del mismo año, en el orden en que se crearon.
 *  Así: High School Musical (2025), Mamma Mia! (2026), Showman, Teen Beach Movie, La Familia Madrigal, Greased Lightning. */
export type ObraOrdenable = { temporada?: string | null; created_at?: string | null };

export function anioObra(o: ObraOrdenable): number {
  const m = /(?:19|20)\d{2}/.exec(o.temporada ?? "");
  if (m) return Number(m[0]);
  return o.created_at ? new Date(o.created_at).getUTCFullYear() : 9999;
}

export function compararObras(a: ObraOrdenable, b: ObraOrdenable): number {
  return anioObra(a) - anioObra(b) || (a.created_at ?? "").localeCompare(b.created_at ?? "");
}

export function ordenarObras<T extends ObraOrdenable>(obras: T[]): T[] {
  return [...obras].sort(compararObras);
}
