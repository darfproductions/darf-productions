import { createClient } from "@/lib/supabase/server";
import { leerCapa, type Capa, type EstadoCambio, type Seccion } from "@/lib/obra-capa-rules";

// Capas de la página de la obra (0119). La base decide quién ve cada una:
// 'fans' → socios del Club Fan y el equipo; 'borrador' → solo el equipo (lo más nuevo de cada sección).

export async function getCapa(pid: string, cual: "fans" | "borrador"): Promise<Capa> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("obra_capa", { pid, p_cual: cual });
  return leerCapa(data);
}

/** Secciones con cambios sin publicar (para el editor). */
export async function getCambios(pid: string): Promise<EstadoCambio[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("obra_borradores").select("seccion, borrador, fans, borrador_at, fans_at").eq("production_id", pid);
  return ((data ?? []) as { seccion: Seccion; borrador: unknown; fans: unknown; borrador_at: string | null; fans_at: string | null }[])
    .map((r) => ({ seccion: r.seccion, borrador: r.borrador != null, fans: r.fans != null, borrador_at: r.borrador_at, fans_at: r.fans_at }));
}
