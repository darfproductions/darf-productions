"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Cierre de temporada (0053). La base revisa obra.publicar (cerrar) y Director (reabrir).

type State = { ok: boolean; message: string } | null;
const refresh = (pid: string) => {
  for (const p of [`/panel/producciones/${pid}`, `/panel/producciones/${pid}/cierre`, `/producciones/${pid}`, "/panel/reportes"]) revalidatePath(p);
};

export async function closeSeason(_p: State, f: FormData): Promise<State> {
  const pid = String(f.get("pid") ?? "");
  if (String(f.get("confirmo") ?? "") !== "on") return { ok: false, message: "Marca la casilla de confirmación." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("season_close", { pid, notas_: String(f.get("notas") ?? ""), dar_baja: f.get("dar_baja") === "on" });
  if (error) return { ok: false, message: error.message };
  refresh(pid);
  return { ok: true, message: "Temporada cerrada. La obra quedó en el archivo." };
}

export async function reopenSeason(_p: State, f: FormData): Promise<State> {
  const pid = String(f.get("pid") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("season_reopen", { pid });
  if (error) return { ok: false, message: error.message };
  refresh(pid);
  return { ok: true, message: "Temporada reabierta: la obra vuelve a estar publicada (sin venta activa)." };
}
