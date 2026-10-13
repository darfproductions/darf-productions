"use server";

import { mensajeError } from "@/lib/errores";
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

export type Conteo = { vendidos: number; entraron: number };
export type BoletoPuerta = { ticket_id: string; qr_token: string; order_code: string; buyer_nombre: string; buyer_telefono: string; lugar: string; checked_in_at: string | null };

/** "Entraron X de Y" de la función (0091). */
export async function conteoPuerta(funcion: string): Promise<Conteo | null> {
  const { data, error } = await (await createClient()).rpc("puerta_conteo", { p_performance: funcion });
  return error ? null : (data as Conteo);
}

/** Buscar por nombre, teléfono, código de orden o asiento: plan B si el QR no abre (0091). */
export async function buscarPuerta(funcion: string, q: string): Promise<{ ok: true; boletos: BoletoPuerta[] } | { ok: false; message: string }> {
  if (q.trim().length < 2) return { ok: true, boletos: [] };
  const { data, error } = await (await createClient()).rpc("puerta_lista", { p_performance: funcion, p_q: q.trim().slice(0, 60) });
  if (error) return { ok: false, message: mensajeError(error) };
  return { ok: true, boletos: ((data ?? []) as BoletoPuerta[]).slice(0, 30) };
}

/** Deshacer una entrada marcada por error (0091). */
export async function deshacerEntrada(ticketId: string): Promise<{ ok: boolean; message: string }> {
  const { error } = await (await createClient()).rpc("puerta_deshacer", { p_ticket: ticketId });
  if (error) return { ok: false, message: mensajeError(error) };
  return { ok: true, message: "Entrada deshecha: el boleto vuelve a servir." };
}
