import { headers } from "next/headers";
import QRCode from "qrcode";
import { ligaGafete, type GafeteMio, type GafetePublico } from "@/lib/gafete-rules";
import { createClient } from "@/lib/supabase/server";

// Gafete digital (0078): lecturas del servidor.

/** Origen del sitio (para la liga del QR), tal como llegó la petición. */
export async function origen(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export type MiGafeteVista = GafeteMio & { nombre: string; fotoUrl: string | null; qr: string; liga: string };

/** Mi gafete con foto y QR listos; null si no me toca (solo equipo y elencos). */
export async function getMiGafete(): Promise<MiGafeteVista | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("badge_mio");
  if (!data) return null;
  const g = data as GafeteMio;
  const { data: auth } = await supabase.auth.getUser();
  const { data: perfil } = await supabase.from("profiles").select("nombre, foto_path").eq("id", auth.user?.id ?? "").maybeSingle();
  const fotoUrl = perfil?.foto_path ? (await supabase.storage.from("avatares").createSignedUrl(perfil.foto_path as string, 3600)).data?.signedUrl ?? null : null;
  const liga = ligaGafete(await origen(), g.token);
  const qr = await QRCode.toDataURL(liga, { margin: 1, width: 480, errorCorrectionLevel: "M" });
  return { ...g, nombre: (perfil?.nombre as string | null) ?? "", fotoUrl, qr, liga };
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
