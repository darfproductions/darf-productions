import { avisosVigentes, type Banner, type BannerItem } from "@/lib/banner-rules";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { publico } from "@/lib/supabase/publico";

/** Franja de la obra tal como está guardada (todas las fechas); null si nunca se configuró. */
export async function getBanner(pid: string): Promise<Banner | null> {
  return leerBanner(await createClient(), pid);
}
// La pública (página de la obra) se guarda 60 s; el panel lee la de arriba al momento.
const leerBannerPublico = publico("franja-obra", (sb, pid: string) => leerBanner(sb, pid));
async function leerBanner(supabase: SupabaseClient, pid: string): Promise<Banner | null> {
  const [conf, items] = await Promise.all([
    supabase.from("production_banner").select("estilo, color, activa").eq("production_id", pid).maybeSingle(),
    supabase.from("production_banner_items").select("texto, enlace, boton, inicia, termina").eq("production_id", pid).order("orden"),
  ]);
  if (!conf.data) return null;
  return { ...(conf.data as Omit<Banner, "items">), items: (items.data ?? []) as BannerItem[] };
}

/** Lo que el público ve ahora: encendida y con al menos un aviso vigente. */
export async function getPublicBanner(pid: string, capa?: Banner): Promise<Banner | null> {
  // 0119: con capa (fans o borrador), esa franja en lugar de la publicada.
  const b = capa ?? await leerBannerPublico(pid);
  if (!b?.activa) return null;
  const items = avisosVigentes(b.items);
  return items.length ? { ...b, items } : null;
}

/** Franja del sitio (0074), abajo del hero del inicio. */
export async function getSiteBanner(): Promise<Banner | null> {
  return leerSiteBanner(await createClient());
}
const leerSiteBannerPublico = publico("franja-sitio", (sb) => leerSiteBanner(sb));
async function leerSiteBanner(supabase: SupabaseClient): Promise<Banner | null> {
  const [conf, items] = await Promise.all([
    supabase.from("site_banner").select("estilo, color, activa").maybeSingle(),
    supabase.from("site_banner_items").select("texto, enlace, boton, inicia, termina").order("orden"),
  ]);
  if (!conf.data) return null;
  return { ...(conf.data as Omit<Banner, "items">), items: (items.data ?? []) as BannerItem[] };
}

export async function getPublicSiteBanner(): Promise<Banner | null> {
  const b = await leerSiteBannerPublico();
  if (!b?.activa) return null;
  const items = avisosVigentes(b.items);
  return items.length ? { ...b, items } : null;
}
