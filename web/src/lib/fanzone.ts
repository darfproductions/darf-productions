import { createClient } from "@/lib/supabase/server";
import { ordenFanzone, type FanCategoria, type FanItem, type FanTipo } from "@/lib/fanzone-rules";

// Lecturas de la Fan Zone (0052, 0075). Pasan por RLS: solo socios del Club Fan ven contenidos,
// y lo bloqueado por fecha llega hasta su día.

export type FanItemVista = FanItem & { archivo_url: string | null };

/** Contenidos visibles de una obra, o de todas si pid es null. */
export async function listFanzone(pid: string | null): Promise<FanItemVista[]> {
  const supabase = await createClient();
  let q = supabase.from("fanzone_items").select("*");
  if (pid) q = q.eq("production_id", pid);
  const { data } = await q;
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

/** Lo que se desbloquea después (solo título y fecha). */
export type FanProximo = { id: string; production_id: string; tipo: FanTipo; categoria: FanCategoria; titulo: string; disponible_desde: string };
export async function getProximos(pid: string | null): Promise<FanProximo[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("fanzone_proximos", { pid });
  return (data ?? []) as FanProximo[];
}

/** Credencial del Club Fan (null si no es socio). */
export type Credencial = { numero: number; desde: string; fundador: boolean };
export async function getCredencial(): Promise<Credencial | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("fan_me");
  return (data as Credencial | null) ?? null;
}

/** "Foto con el elenco": encuentros abiertos a socios. */
export type Encuentro = {
  id: string; production_id: string; performance_id: string; starts_at: string; venue: string | null;
  cupo: number; libres: number; abierto: boolean; notas: string | null; apartado: boolean; con_boleto: boolean;
};
export async function getEncuentros(pid: string | null): Promise<Encuentro[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("fan_encuentros_lista", { pid });
  return (data ?? []) as Encuentro[];
}
