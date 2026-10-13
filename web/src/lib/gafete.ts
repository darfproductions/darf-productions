import { origenSitio } from "@/lib/site-origin";
import type { GafetePublico } from "@/lib/gafete-rules";
import { createClient } from "@/lib/supabase/server";

// Gafete digital (0078): lecturas del servidor.

/** Origen del sitio (para la liga del QR): la dirección oficial si está definida. */
export async function origen(): Promise<string> {
  return origenSitio();
}

/** Lo que ve quien escanea el gafete (sin sesión). */
export async function getGafetePublico(token: string): Promise<(GafetePublico & { retratoUrl: string | null }) | null> {
  if (!/^[0-9a-f]{24,80}$/.test(token)) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("badge_publico", { p_token: token });
  if (!data) return null;
  const g = data as GafetePublico;
  return { ...g, retratoUrl: g.retrato_path ? supabase.storage.from("perfiles").getPublicUrl(g.retrato_path).data.publicUrl : null };
}
