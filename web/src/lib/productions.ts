import type { BeneficioCorto } from "@/lib/beneficios-rules";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { themeFromKit, type KitColumns, type ProductionTheme } from "@/lib/themes";
export { themeProblems, themeStyle, type ProductionTheme } from "@/lib/themes";
import { clasificar, elegirPortada, ordenarObras, type ConEstado, type Featured } from "@/lib/home-rules";
import { mayus } from "@/lib/dates";
import { asientosOcupados } from "@/lib/ocupados";
import { elegir, POSTER_COLUMNS, type PosterColumns, type Uso } from "@/lib/poster";

// ─── Datos de producciones ────────────────────────────────────────────────
// Todo sale de la base (plantilla: migración 0029) con la sesión del
// visitante: las reglas RLS deciden qué se ve. Las páginas públicas además
// filtran por estado, para que el staff con sesión no vea borradores ahí.

export type Production = KitColumns & PosterColumns & {
  id: string;
  /** 0120: sin publicar, el público no ve funciones, fechas ni cuenta regresiva. */
  funciones_publicadas?: boolean;
  /** 0120: 'web' (cuenta, orden y checkout), 'hibrido' (eliges asientos → WhatsApp) o 'whatsapp' (todo por WhatsApp). */
  modo_venta?: "web" | "hibrido" | "whatsapp";
  /** 0120: precios visibles en la página de la obra. */
  mostrar_precios?: boolean;
  /** 0120: precios y total visibles al apartar. */
  mostrar_total?: boolean;
  nombre: string;
  venue: string | null;
  /** Temporada (texto libre, "2027"). */
  temporada?: string | null;
  price: number;
  on_sale: boolean;
  concluded: boolean;
  /** La elegida para la portada (0066). */
  destacada?: boolean;
  created_at: string;
  estado: string;
};

const PUBLIC_STATES = ["publicada", "archivada"];

/** URL pública de una foto del perfil profesional (bucket `perfiles`, 0057). */
export function perfilUrl(path: string): string {
  return `${env.supabaseUrl}/storage/v1/object/public/perfiles/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** URL pública de una imagen del bucket `producciones` (o archivo propio de la web si empieza con "/"). */
export function assetUrl(path: string): string {
  if (path.startsWith("/")) return path;
  return `${env.supabaseUrl}/storage/v1/object/public/producciones/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export function getTheme(p: KitColumns): ProductionTheme | null {
  return themeFromKit(p, assetUrl);
}

/** Póster oficial (0093) para ese lugar, ya como URL; null = usar la imagen de ambiente. */
export function posterUrl(p: PosterColumns | null | undefined, uso: Uso): { url: string; info: boolean } | null {
  const e = elegir(p, uso);
  return e ? { url: assetUrl(e.path), info: e.info } : null;
}

export type Performance = {
  id: string;
  starts_at: string | null;
  venue: string | null;
  on_sale: boolean;
  /** 0076: hasta esta fecha solo compra el Club Fan. */
  preventa_hasta?: string | null;
  /** 0118: antes de esta fecha nadie compra en línea (con preventa_hasta, abre para el Club Fan). */
  preventa_desde?: string | null;
};

export type ZonePrice = { nombre: string; price: number; /** Color de la zona en el mapa (0062). */ color?: string | null; /** Orden de la zona (0117). */ orden?: number;
  /** Lo que incluye la zona además del lugar (0122). */ beneficios?: BeneficioCorto[] };

const PRODUCTION_COLUMNS =
  `id, nombre, venue, temporada, price, on_sale, concluded, destacada, created_at, estado, frase, color_fondo, color_superficie, color_texto, color_acento, logo_path, ambiente_path, funciones_publicadas, modo_venta, mostrar_precios, mostrar_total, ${POSTER_COLUMNS}` as const;

export type PublicProduction = ConEstado<Production>;

export type HomeData = {
  /** Cartelera → Próximamente → Archivo (ver home-rules.ts). */
  productions: PublicProduction[];
  featured: Featured<Production> | null;
};

export async function getHomeData(): Promise<HomeData> {
  const supabase = await createClient();
  const [prods, perfs, desde] = await Promise.all([
    supabase.from("productions").select(PRODUCTION_COLUMNS).in("estado", PUBLIC_STATES),
    supabase.from("performances").select("production_id, starts_at, on_sale").is("cancelada_at", null),
    supabase.rpc("productions_desde"),
  ]);
  if (prods.error) throw new Error(`No se pudieron cargar las producciones: ${prods.error.message}`);
  // "Desde $" con el precio real de las funciones que vienen (0088), no la columna vieja de la 1.0.
  const minimo = new Map(((desde.data ?? []) as { production_id: string; desde: number }[]).map((r) => [r.production_id, Number(r.desde)]));
  const conPrecio = ((prods.data ?? []) as Production[]).map((p) => ({ ...p, price: minimo.get(p.id) ?? 0 }));
  // 0120: funciones sin publicar no cuentan (ni para el equipo con sesión): sin fechas ni cuenta regresiva.
  const publicadas = new Set(conPrecio.filter((p) => p.funciones_publicadas !== false).map((p) => p.id));
  const productions = ordenarObras(clasificar(conPrecio, (perfs.data ?? []).filter((f) => publicadas.has(f.production_id as string))));
  return { productions, featured: elegirPortada(productions) };
}

export async function getProduction(id: string, opts: { includeDrafts?: boolean } = {}) {
  const supabase = await createClient();
  const [prod, perfs] = await Promise.all([
    supabase
      .from("productions")
      .select(PRODUCTION_COLUMNS)
      .eq("id", id)
      .in("estado", opts.includeDrafts ? ["borrador", "publicada", "archivada", "cancelada", "oculta"] : PUBLIC_STATES)
      .maybeSingle(),
    supabase
      .from("performances")
      .select("id, starts_at, venue, on_sale, preventa_hasta, preventa_desde")
      .eq("production_id", id)
      .is("cancelada_at", null)
      .order("starts_at", { nullsFirst: false }),
  ]);
  if (prod.error) throw new Error(prod.error.message);
  if (!prod.data) return null;
  // 0120: con las funciones sin publicar la página pública no muestra ninguna (la vista previa del equipo sí).
  const funciones = opts.includeDrafts || (prod.data as Production).funciones_publicadas !== false ? (perfs.data ?? []) : [];

  // Precios por zona: la base solo los muestra para funciones en venta.
  const onSaleIds = funciones.filter((p) => p.on_sale).map((p) => p.id);
  let prices: ZonePrice[] = [];
  if (onSaleIds.length) {
    const { data } = await supabase
      .from("performance_price_categories")
      .select("price, price_categories(nombre, color, orden)")
      .in("performance_id", onSaleIds);
    const byZone = new Map<string, ZonePrice>();
    for (const row of data ?? []) {
      const cat = row.price_categories as unknown as { nombre: string; color: string | null; orden: number | null } | null;
      if (!cat) continue;
      const price = Number(row.price);
      const prev = byZone.get(cat.nombre);
      if (prev === undefined || price < prev.price) byZone.set(cat.nombre, { nombre: cat.nombre, price, color: cat.color, orden: cat.orden ?? 0 });
    }
    prices = [...byZone.values()].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || b.price - a.price);
    // 0122: beneficios de cada zona (los activos; la base no da los ocultos al público).
    const porNombre = await beneficiosPorNombreDeZona(id);
    prices = prices.map((z) => ({ ...z, beneficios: porNombre.get(z.nombre) ?? [] }));
  }

  return {
    production: prod.data as Production,
    performances: funciones as Performance[],
    prices,
  };
}

/** Beneficios activos de la obra agrupados por nombre de zona (0122). */
export async function beneficiosPorNombreDeZona(pid: string): Promise<Map<string, BeneficioCorto[]>> {
  const supabase = await createClient();
  const { data } = await supabase.from("zona_beneficios")
    .select("tipo, nombre, detalle, minutos_antes, cupo, funciones, orden, activo, entrega, entrega_dias, zona_beneficio_zonas(price_categories(nombre))")
    .eq("production_id", pid).eq("activo", true).order("orden").order("created_at");
  const m = new Map<string, BeneficioCorto[]>();
  for (const b of (data ?? []) as unknown as (BeneficioCorto & { zona_beneficio_zonas: { price_categories: { nombre: string } | null }[] })[]) {
    const { zona_beneficio_zonas: zs, ...corto } = b;
    for (const z of zs) if (z.price_categories) m.set(z.price_categories.nombre, [...(m.get(z.price_categories.nombre) ?? []), corto]);
  }
  return m;
}

export function formatPerformanceDate(iso: string | null): string {
  if (!iso) return "Fecha por anunciar";
  return mayus(new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Mexico_City",
  }).format(new Date(iso)));
}

export function formatPrice(n: number): string {
  return `$${n.toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;
}

/** Una función con su producción, para la página de compra. */
export async function getPerformanceForSale(performanceId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("performances")
    .select(`id, starts_at, venue, on_sale, preventa_hasta, preventa_desde, production_id, productions(${PRODUCTION_COLUMNS})`)
    .eq("id", performanceId)
    .maybeSingle();
  if (error || !data) return null;
  const production = data.productions as unknown as Production | null;
  if (!production) return null;
  return {
    performance: { id: data.id, starts_at: data.starts_at, venue: data.venue, on_sale: data.on_sale, preventa_hasta: data.preventa_hasta, preventa_desde: data.preventa_desde } as Performance,
    production,
  };
}

/** Fotos de la galería pública de una obra (tabla gallery_photos + Storage `gallery`). */
export async function getGallery(productionId: string): Promise<{ id: string; url: string; funcion: boolean }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("gallery_photos")
    .select("id, path, performance_id")
    .eq("production_id", productionId)
    .eq("kind", "galeria")
    .order("sort_order");
  return (data ?? []).map((r) => ({ id: r.id, url: supabase.storage.from("gallery").getPublicUrl(r.path).data.publicUrl, funcion: !!r.performance_id }));
}

/** Capacidad y lugares ocupados de cada función (mapa + entrada general). Solo lectura. */
export async function performanceOccupancy(ids: string[]): Promise<Map<string, { capacidad: number; ocupados: number }>> {
  const supabase = await createClient();
  const out = new Map<string, { capacidad: number; ocupados: number }>();
  await Promise.all(
    ids.map(async (id) => {
      const [cap, taken, general] = await Promise.all([
        supabase.rpc("performance_capacity", { pfid: id }),
        asientosOcupados(supabase, id),
        supabase.rpc("general_availability", { target_performance_id: id }),
      ]);
      if (cap.error || taken.error || general.error) return; // sin datos: la fila no muestra estado
      const ocupadosGeneral = ((general.data ?? []) as { ocupados: number }[]).reduce((n, z) => n + Number(z.ocupados), 0);
      out.set(id, { capacidad: Number(cap.data ?? 0), ocupados: ((taken.data ?? []) as unknown[]).length + ocupadosGeneral });
    }),
  );
  return out;
}
