import { lineaWhatsapp, porZona, type Beneficio, type BeneficioCorto } from "@/lib/beneficios-rules";
import type { MiPreventaPrivada } from "@/lib/disponibilidad";
import { leerDiseno, type Forma } from "@/lib/mapa-libre";
import { conPromo, mejorPromo, pctZona, type PromoZona } from "@/lib/promo-rules";
import type { MapSeat } from "@/lib/tickets";
import type { ModoVenta } from "@/lib/ventas-rules";
import { horario, type Horario, type Logistica } from "@/lib/logistica-rules";
import { supabase } from "~/lib/supabase";

// Compra (igual que /comprar/[funcion] y sus acciones en la web): se leen la función, el mapa, los precios con promo,
// lo ocupado y la entrada general, y la orden la crea la MISMA función de la base (create_seated_ticket_order /
// create_general_ticket_order), que valida todo: sesión, preventas, asientos libres, precios, descuentos y topes.
// Aquí no se calcula ningún precio que se cobre: lo que se muestra es una vista previa.

export type ZonaPrecio = { categoryId: string; price: number; nombre: string; color?: string | null; orden?: number; antes?: number; beneficios?: BeneficioCorto[] };
export type ZonaGeneral = { price_category_id: string; nombre: string; descripcion: string | null; precio: number; cupo: number; ocupados: number; libres: number; antes?: number; beneficios?: BeneficioCorto[] };

export type FuncionVenta = {
  id: string; starts_at: string | null; venue: string | null; on_sale: boolean; preventa_hasta: string | null; preventa_desde: string | null;
  puertas_at: string | null; termina_at: string | null;
};
export type ObraVenta = {
  id: string; nombre: string; venue: string | null; concluded: boolean; funciones_publicadas: boolean | null; modo_venta: ModoVenta | null; mostrar_total: boolean | null;
  color_fondo: string | null; color_superficie: string | null; color_texto: string | null; color_acento: string | null;
};

export async function leerFuncionVenta(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await supabase.from("performances")
    .select("id, starts_at, venue, on_sale, preventa_hasta, preventa_desde, puertas_at, termina_at, productions(id, nombre, venue, concluded, funciones_publicadas, modo_venta, mostrar_total, color_fondo, color_superficie, color_texto, color_acento)")
    .eq("id", id).maybeSingle();
  if (!data?.productions) return null;
  const { productions, ...f } = data as unknown as FuncionVenta & { productions: ObraVenta };
  return { f: f as FuncionVenta, p: productions };
}

export async function miPreventa(pid: string): Promise<MiPreventaPrivada | null> {
  const { data, error } = await supabase.rpc("mi_preventa_privada", { pid });
  return error ? null : (data as MiPreventaPrivada);
}
export async function soySocio(): Promise<boolean> {
  const { data } = await supabase.rpc("fan_me");
  return !!data;
}

async function todosLosAsientos(pid: string): Promise<(MapSeat & { is_active: boolean })[]> {
  const out: (MapSeat & { is_active: boolean })[] = [];
  for (let a = 0; ; a += 1000) {
    const { data, error } = await supabase.from("seats").select("id, seat_label, seat_row, seat_number, lado, price_category_id, is_active, pos_x, pos_y, section")
      .eq("production_id", pid).order("id").range(a, a + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as (MapSeat & { is_active: boolean })[]));
    if (!data || data.length < 1000) return out;
  }
}

export async function ocupados(fid: string): Promise<string[]> {
  const r = await supabase.rpc("taken_seats", { p_performance: fid });
  if (!r.error) return (r.data ?? []) as string[];
  const v = await supabase.rpc("get_taken_seats", { target_performance_id: fid });
  if (v.error) throw new Error(v.error.message);
  return (v.data ?? []) as string[];
}

/** Mapa, precios (con promo), entrada general, beneficios por zona y hora de puertas. */
export async function leerMapa(pid: string, f: FuncionVenta) {
  const [seats, prices, diseno, benef, taken, gen, promosRes, logi] = await Promise.all([
    todosLosAsientos(pid),
    supabase.from("performance_price_categories").select("price_category_id, price, price_categories(nombre, cupo, color, orden)").eq("performance_id", f.id),
    supabase.from("mapas_diseno").select("diseno").eq("production_id", pid).maybeSingle(),
    supabase.from("zona_beneficios")
      .select("id, tipo, nombre, detalle, por_compra, minutos_antes, cupo, funciones, orden, activo, entrega, entrega_dias, zona_beneficio_zonas(price_category_id)")
      .eq("production_id", pid).order("orden").order("created_at"),
    ocupados(f.id),
    supabase.rpc("general_availability", { target_performance_id: f.id }),
    supabase.rpc("promos_obra", { pid }),
    supabase.from("obra_logistica").select("puertas_min, duracion_min, intermedio_min, direccion, maps_url, acceso_tardio, indicaciones").eq("production_id", pid).maybeSingle(),
  ]);
  if (prices.error) throw new Error(prices.error.message);
  const promos: PromoZona[] = ((promosRes.data ?? []) as { performance_id: string; price_category_id: string; percent: number; nombre: string; hasta: string | null }[])
    .filter((r) => r.performance_id === f.id).map((r) => ({ zona: r.price_category_id, percent: Number(r.percent), nombre: r.nombre, hasta: r.hasta }));
  const beneficios = ((benef.data ?? []) as (Omit<Beneficio, "zonas"> & { zona_beneficio_zonas: { price_category_id: string }[] })[])
    .map(({ zona_beneficio_zonas: zs, ...b }) => ({ ...b, zonas: zs.map((z) => z.price_category_id) }));
  const bz = porZona(beneficios, f.id);
  const general: ZonaGeneral[] = ((gen.data ?? []) as ZonaGeneral[]).map((z) => {
    const pct = pctZona(promos, z.price_category_id);
    const conB = { ...z, precio: Number(z.precio), beneficios: bz.get(z.price_category_id) ?? [] };
    return pct ? { ...conB, precio: conPromo(Number(z.precio), pct), antes: Number(z.precio) } : conB;
  });
  type Fila = { price_category_id: string; price: number; price_categories: { nombre: string; cupo: number | null; color: string | null; orden: number | null } | null };
  const zonas: ZonaPrecio[] = ((prices.data ?? []) as unknown as Fila[]).filter((r) => r.price_categories?.cupo == null).map((r) => {
    const pct = pctZona(promos, r.price_category_id);
    return {
      categoryId: r.price_category_id, price: conPromo(Number(r.price), pct), ...(pct > 0 && { antes: Number(r.price) }),
      nombre: r.price_categories?.nombre ?? "", color: r.price_categories?.color ?? null, orden: r.price_categories?.orden ?? 0,
      beneficios: bz.get(r.price_category_id) ?? [],
    };
  });
  const logistica = (logi.data as Logistica | null) ?? null;
  const h: Horario | null = f.starts_at && (logistica || f.puertas_at) ? horario({ ...f, starts_at: f.starts_at }, logistica) : null;
  return {
    asientos: seats.filter((s) => s.is_active) as MapSeat[],
    zonas, general, taken: taken,
    formas: (leerDiseno((diseno.data as { diseno: unknown } | null)?.diseno)?.formas ?? []) as Forma[],
    promo: mejorPromo(promos), puertas: h?.puertas ?? null,
  };
}

export async function revisarVendedor(fid: string, codigo: string): Promise<{ ok: boolean; text: string; code: string }> {
  const code = codigo.trim().toUpperCase();
  const { data, error } = await supabase.rpc("preview_seller_code", { target_performance_id: fid, target_code: code });
  return error ? { ok: false, text: error.message, code } : { ok: true, text: `Vendedor: ${data as string}`, code };
}

export type Orden = { orderCode: string; total: number; seats: string[]; expiresAt: string | null; incluye: string[]; discountCodigo: string | null; discountAmount: number | null };

async function terminar(d: { order_code: string; total: number; seats?: string[]; discount_codigo?: string | null; discount_amount?: number | null }): Promise<Orden> {
  const { data: ord } = await supabase.from("orders").select("id, expires_at").eq("order_code", d.order_code).maybeSingle();
  let incluye: string[] = [];
  if (ord?.id) {
    const { data } = await supabase.rpc("orden_beneficios", { p_order: ord.id });
    incluye = ((data ?? []) as { zona: string; beneficios: BeneficioCorto[] }[]).map((z) => lineaWhatsapp(z.zona, z.beneficios)).filter((x): x is string => !!x);
  }
  return { orderCode: d.order_code, total: Number(d.total), seats: d.seats ?? [], expiresAt: (ord?.expires_at as string | null) ?? null, incluye,
    discountCodigo: d.discount_codigo ?? null, discountAmount: d.discount_amount ?? null };
}

export async function apartarAsientos(i: { fid: string; pid: string; nombre: string; telefono: string; asientos: string[]; vendedor: string; descuento: string | null }) {
  await supabase.rpc("expire_due_orders", { pid: i.pid });
  const { data, error } = await supabase.rpc("create_seated_ticket_order", {
    target_performance_id: i.fid, target_buyer_nombre: i.nombre, target_buyer_telefono: i.telefono.trim(), target_seat_ids: i.asientos,
    target_seller_codigo: i.vendedor.trim() || null, target_discount_code: i.descuento,
  });
  if (error) throw error;
  return terminar(data as Parameters<typeof terminar>[0]);
}

export async function apartarGeneral(i: { fid: string; nombre: string; telefono: string; zona: string; cantidad: number; vendedor: string; descuento: string }) {
  const { data, error } = await supabase.rpc("create_general_ticket_order", {
    target_performance_id: i.fid, target_buyer_nombre: i.nombre, target_buyer_telefono: i.telefono.trim(), target_zone_id: i.zona, target_cantidad: i.cantidad,
    target_seller_codigo: i.vendedor.trim() || null, target_discount_code: i.descuento.trim() || null,
  });
  if (error) throw error;
  return terminar(data as Parameters<typeof terminar>[0]);
}
