"use server";

import type { Resultado } from "@/lib/panel-buscar-rules";
import { createClient } from "@/lib/supabase/server";

/** Búsqueda en la base (0085): personas, órdenes DARF-/EV-, convocatorias y eventos según mis permisos. */
export async function buscarPanel(q: string): Promise<Resultado[]> {
  const t = q.trim().slice(0, 80);
  if (t.length < 2) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("panel_buscar", { q: t });
  return (data ?? []) as Resultado[];
}
