import { ImageResponse } from "next/og";
import { getProduction, getTheme } from "@/lib/productions";
import { origenSitio } from "@/lib/site-origin";

// Imagen al compartir la liga de una obra (WhatsApp, Instagram, Facebook): su imagen de
// ambiente, su logo y "Boletos en darfproductions.com".
export const alt = "DARF Productions";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const absoluta = (url: string, origen: string) => (url.startsWith("/") ? `${origen}${url}` : url);

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getProduction(slug);
  const origen = await origenSitio();
  const p = data?.production;
  const t = p ? getTheme(p) : null;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: t?.fondo ?? "#0b0910", color: "#f4f1f8" }}>
        {t?.ambiente && <img src={absoluta(t.ambiente, origen)} alt="" width={1200} height={630} style={{ position: "absolute", top: 0, left: 0, width: 1200, height: 630, objectFit: "cover" }} />}
        <div style={{ position: "absolute", top: 0, left: 0, width: 1200, height: 630, display: "flex", background: "linear-gradient(180deg, rgba(11,9,16,0) 35%, rgba(11,9,16,0.92) 100%)" }} />
        <div style={{ position: "absolute", left: 64, right: 64, bottom: 56, display: "flex", flexDirection: "column", gap: 18 }}>
          {/* El generador de imágenes no lee WebP: con un logo .webp se usa el nombre. */}
          {t?.logo && !/\.webp(\?|$)/i.test(t.logo) ? (
            <img src={absoluta(t.logo, origen)} alt="" height={170} style={{ height: 170, objectFit: "contain", objectPosition: "left bottom", maxWidth: 760 }} />
          ) : (
            <span style={{ fontSize: 84, fontWeight: 900, lineHeight: 1 }}>{p?.nombre ?? "DARF Productions"}</span>
          )}
          <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#d7bb5f" }}>
            {p?.venue ? `${p.venue} · ` : ""}Boletos en darfproductions.com
          </span>
        </div>
      </div>
    ),
    size,
  );
}
