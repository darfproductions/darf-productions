import { clasificar, elegirPortada, ordenarObras, type ConEstado, type Featured } from "@/lib/home-rules";
import { elegir, POSTER_COLUMNS, type PosterColumns, type Uso } from "@/lib/poster";
import type { KitColumns } from "@/lib/themes";
import { env } from "~/lib/env";
import { supabase } from "~/lib/supabase";

// Lecturas de la app. Son las mismas consultas que hace la web (web/src/lib/productions.ts y la página de cuenta),
// directo a Supabase: las reglas RLS de la base deciden qué ve cada quien, igual que en la web.

export type Obra = KitColumns & PosterColumns & {
  id: string;
  nombre: string;
  venue: string | null;
  temporada: string | null;
  price: number;
  on_sale: boolean;
  concluded: boolean;
  destacada?: boolean;
  created_at: string;
  estado: string;
  icono_path?: string | null;
  funciones_publicadas?: boolean;
  modo_venta?: "web" | "hibrido" | "whatsapp";
  mostrar_precios?: boolean;
};

export type ObraPublica = ConEstado<Obra>;

export type Funcion = {
  id: string;
  starts_at: string | null;
  venue: string | null;
  on_sale: boolean;
  preventa_hasta?: string | null;
  preventa_desde?: string | null;
};

export type Zona = { nombre: string; price: number; color: string | null; orden: number };

const COLUMNAS_OBRA = `id, nombre, venue, temporada, price, on_sale, concluded, destacada, created_at, estado, frase, color_fondo, color_superficie, color_texto, color_acento, logo_path, ambiente_path, icono_path, funciones_publicadas, modo_venta, mostrar_precios, ${POSTER_COLUMNS}`;
const ESTADOS_PUBLICOS = ["publicada", "archivada"];

/** URL de una imagen de la obra: del bucket `producciones` o, si empieza con "/", un archivo propio de la web
 *  (web/public/producciones), que la app trae copiado en app/public/producciones para no depender del sitio. */
export function imagen(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("/")) return path;
  return `${env.supabaseUrl}/storage/v1/object/public/producciones/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** Póster oficial para ese uso; si la obra no tiene, su imagen de ambiente. */
export function poster(o: Obra, uso: Uso): string | null {
  const e = elegir(o, uso);
  return e ? imagen(e.path) : imagen(o.ambiente_path);
}

export type Cartelera = { obras: ObraPublica[]; destacada: Featured<Obra> | null };

/** Portada y lista de obras (misma regla que getHomeData de la web). */
export async function leerCartelera(): Promise<Cartelera> {
  const [prods, funcs, desde] = await Promise.all([
    supabase.from("productions").select(COLUMNAS_OBRA).in("estado", ESTADOS_PUBLICOS),
    supabase.from("performances").select("production_id, starts_at, on_sale").is("cancelada_at", null),
    supabase.rpc("productions_desde"),
  ]);
  if (prods.error) throw new Error(prods.error.message);
  const minimo = new Map(((desde.data ?? []) as { production_id: string; desde: number }[]).map((r) => [r.production_id, Number(r.desde)]));
  const conPrecio = ((prods.data ?? []) as unknown as Obra[]).map((p) => ({ ...p, price: minimo.get(p.id) ?? 0 }));
  const publicadas = new Set(conPrecio.filter((p) => p.funciones_publicadas !== false).map((p) => p.id));
  const funciones = ((funcs.data ?? []) as { production_id: string; starts_at: string | null; on_sale: boolean }[]).filter((f) => publicadas.has(f.production_id));
  const obras = ordenarObras(clasificar(conPrecio, funciones));
  return { obras, destacada: elegirPortada(obras) };
}

export type DetalleObra = { obra: Obra; funciones: Funcion[]; zonas: Zona[] };

/** Una obra con sus funciones y precios por zona (misma regla que getProduction de la web). */
export async function leerObra(id: string): Promise<DetalleObra | null> {
  const [prod, perfs] = await Promise.all([
    supabase.from("productions").select(COLUMNAS_OBRA).eq("id", id).in("estado", ESTADOS_PUBLICOS).maybeSingle(),
    supabase.from("performances").select("id, starts_at, venue, on_sale, preventa_hasta, preventa_desde")
      .eq("production_id", id).is("cancelada_at", null).order("starts_at", { nullsFirst: false }),
  ]);
  if (prod.error) throw new Error(prod.error.message);
  if (!prod.data) return null;
  const obra = prod.data as unknown as Obra;
  const funciones = obra.funciones_publicadas !== false ? ((perfs.data ?? []) as Funcion[]) : [];

  // La base solo da precios de funciones en venta.
  const enVenta = funciones.filter((f) => f.on_sale).map((f) => f.id);
  let zonas: Zona[] = [];
  if (enVenta.length) {
    const { data } = await supabase.from("performance_price_categories").select("price, price_categories(nombre, color, orden)").in("performance_id", enVenta);
    const porZona = new Map<string, Zona>();
    for (const row of data ?? []) {
      const cat = row.price_categories as unknown as { nombre: string; color: string | null; orden: number | null } | null;
      if (!cat) continue;
      const price = Number(row.price);
      const prev = porZona.get(cat.nombre);
      if (!prev || price < prev.price) porZona.set(cat.nombre, { nombre: cat.nombre, price, color: cat.color, orden: cat.orden ?? 0 });
    }
    zonas = [...porZona.values()].sort((a, b) => a.orden - b.orden || b.price - a.price);
  }
  return { obra, funciones, zonas };
}

export type Boleto = { id: string; is_active: boolean; qr_token: string; checked_in_at: string | null; asiento: string | null; zona: string | null };
export type Orden = {
  id: string;
  order_code: string;
  status: string;
  total: number;
  created_at: string;
  funcion: { starts_at: string | null; venue: string | null; production_id: string } | null;
  obra: Obra | null;
  boletos: Boleto[];
};

/** Órdenes de la persona con sesión (misma consulta que la página de cuenta de la web). */
export async function leerMisOrdenes(userId: string): Promise<Orden[]> {
  const { data, error } = await supabase
    .from("orders")
    .select(`id, order_code, status, total, created_at, performances(starts_at, venue, production_id, productions(${COLUMNAS_OBRA})), tickets(id, is_active, qr_token, checked_in_at, seats(seat_label), price_categories(nombre))`)
    .eq("buyer_user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  type Fila = Omit<Orden, "funcion" | "obra" | "boletos"> & {
    performances: { starts_at: string | null; venue: string | null; production_id: string; productions: Obra | null } | null;
    tickets: { id: string; is_active: boolean; qr_token: string; checked_in_at: string | null; seats: { seat_label: string } | null; price_categories: { nombre: string } | null }[];
  };
  return ((data ?? []) as unknown as Fila[]).map((o) => ({
    id: o.id, order_code: o.order_code, status: o.status, total: Number(o.total), created_at: o.created_at,
    funcion: o.performances ? { starts_at: o.performances.starts_at, venue: o.performances.venue, production_id: o.performances.production_id } : null,
    obra: o.performances?.productions ?? null,
    boletos: o.tickets.map((t) => ({ id: t.id, is_active: t.is_active, qr_token: t.qr_token, checked_in_at: t.checked_in_at, asiento: t.seats?.seat_label ?? null, zona: t.price_categories?.nombre ?? null })),
  }));
}

/** Una función ya pasó (con 6 horas de gracia, como la web). */
export function funcionPasada(startsAt: string | null): boolean {
  return !!startsAt && new Date(startsAt).getTime() + 6 * 3600_000 < Date.now();
}
