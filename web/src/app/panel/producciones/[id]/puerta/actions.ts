"use server";

import { createClient } from "@/lib/supabase/server";

export type CheckIn =
  | { result: "ok" | "ya_usado" | "cancelado" | "no_encontrado"; seat_label?: string; buyer_nombre?: string; category?: string; checked_in_at?: string }
  | { result: "error"; message: string };

/** Valida un QR con la MISMA función de la base que la 1.0 (0034: puerta de esa obra). */
export async function checkIn(token: string): Promise<CheckIn> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("check_in_ticket", { target_qr_token: token });
  if (error) return { result: "error", message: error.message === "No autorizado" ? "Este boleto no es de una obra en la que puedas validar." : error.message };
  return data as CheckIn;
}
