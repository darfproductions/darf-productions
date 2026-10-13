// La API de Supabase entrega como máximo 1,000 filas por consulta. Para listas que pueden ser más
// grandes (órdenes de toda una temporada, asientos de un teatro grande, pagos), se piden por partes.
const PAGINA = 1000;

type Resultado<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** Junta todas las filas: `pide(desde, hasta)` debe aplicar `.range(desde, hasta)` con un orden fijo. */
export async function todasLasFilas<T>(pide: (desde: number, hasta: number) => Resultado<T>, maximo = 50000): Promise<{ data: T[]; error: { message: string } | null }> {
  const out: T[] = [];
  for (let desde = 0; desde < maximo; desde += PAGINA) {
    const { data, error } = await pide(desde, desde + PAGINA - 1);
    if (error) return { data: out, error };
    out.push(...(data ?? []));
    if (!data || data.length < PAGINA) break;
  }
  return { data: out, error: null };
}
