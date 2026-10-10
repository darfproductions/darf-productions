"use server";

import { getSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { whatsappPayUrl } from "@/lib/tickets";

export type OrderResult =
  | { ok: true; orderCode: string; total: number; seats: string[]; whatsappUrl: string }
  | { ok: false; message: string };

// Crea la orden llamando a la MISMA función de la base que usa la 1.0
// (create_seated_ticket_order v3). La base valida todo: sesión, función en venta,
// asientos libres (con bloqueo contra compras simultáneas), precios, descuento,
// tope de órdenes pendientes. Aquí no se calcula ningún precio.
export async function placeOrder(input: {
  performanceId: string;
  productionName: string;
  seatIds: string[];
  phone: string;
  sellerCode: string;
  discountCode: string | null;
}): Promise<OrderResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Tu sesión expiró. Vuelve a entrar para comprar." };
  const phone = input.phone.trim();
  if (!input.seatIds.length) return { ok: false, message: "Selecciona al menos un asiento." };
  if (!phone) return { ok: false, message: "Escribe tu número de teléfono." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_seated_ticket_order", {
    target_performance_id: input.performanceId,
    target_buyer_nombre: session.profile?.nombre || session.email,
    target_buyer_telefono: phone,
    target_seat_ids: input.seatIds,
    target_seller_codigo: input.sellerCode.trim() || null,
    target_discount_code: input.discountCode,
  });
  if (error) return { ok: false, message: error.message };

  const d = data as { order_code: string; total: number; seats?: string[]; discount_codigo?: string | null; discount_amount?: number | null };
  const seats = d.seats ?? [];
  return {
    ok: true,
    orderCode: d.order_code,
    total: Number(d.total),
    seats,
    whatsappUrl: whatsappPayUrl(env.whatsapp, {
      prodName: input.productionName,
      orderCode: d.order_code,
      seats,
      total: Number(d.total),
      buyerPhone: phone,
      discountCode: d.discount_codigo,
      discountAmount: d.discount_amount,
    }),
  };
}
