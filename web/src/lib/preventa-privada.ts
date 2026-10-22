import { createClient } from "@/lib/supabase/server";
import type { MiPreventaPrivada } from "@/lib/disponibilidad";

// Preventa privada (0123): solo quien canjeó un código de la obra recibe sus fechas (el público no las ve).
export async function miPreventaPrivada(pid: string, conSesion: boolean): Promise<MiPreventaPrivada | null> {
  if (!conSesion) return null;
  const { data, error } = await (await createClient()).rpc("mi_preventa_privada", { pid });
  return error ? null : (data as MiPreventaPrivada);
}
