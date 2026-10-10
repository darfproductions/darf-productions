import { createClient } from "@/lib/supabase/server";
export { getTheme, themeProblems, themeStyle, THEMES, type ProductionTheme } from "@/lib/themes";
import { lastPerformanceDates, pickFeatured, sortForHome, type Featured } from "@/lib/home-rules";

// ─── Datos de producciones ────────────────────────────────────────────────
// Lee de las tablas existentes (productions, performances, precios) con la
// sesión del visitante: las reglas RLS deciden qué se ve.

export type Production = {
  id: string;
  nombre: string;
  venue: string | null;
  price: number;
  on_sale: boolean;
  concluded: boolean;
  created_at: string;
};

export type Performance = {
  id: string;
  starts_at: string | null;
  venue: string | null;
  on_sale: boolean;
};

export type ZonePrice = { nombre: string; price: number };

const PRODUCTION_COLUMNS = "id, nombre, venue, price, on_sale, concluded, created_at";

export type HomeData = {
  /** En cartelera primero; luego el archivo, de la más reciente a la más antigua. */
  productions: Production[];
  featured: Featured<Production> | null;
};

export async function getHomeData(): Promise<HomeData> {
  const supabase = await createClient();
  const [prods, perfs] = await Promise.all([
    supabase.from("productions").select(PRODUCTION_COLUMNS),
    supabase.from("performances").select("production_id, starts_at"),
  ]);
  if (prods.error) throw new Error(`No se pudieron cargar las producciones: ${prods.error.message}`);
  const lastDates = lastPerformanceDates(perfs.data ?? []);
  const productions = sortForHome((prods.data ?? []) as Production[], lastDates);
  return { productions, featured: pickFeatured(productions) };
}

export async function getProduction(id: string) {
  const supabase = await createClient();
  const [prod, perfs] = await Promise.all([
    supabase
      .from("productions")
      .select(PRODUCTION_COLUMNS)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("performances")
      .select("id, starts_at, venue, on_sale")
      .eq("production_id", id)
      .order("starts_at", { nullsFirst: false }),
  ]);
  if (prod.error) throw new Error(prod.error.message);
  if (!prod.data) return null;

  // Precios por zona: la base solo los muestra para funciones en venta.
  const onSaleIds = (perfs.data ?? []).filter((p) => p.on_sale).map((p) => p.id);
  let prices: ZonePrice[] = [];
  if (onSaleIds.length) {
    const { data } = await supabase
      .from("performance_price_categories")
      .select("price, price_categories(nombre)")
      .in("performance_id", onSaleIds);
    const byZone = new Map<string, number>();
    for (const row of data ?? []) {
      const cat = row.price_categories as unknown as { nombre: string } | null;
      if (!cat) continue;
      const price = Number(row.price);
      const prev = byZone.get(cat.nombre);
      if (prev === undefined || price < prev) byZone.set(cat.nombre, price);
    }
    prices = [...byZone].map(([nombre, price]) => ({ nombre, price })).sort((a, b) => b.price - a.price);
  }

  return {
    production: prod.data as Production,
    performances: (perfs.data ?? []) as Performance[],
    prices,
  };
}

export function formatPerformanceDate(iso: string | null): string {
  if (!iso) return "Fecha por anunciar";
  return new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Mexico_City",
  }).format(new Date(iso));
}

export function formatPrice(n: number): string {
  return `$${n.toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;
}

/** Una función con su producción, para la página de compra. */
export async function getPerformanceForSale(performanceId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("performances")
    .select("id, starts_at, venue, on_sale, production_id, productions(id, nombre, venue, price, on_sale, concluded, created_at)")
    .eq("id", performanceId)
    .maybeSingle();
  if (error || !data) return null;
  const production = data.productions as unknown as Production | null;
  if (!production) return null;
  return {
    performance: { id: data.id, starts_at: data.starts_at, venue: data.venue, on_sale: data.on_sale } as Performance,
    production,
  };
}
