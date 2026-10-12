"use server";

import { createClient } from "@/lib/supabase/server";

type Datos = { seat_label?: string; buyer_nombre?: string; category?: string; checked_in_at?: string; production?: string; performance_starts_at?: string };
export type CheckIn =
  | ({ result: "ok" | "ya_usado" | "cancelado" | "no_encontrado" | "no_aprobado" | "otra_funcion" } & Datos)
  | { result: "error"; message: string };

/** Valida un QR para UNA función (0068): si es de otra fecha, se rechaza sin gastarse. */
export async function checkIn(token: string, funcion: string): Promise<CheckIn> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("check_in_ticket", { target_qr_token: token, p_performance: funcion });
  if (error) return { result: "error", message: error.message === "No autorizado" ? "Este boleto no es de una obra en la que puedas validar." : "No se pudo validar. Revisa la conexión e intenta de nuevo." };
  return data as CheckIn;
}
