import { createClient } from "@/lib/supabase/server";
import { getTheme, type Production } from "@/lib/productions";

// Historial de la cuenta (bloque 5): transacciones (todas las órdenes) y eventos asistidos
// (funciones donde algún boleto ya entró por la puerta). Solo lee lo propio (RLS).

export type Transaccion = {
  id: string; codigo: string; status: "pendiente" | "aprobado" | "rechazado"; total: number; descuento: number; codigoDescuento: string | null;
  creada: string; vencida: boolean; obra: string; obraId: string; funcion: string | null; boletos: number;
};

export async function getTransacciones(uid: string): Promise<Transaccion[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select("id, order_code, status, total, discount_amount, discount_codigo, created_at, vencida_at, performances(starts_at, production_id, productions(nombre)), tickets(count)")
    .eq("buyer_user_id", uid)
    .order("created_at", { ascending: false });
  return (data ?? []).map((o) => {
    const pf = o.performances as unknown as { starts_at: string | null; production_id: string; productions: { nombre: string } | null } | null;
    return {
      id: o.id as string,
      codigo: o.order_code as string,
      status: o.status as Transaccion["status"],
      total: Number(o.total),
      descuento: Number(o.discount_amount ?? 0),
      codigoDescuento: (o.discount_codigo as string | null) ?? null,
      creada: o.created_at as string,
      vencida: !!o.vencida_at,
      obra: pf?.productions?.nombre ?? "",
      obraId: pf?.production_id ?? "",
      funcion: pf?.starts_at ?? null,
      boletos: (o.tickets as unknown as { count: number }[] | null)?.[0]?.count ?? 0,
    };
  });
}

export type EventoAsistido = { performanceId: string; obra: Production; funcion: string | null; boletos: number; entrada: string };

export async function getEventosAsistidos(uid: string): Promise<EventoAsistido[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tickets")
    .select("performance_id, checked_in_at, orders!inner(buyer_user_id), performances(starts_at, productions(id, nombre, logo_path, ambiente_path, color_fondo, color_superficie, color_texto, color_acento, frase, temporada, venue, estado, concluded, created_at, price, on_sale, destacada))")
    .eq("orders.buyer_user_id", uid)
    .not("checked_in_at", "is", null);
  const porFuncion = new Map<string, EventoAsistido>();
  for (const t of data ?? []) {
    const pf = t.performances as unknown as { starts_at: string | null; productions: Production } | null;
    if (!pf?.productions) continue;
    const prev = porFuncion.get(t.performance_id as string);
    if (prev) prev.boletos += 1;
    else porFuncion.set(t.performance_id as string, { performanceId: t.performance_id as string, obra: pf.productions, funcion: pf.starts_at, boletos: 1, entrada: t.checked_in_at as string });
  }
  return [...porFuncion.values()].sort((a, b) => (b.funcion ?? "").localeCompare(a.funcion ?? ""));
}

export { getTheme };
