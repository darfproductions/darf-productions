"use server";

import { revalidatePath } from "next/cache";
import { mensajeError } from "@/lib/errores";
import { createClient } from "@/lib/supabase/server";

export type LlegoState = { ok: boolean; message: string } | null;

/** "Ya me llegó" (0151): la persona confirma que recibió el pago de ese mes. */
export async function yaMeLlego(_p: LlegoState, f: FormData): Promise<LlegoState> {
  const periodo = String(f.get("periodo") ?? "");
  if (!/^\d{4}-\d{2}-01$/.test(periodo)) return { ok: false, message: "Mes no válido." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("hon_ya_me_llego", { p_periodo: periodo });
  if (error) return { ok: false, message: mensajeError(error) };
  revalidatePath("/cuenta/honorarios");
  revalidatePath("/panel/honorarios/mes");
  return { ok: true, message: "¡Gracias! Quedó confirmado." };
}

/** "Ya me llegó" del pago de un cierre de temporada (0152). */
export async function yaMeLlegoCierre(_p: LlegoState, f: FormData): Promise<LlegoState> {
  const cierre = String(f.get("cierre") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(cierre)) return { ok: false, message: "Cierre no válido." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("hon_cierre_me_llego", { p_cierre: cierre });
  if (error) return { ok: false, message: mensajeError(error) };
  revalidatePath("/cuenta/honorarios");
  return { ok: true, message: "¡Gracias! Quedó confirmado." };
}
