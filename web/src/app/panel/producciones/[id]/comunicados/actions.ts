"use server";

import { revalidatePath } from "next/cache";
import { parseAudience } from "@/lib/audience";
import { createClient } from "@/lib/supabase/server";

// Comunicados (0046). La base revisa comunicados.enviar en la obra.

export type AnnState = { ok: boolean; message: string } | null;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function sendAnnouncement(_p: AnnState, f: FormData): Promise<AnnState> {
  const pid = str(f, "pid");
  const aud = parseAudience(f);
  if ("error" in aud) return { ok: false, message: aud.error };
  const supabase = await createClient();
  const { error } = await supabase.from("announcements").insert({
    production_id: pid, titulo: str(f, "titulo"), cuerpo: str(f, "cuerpo"), importante: f.get("importante") === "on", ...aud,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/panel/producciones/${pid}/comunicados`);
  return { ok: true, message: "Comunicado enviado. Lo verán en Mi cuenta." };
}

export async function removeAnnouncement(_p: AnnState, f: FormData): Promise<AnnState> {
  const pid = str(f, "pid");
  const supabase = await createClient();
  const { error, count } = await supabase.from("announcements").delete({ count: "exact" }).eq("id", str(f, "id")).eq("production_id", pid);
  if (error) return { ok: false, message: error.message };
  if (!count) return { ok: false, message: "No tienes permiso." };
  revalidatePath(`/panel/producciones/${pid}/comunicados`);
  return { ok: true, message: "Comunicado quitado." };
}
