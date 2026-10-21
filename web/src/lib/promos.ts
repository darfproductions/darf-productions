import { createClient } from "@/lib/supabase/server";
import { conPromo, type PromoZona } from "@/lib/promo-rules";

// Promos automáticas por función (0118): la base dice cuáles están vigentes y la compra cobra con ellas.

export type { PromoZona };

/** Promos vigentes de la obra: por función, el % de cada zona (y el nombre de la mayor). */
export async function getPromos(pid: string): Promise<Map<string, PromoZona[]>> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("promos_obra", { pid });
  const out = new Map<string, PromoZona[]>();
  for (const r of (data ?? []) as { performance_id: string; price_category_id: string; percent: number; nombre: string; hasta: string | null }[]) {
    const lista = out.get(r.performance_id) ?? [];
    lista.push({ zona: r.price_category_id, percent: Number(r.percent), nombre: r.nombre, hasta: r.hasta });
    out.set(r.performance_id, lista);
  }
  return out;
}

export { conPromo };
