import type { MetadataRoute } from "next";
import { env, isDev } from "@/lib/env";

// Buscadores: en PROD todo lo público; nunca el panel, la cuenta ni la compra. Fuera de PROD, nada.
export default function robots(): MetadataRoute.Robots {
  if (isDev) return { rules: { userAgent: "*", disallow: "/" } };
  const base = env.siteUrl || "https://darfproductions.com";
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/panel", "/cuenta", "/comprar", "/expediente", "/auth", "/entrar", "/vista-previa", "/g/", "/f/"] },
    sitemap: `${base}/sitemap.xml`,
  };
}
