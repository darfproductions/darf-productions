import { conPromo, type PromoZona } from "@/lib/promo-rules";
import { publico } from "@/lib/supabase/publico";

// Promos automáticas por función (0118): la base dice cuáles están vigentes y la compra cobra con ellas.

export type { PromoZona };

/** Promos vigentes de la obra: por función, el % de cada zona (y el nombre de la mayor). */
// Iguales para todos: guardadas 60 s (lib/supabase/publico.ts); la compra cobra con lo que diga la base al momento.
export async function getPromos(pid: string): Promise<Map<string, PromoZona[]>> {
  const data = await leerPromos(pid);
  const out = new Map<string, PromoZona[]>();
  for (const r of (data ?? []) as { performance_id: string; price_category_id: string; percent: number; nombre: string; hasta: string | null }[]) {
    const lista = out.get(r.performance_id) ?? [];
    lista.push({ zona: r.price_category_id, percent: Number(r.percent), nombre: r.nombre, hasta: r.hasta });
    out.set(r.performance_id, lista);
  }
  return out;
}
const leerPromos = publico("promos", async (supabase, pid: string) => (await supabase.rpc("promos_obra", { pid })).data as unknown[] | null);

export { conPromo };
