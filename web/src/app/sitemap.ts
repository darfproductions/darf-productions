import type { MetadataRoute } from "next";
import { listPublicAuditions } from "@/lib/auditions";
import { env, isDev } from "@/lib/env";
import { getHomeData } from "@/lib/productions";
import { createClient } from "@/lib/supabase/server";

// Mapa del sitio para buscadores: páginas fijas, obras públicas, convocatorias visibles y
// perfiles de artista públicos. Fuera de PROD queda vacío (no se indexa).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (isDev) return [];
  const base = env.siteUrl || "https://darfproductions.com";
  const fijas = ["", "/producciones", "/eventos", "/audiciones", "/nosotros", "/fan-zone", "/contacto", "/privacidad", "/terminos", "/reembolsos"]
    .map((p) => ({ url: `${base}${p}`, changeFrequency: "weekly" as const, priority: p === "" ? 1 : 0.6 }));
  const [{ productions }, audiciones, artistas] = await Promise.all([
    getHomeData(),
    listPublicAuditions(),
    (await createClient()).from("pro_profiles").select("slug, updated_at").eq("publico", true).not("slug", "is", null),
  ]);
  return [
    ...fijas,
    ...productions.map((p) => ({ url: `${base}/producciones/${p.id}`, changeFrequency: "weekly" as const, priority: 0.9 })),
    ...audiciones.map((a) => ({ url: `${base}/audiciones/${a.id}`, changeFrequency: "daily" as const, priority: 0.7 })),
    ...((artistas.data ?? []) as { slug: string; updated_at: string | null }[]).map((a) => ({
      url: `${base}/artistas/${a.slug}`, lastModified: a.updated_at ?? undefined, changeFrequency: "monthly" as const, priority: 0.4,
    })),
  ];
}
