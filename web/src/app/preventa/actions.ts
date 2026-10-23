"use server";

import { revalidatePath } from "next/cache";
import { mensajeError } from "@/lib/errores";
import { createClient } from "@/lib/supabase/server";

/** 0123: canjear un código de preventa privada desde la página de la obra. */
export async function canjearPreventa(codigo: string): Promise<{ ok: boolean; message: string }> {
  const c = codigo.trim();
  if (c.length < 4) return { ok: false, message: "Escribe tu código." };
  const { data, error } = await (await createClient()).rpc("preventa_canjear", { p_codigo: c });
  if (error) return { ok: false, message: mensajeError(error) };
  const r = data as { production_id?: string; obra?: string; error?: string };
  if (r.error) return { ok: false, message: r.error };
  revalidatePath(`/producciones/${r.production_id}`);
  return { ok: true, message: `Listo: tienes acceso a la preventa privada de ${r.obra}.` };
}
