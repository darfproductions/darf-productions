import { getHomeData } from "@/lib/productions";
import { createClient } from "@/lib/supabase/server";

// Preventas del Club Fan (0076) para la Fan Zone: obras con funciones en preventa ahora, y obras
// próximas donde el socio puede activar el recordatorio.

export type PreventaObra = { pid: string; nombre: string; estado: "abierta" | "proxima"; hasta: string | null; recordatorio: boolean };

export async function getPreventas(pid: string | null): Promise<PreventaObra[]> {
  const supabase = await createClient();
  const ahora = new Date().toISOString();
  const [perfs, mios, { productions }] = await Promise.all([
    supabase.from("performances").select("production_id, preventa_hasta").eq("on_sale", true).gt("preventa_hasta", ahora),
    supabase.from("preventa_recordatorios").select("production_id"),
    getHomeData(),
  ]);
  const abiertas = new Map<string, string>();
  for (const r of (perfs.data ?? []) as { production_id: string; preventa_hasta: string }[]) {
    const prev = abiertas.get(r.production_id);
    if (!prev || r.preventa_hasta > prev) abiertas.set(r.production_id, r.preventa_hasta);
  }
  const recordar = new Set(((mios.data ?? []) as { production_id: string }[]).map((r) => r.production_id));
  const out: PreventaObra[] = [];
  for (const p of productions) {
    if (pid && p.id !== pid) continue;
    if (abiertas.has(p.id)) out.push({ pid: p.id, nombre: p.nombre, estado: "abierta", hasta: abiertas.get(p.id)!, recordatorio: false });
    else if (p.estadoPublico === "proximamente") out.push({ pid: p.id, nombre: p.nombre, estado: "proxima", hasta: null, recordatorio: recordar.has(p.id) });
  }
  return out;
}
