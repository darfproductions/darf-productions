import { avisosVigentes, type Banner, type BannerItem } from "@/lib/banner-rules";
import { createClient } from "@/lib/supabase/server";

/** Franja de la obra tal como está guardada (todas las fechas); null si nunca se configuró. */
export async function getBanner(pid: string): Promise<Banner | null> {
  const supabase = await createClient();
  const [conf, items] = await Promise.all([
    supabase.from("production_banner").select("estilo, color, activa").eq("production_id", pid).maybeSingle(),
    supabase.from("production_banner_items").select("texto, enlace, boton, inicia, termina").eq("production_id", pid).order("orden"),
  ]);
  if (!conf.data) return null;
  return { ...(conf.data as Omit<Banner, "items">), items: (items.data ?? []) as BannerItem[] };
}

/** Lo que el público ve ahora: encendida y con al menos un aviso vigente. */
export async function getPublicBanner(pid: string): Promise<Banner | null> {
  const b = await getBanner(pid);
  if (!b?.activa) return null;
  const items = avisosVigentes(b.items);
  return items.length ? { ...b, items } : null;
}
