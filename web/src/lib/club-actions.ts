"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Club Fan (0075): unirse y apartar lugar en "Foto con el elenco". La base revisa las reglas.

export async function unirmeAlClub(): Promise<{ ok: boolean; message: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("fan_join");
  if (error) return { ok: false, message: error.message };
  revalidatePath("/fan-zone", "layout");
  return { ok: true, message: "¡Ya eres parte del Club Fan!" };
}

export async function apartarEncuentro(id: string, on: boolean): Promise<{ ok: boolean; message: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("fan_encuentro_apartar", { eid: id, p_on: on });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/fan-zone", "layout");
  revalidatePath("/eventos");
  revalidatePath("/cuenta/eventos");
  if (!on) return { ok: true, message: "Liberaste tu lugar." };
  // Con costo (0083): queda una orden pendiente hasta que el equipo apruebe el pago.
  const { data: auth } = await supabase.auth.getUser();
  const { data: o } = await supabase.from("evento_ordenes").select("status").eq("encuentro_id", id).eq("user_id", auth.user?.id ?? "").eq("status", "pendiente").maybeSingle();
  return { ok: true, message: o ? "Lugar apartado. Paga por WhatsApp para confirmarlo." : "¡Lugar apartado! Te avisamos una hora antes." };
}

export async function recordarPreventa(pid: string, on: boolean): Promise<{ ok: boolean; message: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("preventa_recordar", { pid, p_on: on });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/fan-zone", "layout");
  return { ok: true, message: on ? "Listo: te avisamos en tu cuenta y en tu teléfono cuando abra la preventa." : "Recordatorio desactivado." };
}

/** "Recordarme" en un evento (0081): aviso en la cuenta y al teléfono una hora antes. */
export async function recordarEvento(id: string, on: boolean): Promise<{ ok: boolean; message: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("evento_recordar", { eid: id, p_on: on });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/fan-zone", "layout");
  revalidatePath("/eventos");
  return { ok: true, message: on ? "Listo: te avisamos una hora antes." : "Recordatorio desactivado." };
}
