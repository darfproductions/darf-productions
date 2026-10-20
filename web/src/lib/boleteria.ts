import type { MapSeat } from "@/lib/tickets";
import { leerDiseno } from "@/lib/mapa-libre";
import type { SaleOrder, summarizeSales } from "@/lib/sales";
import { todasLasFilas } from "@/lib/supabase/paginar";
import { createClient } from "@/lib/supabase/server";
import { asientosOcupados } from "@/lib/ocupados";

// Lecturas de boletería para el panel. Pasan por RLS: cada quien ve solo su obra (0034).

export type PanelPerformance = {
  id: string;
  starts_at: string | null;
  venue: string | null;
  on_sale: boolean;
  /** 0076: hasta cuándo solo el Club Fan puede comprar. */
  preventa_hasta: string | null;
  cancelada_at: string | null;
  cancelada_motivo: string | null;
  prices: { categoryId: string; nombre: string; price: number; cupo: number | null }[];
};

export async function listPerformances(pid: string): Promise<PanelPerformance[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("performances")
    .select("id, starts_at, venue, on_sale, preventa_hasta, cancelada_at, cancelada_motivo, performance_price_categories(price, cupo, price_category_id, price_categories(nombre))")
    .eq("production_id", pid)
    .order("starts_at", { nullsFirst: false });
  return (data ?? []).map((p) => ({
    id: p.id as string,
    starts_at: p.starts_at as string | null,
    venue: p.venue as string | null,
    on_sale: p.on_sale as boolean,
    preventa_hasta: (p.preventa_hasta as string | null) ?? null,
    cancelada_at: (p.cancelada_at as string | null) ?? null,
    cancelada_motivo: (p.cancelada_motivo as string | null) ?? null,
    prices: ((p.performance_price_categories ?? []) as unknown as { price: number; cupo: number | null; price_category_id: string; price_categories: { nombre: string } | null }[])
      .map((r) => ({ categoryId: r.price_category_id, nombre: r.price_categories?.nombre ?? "", price: Number(r.price), cupo: r.cupo }))
      .sort((a, b) => b.price - a.price),
  }));
}

export type Zone = { id: string; nombre: string; is_active: boolean; cupo: number | null; descripcion: string | null; color?: string | null };

export async function listZones(pid: string): Promise<Zone[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("price_categories").select("id, nombre, is_active, cupo, descripcion, color").eq("production_id", pid).order("nombre");
  return (data ?? []) as Zone[];
}

/** Zonas de entrada general de una función con sus lugares libres (0055). */
export type GeneralZone = { price_category_id: string; nombre: string; descripcion: string | null; precio: number; cupo: number; ocupados: number; libres: number };

export async function generalAvailability(performanceId: string): Promise<GeneralZone[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("general_availability", { target_performance_id: performanceId });
  return ((data ?? []) as GeneralZone[]).map((z) => ({ ...z, precio: Number(z.precio) }));
}

export async function seatCount(pid: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase.from("seats").select("id", { count: "exact", head: true }).eq("production_id", pid).eq("is_active", true);
  return count ?? 0;
}

/** Órdenes de la obra, de la más nueva a la más vieja. La lista del panel muestra las 500 más
 *  recientes (con filtros); `codigo` busca una sola en toda la historia y `todas` trae todas (Reportes). */
export async function listOrders(pid: string, opts: { funcion?: string; estado?: string; codigo?: string; buscar?: string; todas?: boolean } = {}): Promise<SaleOrder[]> {
  const supabase = await createClient();
  const perfIds = (await supabase.from("performances").select("id").eq("production_id", pid)).data?.map((p) => p.id as string) ?? [];
  if (!perfIds.length) return [];
  const consulta = () => {
    let q = supabase
      .from("orders")
      .select("id, order_code, performance_id, status, buyer_nombre, buyer_telefono, total, discount_codigo, discount_amount, created_at, created_by_staff_id, expires_at, vencida_at, motivo, metodo_pago, referencia, approved_by, rejected_by, cancelada_por_comprador_at, tickets(id, is_active, checked_in_at, cancel_motivo, cancelled_by, seats(seat_label), price_categories(nombre))")
      .in("performance_id", opts.funcion ? [opts.funcion] : perfIds)
      .order("created_at", { ascending: false })
      .order("id");
    if (opts.estado) q = q.eq("status", opts.estado);
    if (opts.codigo) q = q.eq("order_code", opts.codigo);
    if (opts.buscar) {
      // Nombre (cualquier parte) o teléfono (al menos 4 dígitos, sin espacios ni guiones).
      const digitos = opts.buscar.replace(/\D/g, "");
      q = q.or([`buyer_nombre.ilike.*${opts.buscar}*`, ...(digitos.length >= 4 ? [`buyer_telefono.ilike.*${digitos}*`] : [])].join(","));
    }
    return q;
  };
  const { data, error } = opts.todas ? await todasLasFilas((a, b) => consulta().range(a, b)) : await consulta().limit(500);
  if (error) throw new Error(`No se pudieron cargar las órdenes: ${error.message}`);
  return (data ?? []).map((o) => ({
    ...(o as unknown as SaleOrder),
    total: Number(o.total),
    discount_amount: Number(o.discount_amount ?? 0),
    tickets: ((o.tickets ?? []) as unknown as { id: string; is_active: boolean; checked_in_at: string | null; cancel_motivo: string | null; cancelled_by: string | null; seats: { seat_label: string } | null; price_categories: { nombre: string } | null }[]).map((t) => ({
      id: t.id,
      is_active: t.is_active,
      checked_in_at: t.checked_in_at,
      cancel_motivo: t.cancel_motivo,
      cancelled_by: t.cancelled_by,
      seat_label: t.seats?.seat_label ?? (t.price_categories ? `General · ${t.price_categories.nombre}` : null),
    })),
  }));
}

/** Mapa para la taquilla: asientos, ocupados y precios de la función. */
export async function boxOfficeData(pid: string, performanceId: string) {
  const supabase = await createClient();
  await supabase.rpc("expire_due_orders", { pid });
  const [seats, taken, prices, diseno] = await Promise.all([
    todasLasFilas((a, b) => supabase.from("seats").select("id, seat_label, seat_row, seat_number, lado, price_category_id, is_active, pos_x, pos_y, section").eq("production_id", pid).order("id").range(a, b)),
    asientosOcupados(supabase, performanceId),
    supabase.from("performance_price_categories").select("price_category_id, price, price_categories(nombre, color)").eq("performance_id", performanceId),
    supabase.from("mapas_diseno").select("diseno").eq("production_id", pid).maybeSingle(),
  ]);
  return {
    formas: leerDiseno(diseno.data?.diseno)?.formas ?? [],
    seats: ((seats.data ?? []) as (MapSeat & { is_active: boolean })[]).filter((s) => s.is_active),
    taken: (taken.data ?? []) as string[],
    prices: (prices.data ?? []).map((r) => ({
      categoryId: r.price_category_id as string,
      price: Number(r.price),
      nombre: (r.price_categories as unknown as { nombre: string } | null)?.nombre ?? "",
      color: (r.price_categories as unknown as { color: string | null } | null)?.color ?? null,
    })),
    error: seats.error ?? taken.error ?? prices.error,
  };
}

export type SalesSummary = ReturnType<typeof summarizeSales> & { ordenes: number };

/** Totales de venta calculados en la base (0068): no dependen del límite de la lista de órdenes. */
export async function salesSummary(pid: string): Promise<SalesSummary> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("production_sales_summary", { pid });
  if (error || !data) throw new Error(`No se pudieron calcular las ventas: ${error?.message ?? "sin datos"}`);
  const d = data as Omit<SalesSummary, "porFuncion"> & { porFuncion: Record<string, { vendidos: number; apartados: number; ingresos: number; validados: number }> };
  const num = (x: unknown) => Number(x ?? 0);
  return {
    ingresos: num(d.ingresos), pendiente: num(d.pendiente), vendidos: num(d.vendidos), apartados: num(d.apartados),
    validados: num(d.validados), ordenesPendientes: num(d.ordenesPendientes), ordenes: num(d.ordenes),
    porFuncion: new Map(Object.entries(d.porFuncion ?? {}).map(([k, v]) => [k, { vendidos: num(v.vendidos), apartados: num(v.apartados), ingresos: num(v.ingresos), validados: num(v.validados) }])),
  };
}

/** 0088: nombres de quien aprobó, rechazó, vendió o canceló en esta obra. */
export async function ventasActores(pid: string): Promise<Map<string, string>> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("ventas_actores", { pid });
  return new Map(((data ?? []) as { id: string; nombre: string }[]).map((r) => [r.id, r.nombre]));
}
