import { headers } from "next/headers";
import type { GafetePublico } from "@/lib/gafete-rules";
import { createClient } from "@/lib/supabase/server";

// Gafete digital (0078): lecturas del servidor.

/** Origen del sitio (para la liga del QR), tal como llegó la petición. */
export async function origen(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
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
