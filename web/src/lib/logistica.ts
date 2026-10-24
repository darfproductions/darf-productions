import { createClient } from "@/lib/supabase/server";
import { horario, type Horario, type Llamado, type Logistica } from "@/lib/logistica-rules";

// 0127: carga de la logística de la obra (pública) y de sus llamados (solo producción; RLS).

export async function getLogistica(pid: string): Promise<Logistica | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("obra_logistica")
    .select("puertas_min, duracion_min, intermedio_min, direccion, maps_url, acceso_tardio, indicaciones").eq("production_id", pid).maybeSingle();
  return (data as Logistica | null) ?? null;
}

export async function getLlamados(pid: string): Promise<Llamado[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("obra_llamados")
    .select("id, nombre, minutos_antes, elenco, grupos, equipo_todos, orden").eq("production_id", pid).order("orden").order("minutos_antes", { ascending: false });
  return ((data ?? []) as Llamado[]).map((l) => ({ ...l, grupos: l.grupos ?? [] }));
}

/** Horario de una función (puertas, inicio, fin) y la logística de su obra. Sin logística ni horario propio: h = null. */
export async function horarioDeFuncion(perfId: string, pid: string): Promise<{ h: Horario | null; l: Logistica | null }> {
  const supabase = await createClient();
  const [l, { data: f }] = await Promise.all([
    getLogistica(pid),
    supabase.from("performances").select("starts_at, puertas_at, termina_at").eq("id", perfId).maybeSingle(),
  ]);
  const fn = f as { starts_at: string | null; puertas_at: string | null; termina_at: string | null } | null;
  if (!fn?.starts_at || (!l && !fn.puertas_at && !fn.termina_at)) return { h: null, l };
  return { h: horario({ ...fn, starts_at: fn.starts_at }, l), l };
}
