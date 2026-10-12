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
  return { ok: true, message: on ? "¡Lugar apartado! Muestra tu credencial del Club Fan en la entrada." : "Liberaste tu lugar." };
}

export async function recordarPreventa(pid: string, on: boolean): Promise<{ ok: boolean; message: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("preventa_recordar", { pid, p_on: on });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/fan-zone", "layout");
  return { ok: true, message: on ? "Listo: te avisamos en tu cuenta y en tu teléfono cuando abra la preventa." : "Recordatorio desactivado." };
}

/** Credencial nueva (0080): la anterior y su PDF dejan de servir. */
export async function regenerarCredencial(): Promise<{ ok: boolean; message: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("fan_regenerar");
  if (error) return { ok: false, message: error.message };
  revalidatePath("/fan-zone", "layout");
  revalidatePath("/cuenta");
  return { ok: true, message: "Credencial nueva lista. La anterior ya no sirve." };
}
