"use server";

import type { BeneficioBoleto } from "@/lib/beneficios-rules";
import { mensajeError } from "@/lib/errores";
import { createClient } from "@/lib/supabase/server";
import { todasLasFilas } from "@/lib/supabase/paginar";
import type { ListaPuerta } from "./sin-conexion-rules";

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

export type Visita = { result: "visita_ok" | "visita_ya" | "visita_sin_boleto" | "visita_no_encontrado"; nombre?: string; fotoUrl?: string | null; visitas?: number; socio?: boolean; hora?: string };

/** 0110: pase del Club Fan en la puerta: suma la visita a esa cuenta en esta función. */
export async function visitaPuerta(code: string, funcion: string): Promise<Visita | { result: "error"; message: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("puerta_visita", { p_performance: funcion, p_code: code.trim() });
  if (error) return { result: "error", message: error.message === "No autorizado" ? "No puedes validar en esta obra." : "No se pudo registrar la visita. Revisa la conexión e intenta de nuevo." };
  const r = data as { resultado: "ok" | "ya" | "sin_boleto" | "no_encontrado"; nombre?: string; foto_path?: string | null; visitas?: number; socio?: boolean; hora?: string };
  const fotoUrl = r.foto_path ? (await supabase.storage.from("avatares").createSignedUrl(r.foto_path, 600)).data?.signedUrl ?? null : null;
  return { result: `visita_${r.resultado}` as Visita["result"], nombre: r.nombre, fotoUrl, visitas: r.visitas, socio: r.socio, hora: r.hora };
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

/** Puerta sin internet (2026-10-25): todos los boletos válidos de la función para guardarlos en el celular. */
export async function listaPuerta(funcion: string): Promise<ListaPuerta | null> {
  const supabase = await createClient();
  const { data, error } = await todasLasFilas<BoletoPuerta>((a, b) => supabase.rpc("puerta_lista", { p_performance: funcion, p_q: null }).range(a, b));
  if (error) return null;
  return { funcion, descargada: new Date().toISOString(), boletos: data.map((b) => ({ t: String(b.qr_token).toLowerCase(), lugar: b.lugar, nombre: b.buyer_nombre, entro: b.checked_in_at })) };
}

/** Deshacer una entrada marcada por error (0091). */
export async function deshacerEntrada(ticketId: string): Promise<{ ok: boolean; message: string }> {
  const { error } = await (await createClient()).rpc("puerta_deshacer", { p_ticket: ticketId });
  if (error) return { ok: false, message: mensajeError(error) };
  return { ok: true, message: "Entrada deshecha: el boleto vuelve a servir." };
}

/** 0122: beneficios del boleto escaneado (con lo ya entregado). */
export async function beneficiosPuerta(token: string): Promise<BeneficioBoleto[]> {
  const { data, error } = await (await createClient()).rpc("beneficios_qr", { p_token: token.trim() });
  if (error) return [];
  return ((data as { beneficios?: BeneficioBoleto[] } | null)?.beneficios ?? []);
}

/** 0122: marcar (o desmarcar) que ya se entregó un beneficio. 0125: con nota opcional. */
export async function entregarBeneficio(token: string, beneficio: string, entregado: boolean, nota?: string): Promise<{ ok: true; beneficios: BeneficioBoleto[] } | { ok: false; message: string }> {
  const { data, error } = await (await createClient()).rpc("beneficio_entregar", { p_token: token.trim(), p_beneficio: beneficio, p_entregado: entregado, p_nota: nota?.trim().slice(0, 200) || null });
  if (error) return { ok: false, message: mensajeError(error) };
  return { ok: true, beneficios: ((data as { beneficios?: BeneficioBoleto[] } | null)?.beneficios ?? []) };
}
