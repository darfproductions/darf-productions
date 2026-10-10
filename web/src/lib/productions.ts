import type { StaticImageData } from "next/image";
import { createClient } from "@/lib/supabase/server";
import showmanTitle from "@/assets/producciones/showman-title.webp";
import showmanStage from "@/assets/producciones/showman-stage.jpg";
import mmKey from "@/assets/producciones/mm-key.jpg";
import hsmTitle from "@/assets/producciones/hsm-title.webp";
import hsmCurtain from "@/assets/producciones/hsm-curtain.jpg";

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
};

export type Performance = {
  id: string;
  starts_at: string | null;
  venue: string | null;
  on_sale: boolean;
};

export type ZonePrice = { nombre: string; price: number };

export async function getProductions(): Promise<Production[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("productions")
    .select("id, nombre, venue, price, on_sale, concluded")
    .order("concluded")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`No se pudieron cargar las producciones: ${error.message}`);
  return data ?? [];
}

export async function getProduction(id: string) {
  const supabase = await createClient();
  const [prod, perfs] = await Promise.all([
    supabase
      .from("productions")
      .select("id, nombre, venue, price, on_sale, concluded")
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

// ─── Tema visual por producción (provisional) ────────────────────────────
// En la Fase 2 esto se guarda en la base y se edita desde el panel. Por ahora
// vive aquí para las tres producciones existentes.

export type ProductionTheme = {
  fondo: string;
  superficie: string;
  texto: string;
  acento: string;
  hero: StaticImageData;
  titulo?: StaticImageData;
  tagline: string;
};

const THEMES: Record<string, ProductionTheme> = {
  showman: {
    fondo: "#08101f",
    superficie: "#0f1c36",
    texto: "#f7eedb",
    acento: "#e8be45",
    hero: showmanStage,
    titulo: showmanTitle,
    tagline: "Bienvenidos al espectáculo más grande.",
  },
  mm: {
    fondo: "#0d1530",
    superficie: "#16224a",
    texto: "#f5f2fb",
    acento: "#f28ab2",
    hero: mmKey,
    tagline: "Una boda, tres posibles padres y la música de ABBA.",
  },
  hsm: {
    fondo: "#1a0607",
    superficie: "#2a0c0e",
    texto: "#fcebd0",
    acento: "#f2b544",
    hero: hsmCurtain,
    titulo: hsmTitle,
    tagline: "East High, un escenario y el valor de salirse del guion.",
  },
};

export function getTheme(id: string): ProductionTheme | null {
  return THEMES[id] ?? null;
}

/** Variables CSS que el tema de la obra sobreescribe (ver globals.css). */
export function themeStyle(theme: ProductionTheme | null): React.CSSProperties {
  if (!theme) return {};
  return {
    "--obra-fondo": theme.fondo,
    "--obra-superficie": theme.superficie,
    "--obra-texto": theme.texto,
    "--obra-acento": theme.acento,
  } as React.CSSProperties;
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
