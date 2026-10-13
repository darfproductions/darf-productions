import type { SupabaseClient } from "@supabase/supabase-js";

/** Asientos ocupados de una función, en una sola fila (taken_seats, 0090: sin el tope de 1,000 filas).
 *  Si la base aún no tiene 0090, usa la consulta anterior. */
export async function asientosOcupados(supabase: SupabaseClient, performanceId: string): Promise<{ data: string[] | null; error: { message: string } | null }> {
  const r = await supabase.rpc("taken_seats", { p_performance: performanceId });
  if (!r.error) return { data: (r.data ?? []) as string[], error: null };
  const v = await supabase.rpc("get_taken_seats", { target_performance_id: performanceId });
  return { data: (v.data ?? null) as string[] | null, error: v.error };
}
