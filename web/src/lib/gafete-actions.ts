"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Gafete digital (0078): qué compartir y regenerar el código. La base solo toca el gafete propio.

export async function guardarCompartir(_p: { ok: boolean; message: string } | null, f: FormData): Promise<{ ok: boolean; message: string }> {
  const supabase = await createClient();
  const on = (k: string) => f.get(k) === "on";
  const { error } = await supabase.rpc("badge_compartir", { p_tel: on("telefono"), p_correo: on("correo"), p_insta: on("instagram"), p_perfil: on("perfil") });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/cuenta");
  return { ok: true, message: "Listo: así se verá tu gafete al escanearlo." };
}

export async function regenerarGafete(): Promise<{ ok: boolean; message: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("badge_regenerar");
  if (error) return { ok: false, message: error.message };
  revalidatePath("/cuenta");
  revalidatePath("/fan-zone", "layout");
  return { ok: true, message: "Código nuevo listo. El anterior ya no sirve." };
}
