import { createClient } from "@/lib/supabase/server";
import { ordenFanzone, type FanItem } from "@/lib/fanzone-rules";

// Lecturas de la Fan Zone (0052). Pasan por RLS: los fans ven solo lo visible de obras públicas.

export async function listFanzone(pid: string): Promise<(FanItem & { archivo_url: string | null })[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("fanzone_items").select("*").eq("production_id", pid);
  return ordenFanzone((data ?? []) as FanItem[]).map((i) => ({
    ...i,
    archivo_url: i.archivo_path ? supabase.storage.from("gallery").getPublicUrl(i.archivo_path).data.publicUrl : null,
  }));
}

/** Contenidos visibles por obra (para la portada de la Fan Zone). */
export async function fanzoneCounts(): Promise<Map<string, number>> {
  const supabase = await createClient();
  const { data } = await supabase.from("fanzone_items").select("production_id");
  const m = new Map<string, number>();
  for (const r of data ?? []) m.set(r.production_id as string, (m.get(r.production_id as string) ?? 0) + 1);
  return m;
}

/** Cuántos contenidos tiene la Fan Zone de una obra, también sin sesión. */
export async function fanzoneCount(pid: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("production_fanzone_count", { pid });
  return Number(data ?? 0);
}
