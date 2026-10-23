"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Cierre de temporada (0053). La base revisa obra.publicar para cerrar y reactivar (0066).

type State = { ok: boolean; message: string } | null;
const refresh = (pid: string) => {
  revalidatePath(`/panel/producciones/${pid}`, "layout");
  for (const p of [`/producciones/${pid}`, "/panel/reportes", "/", "/producciones"]) revalidatePath(p);
};

export async function closeSeason(_p: State, f: FormData): Promise<State> {
  const pid = String(f.get("pid") ?? "");
  if (String(f.get("confirmo") ?? "") !== "on") return { ok: false, message: "Marca la casilla de confirmación." };
  const supabase = await createClient();
  // 0125: lo pagado se tiene que entregar. La base no lo revisa al cerrar; aquí sí.
  const { data: b } = await supabase.rpc("beneficios_pendientes", { pid }).maybeSingle();
  const faltan = (b as { pendientes: number } | null)?.pendientes ?? 0;
  if (faltan) return { ok: false, message: `Faltan ${faltan} ${faltan === 1 ? "beneficio pagado" : "beneficios pagados"} por entregar. Revísalos en Boletos, Beneficios, Entregas.` };
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
  return { ok: true, message: "Producción reactivada: vuelve a estar publicada (sin venta activa) y regresan todas las pestañas." };
}
