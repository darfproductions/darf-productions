"use server";

import { createClient } from "@/lib/supabase/server";

/** "Avísame" de un anuncio (0074): la base revisa que tenga cuenta y que aún no se revele. */
export async function avisame(id: string, on: boolean): Promise<{ ok: boolean; message: string }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false, message: "login" };
  const { error } = await supabase.rpc("anuncio_registro", { aid: id, p_on: on });
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: on ? "Listo: te avisamos en tu cuenta y en tu teléfono cuando se revele." : "Ya no te avisaremos de este anuncio." };
}
