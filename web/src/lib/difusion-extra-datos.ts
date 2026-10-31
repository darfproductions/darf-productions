import { listarBeneficios } from "@/lib/beneficios";
import { porZona, type Beneficio } from "@/lib/beneficios-rules";
import { colorZona } from "@/lib/seatmap-rules";
import { createClient } from "@/lib/supabase/server";
import { todasLasFilas } from "@/lib/supabase/paginar";
import { leerDiseno, type Forma } from "@/lib/mapa-libre";
import { ZONE_COLORS } from "@/lib/tickets";
import type { AsientoMapa } from "@/lib/difusion-extra-rules";

// Datos para los diseños de mapa e "incluye" (equipo de la obra: RLS de precios y asientos).
export type ZonaDifusion = { id: string; nombre: string; color: string; precio: number | null; /** El más alto entre funciones: "Desde $X". */ precioMax: number | null; general: boolean; beneficios: Beneficio[] };
export type DatosExtra = { zonas: ZonaDifusion[]; asientos: AsientoMapa[]; formas: Forma[]; modoVenta: string | null; mostrarPrecios: boolean };

export async function getDatosExtra(pid: string, funcionId: string | null): Promise<DatosExtra> {
  const supabase = await createClient();
  const [{ data: zs }, { data: prod }, { data: pfs }, asientosRes, { data: dis }, beneficios] = await Promise.all([
    supabase.from("price_categories").select("id, nombre, color, orden, cupo, is_active").eq("production_id", pid).order("orden"),
    supabase.from("productions").select("modo_venta, mostrar_precios").eq("id", pid).maybeSingle(),
    supabase.from("performances").select("id, on_sale, performance_price_categories(price, price_category_id)").eq("production_id", pid).is("cancelada_at", null),
    todasLasFilas((a, b) => supabase.from("seats").select("seat_row, seat_number, lado, pos_x, pos_y, price_category_id, section").eq("production_id", pid).eq("is_active", true).order("id").range(a, b)),
    supabase.from("mapas_diseno").select("diseno").eq("production_id", pid).maybeSingle(),
    listarBeneficios(pid),
  ]);
  // Precio por zona: el de la función elegida; si no, el más bajo de las funciones en venta (o de todas).
  const funciones = (pfs ?? []) as { id: string; on_sale: boolean; performance_price_categories: { price: number; price_category_id: string }[] }[];
  const usar = funcionId ? funciones.filter((f) => f.id === funcionId) : funciones.some((f) => f.on_sale) ? funciones.filter((f) => f.on_sale) : funciones;
  const precio = new Map<string, number>(), maximo = new Map<string, number>();
  for (const f of usar) for (const r of f.performance_price_categories) {
    const p = Number(r.price);
    if (!precio.has(r.price_category_id) || p < precio.get(r.price_category_id)!) precio.set(r.price_category_id, p);
    if (!maximo.has(r.price_category_id) || p > maximo.get(r.price_category_id)!) maximo.set(r.price_category_id, p);
  }
  const benef = porZona(beneficios, funcionId ?? undefined);
  const zonas = ((zs ?? []) as { id: string; nombre: string; color: string | null; orden: number; cupo: number | null; is_active: boolean }[])
    .filter((z) => z.is_active)
    .map((z, i) => ({ id: z.id, nombre: z.nombre, color: colorZona(z, i, ZONE_COLORS), precio: precio.get(z.id) ?? null, precioMax: maximo.get(z.id) ?? null, general: z.cupo != null, beneficios: benef.get(z.id) ?? [] }));
  const asientos = ((asientosRes.data ?? []) as { seat_row: string | null; seat_number: number | null; lado: string | null; pos_x: number | null; pos_y: number | null; price_category_id: string | null; section: string | null }[])
    .map((s) => ({ x: s.pos_x, y: s.pos_y, fila: s.seat_row, numero: s.seat_number, lado: s.lado, zona: s.price_category_id, grupo: s.section }));
  return {
    zonas, asientos, formas: leerDiseno(dis?.diseno)?.formas ?? [],
    modoVenta: (prod?.modo_venta as string | null) ?? null, mostrarPrecios: prod?.mostrar_precios !== false,
  };
}
