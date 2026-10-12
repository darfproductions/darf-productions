import type { MapSeat } from "@/lib/tickets";
import type { SaleOrder } from "@/lib/sales";
import { createClient } from "@/lib/supabase/server";

// Lecturas de boletería para el panel. Pasan por RLS: cada quien ve solo su obra (0034).

export type PanelPerformance = {
  id: string;
  starts_at: string | null;
  venue: string | null;
  on_sale: boolean;
  prices: { categoryId: string; nombre: string; price: number }[];
};

export async function listPerformances(pid: string): Promise<PanelPerformance[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("performances")
    .select("id, starts_at, venue, on_sale, performance_price_categories(price, price_category_id, price_categories(nombre))")
    .eq("production_id", pid)
    .order("starts_at", { nullsFirst: false });
  return (data ?? []).map((p) => ({
    id: p.id as string,
    starts_at: p.starts_at as string | null,
    venue: p.venue as string | null,
    on_sale: p.on_sale as boolean,
    prices: ((p.performance_price_categories ?? []) as unknown as { price: number; price_category_id: string; price_categories: { nombre: string } | null }[])
      .map((r) => ({ categoryId: r.price_category_id, nombre: r.price_categories?.nombre ?? "", price: Number(r.price) }))
      .sort((a, b) => b.price - a.price),
  }));
}

export async function listZones(pid: string): Promise<{ id: string; nombre: string; is_active: boolean }[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("price_categories").select("id, nombre, is_active").eq("production_id", pid).order("nombre");
  return (data ?? []) as { id: string; nombre: string; is_active: boolean }[];
}

export async function seatCount(pid: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase.from("seats").select("id", { count: "exact", head: true }).eq("production_id", pid).eq("is_active", true);
  return count ?? 0;
}

export async function listOrders(pid: string, opts: { funcion?: string; estado?: string } = {}): Promise<SaleOrder[]> {
  const supabase = await createClient();
  const perfIds = (await supabase.from("performances").select("id").eq("production_id", pid)).data?.map((p) => p.id as string) ?? [];
  if (!perfIds.length) return [];
  let q = supabase
    .from("orders")
    .select("id, order_code, performance_id, status, buyer_nombre, buyer_telefono, total, discount_codigo, discount_amount, created_at, created_by_staff_id, expires_at, vencida_at, tickets(id, is_active, checked_in_at, seats(seat_label))")
    .in("performance_id", opts.funcion ? [opts.funcion] : perfIds)
    .order("created_at", { ascending: false })
    .limit(500);
  if (opts.estado) q = q.eq("status", opts.estado);
  const { data, error } = await q;
  if (error) throw new Error(`No se pudieron cargar las órdenes: ${error.message}`);
  return (data ?? []).map((o) => ({
    ...(o as unknown as SaleOrder),
    total: Number(o.total),
    discount_amount: Number(o.discount_amount ?? 0),
    tickets: ((o.tickets ?? []) as unknown as { id: string; is_active: boolean; checked_in_at: string | null; seats: { seat_label: string } | null }[]).map((t) => ({
      id: t.id,
      is_active: t.is_active,
      checked_in_at: t.checked_in_at,
      seat_label: t.seats?.seat_label ?? null,
    })),
  }));
}

/** Mapa para la taquilla: asientos, ocupados y precios de la función. */
export async function boxOfficeData(pid: string, performanceId: string) {
  const supabase = await createClient();
  await supabase.rpc("expire_due_orders", { pid });
  const [seats, taken, prices] = await Promise.all([
    supabase.from("seats").select("id, seat_label, seat_row, seat_number, lado, price_category_id, is_active").eq("production_id", pid).limit(2000),
    supabase.rpc("get_taken_seats", { target_performance_id: performanceId }),
    supabase.from("performance_price_categories").select("price_category_id, price, price_categories(nombre)").eq("performance_id", performanceId),
  ]);
  return {
    seats: ((seats.data ?? []) as (MapSeat & { is_active: boolean })[]).filter((s) => s.is_active),
    taken: (taken.data ?? []) as string[],
    prices: (prices.data ?? []).map((r) => ({
      categoryId: r.price_category_id as string,
      price: Number(r.price),
      nombre: (r.price_categories as unknown as { nombre: string } | null)?.nombre ?? "",
    })),
    error: seats.error ?? taken.error ?? prices.error,
  };
}
