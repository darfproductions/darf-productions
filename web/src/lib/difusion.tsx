/* eslint-disable @next/next/no-img-element -- dentro de ImageResponse (satori), no es una página */
import { ImageResponse } from "next/og";
import type { TextoDifusion } from "@/lib/difusion-rules";
import { cargarFuentes } from "@/lib/medalla";
import { TAMANO, comoPng, type FormatoTarjeta } from "@/lib/tarjeta-elenco";
import { isLight } from "@/lib/themes";

// Diseños de difusión (0111): mismo estilo que la tarjeta del elenco. Imagen de ambiente de la obra arriba
// con degradado, logo de la obra, mensaje grande, fecha y lugar, franja itálica, DARF y darfproductions.com.

export type DatosImagenDifusion = {
  formato: FormatoTarjeta;
  obra: string;
  texto: TextoDifusion;
  fondoUrl: string | null;
  logoUrl: string | null;
  colores: { fondo: string; superficie: string; texto: string; acento: string };
};

const ORO = "#d7bb5f";
/** Oro metálico del Club Fan (mismo trazo que --oro-metal del sitio). */
const ORO_METAL = "linear-gradient(135deg, #f3e3a6 0%, #d7bb5f 40%, #9e7b33 75%, #e9d58c 100%)";

/** Tamaño del mensaje grande: el renglón más largo cabe en el ancho (Montserrat Black ≈ 0.8 em por letra). */
function tamGrande(t: TextoDifusion, historia: boolean): number {
  if (t.numero) return historia ? 420 : 320;
  const largo = Math.max(...t.grande.split("\n").map((r) => r.length));
  return Math.min(historia ? 190 : 165, Math.floor(940 / (largo * 0.8)));
}

export async function difusionPng(d: DatosImagenDifusion): Promise<Buffer> {
  const { w, h } = TAMANO[d.formato];
  const historia = d.formato === "historia";
  const claro = isLight(d.colores.fondo);
  const t = d.texto;
  const fotoAlto = historia ? 1100 : 780;
  const acento = t.oro ? ORO : d.colores.acento;
  const [fondo, logo, darf, fanZone] = await Promise.all([
    comoPng(d.fondoUrl, w),
    comoPng(d.logoUrl, 760),
    comoPng(claro ? "/marca/darf-horizontal.svg" : "/marca/darf-horizontal-blanco.svg", 360),
    // Preventa del Club Fan: logo de la Fan Zone hasta arriba.
    t.oro ? comoPng("/marca/fan-zone-oro.svg", 640) : Promise.resolve(null),
  ]);

  const res = new ImageResponse(
    (
      <div style={{ width: w, height: h, display: "flex", position: "relative", background: d.colores.fondo, color: d.colores.texto, fontFamily: "Montserrat" }}>
        {fondo ? (
          <div style={{ position: "absolute", left: 0, top: 0, width: w, height: fotoAlto, display: "flex", overflow: "hidden" }}>
            <img src={fondo} width={w} height={fotoAlto} style={{ objectFit: "cover", width: w, height: fotoAlto }} alt="" />
            <div style={{ position: "absolute", left: 0, top: 0, width: w, height: fotoAlto, display: "flex", backgroundImage: `linear-gradient(180deg, transparent 0%, transparent 35%, ${d.colores.fondo} 100%)` }} />
          </div>
        ) : (
          <div style={{ position: "absolute", left: 0, top: 0, width: w, height: h, display: "flex", backgroundImage: `radial-gradient(circle at 50% 18%, ${acento}55 0%, ${d.colores.fondo} 62%)` }} />
        )}
        {fanZone && (
          <div style={{ position: "absolute", left: 0, top: historia ? 110 : 56, width: w, display: "flex", justifyContent: "center" }}>
            <img src={fanZone} style={{ width: historia ? 560 : 460, objectFit: "contain" }} alt="" />
          </div>
        )}
        <div style={{ position: "absolute", left: 0, bottom: 0, width: w, display: "flex", flexDirection: "column", alignItems: "center", padding: `0 60px ${historia ? 100 : 52}px` }}>
          {logo
            ? <img src={logo} style={{ maxWidth: 820, maxHeight: historia ? 340 : 230, objectFit: "contain" }} alt="" />
            : <span style={{ fontSize: 72, fontWeight: 900, letterSpacing: 4 }}>{d.obra.toUpperCase()}</span>}
          {t.arriba && <span style={{ marginTop: historia ? 40 : 28, fontSize: historia ? 50 : 42, fontWeight: 800, letterSpacing: 8, color: acento, textAlign: "center" }}>{t.arriba.toUpperCase()}</span>}
          <div style={{ marginTop: t.arriba ? 4 : historia ? 40 : 28, display: "flex", flexDirection: "column", alignItems: "center" }}>
            {t.grande.split("\n").map((r) => (
              <span key={r} style={{ fontSize: tamGrande(t, historia), fontWeight: 900, textAlign: "center", lineHeight: t.numero ? 0.9 : 1, letterSpacing: t.numero ? -8 : 0,
                // "Club Fan" en el oro metálico del club.
                ...(t.oro && /club fan/i.test(r) ? { backgroundImage: ORO_METAL, backgroundClip: "text", color: "transparent" } : {}) }}>{r.toUpperCase()}</span>
            ))}
          </div>
          {t.abajo && <span style={{ marginTop: 6, fontSize: t.numero ? (historia ? 84 : 70) : historia ? 40 : 34, fontWeight: t.numero ? 900 : 800, letterSpacing: t.numero ? 10 : 2, color: t.numero ? acento : d.colores.texto, textAlign: "center" }}>{t.numero ? t.abajo.toUpperCase() : t.abajo}</span>}
          <span style={{ marginTop: historia ? 30 : 20, fontSize: historia ? 40 : 32, fontWeight: 800, textAlign: "center" }}>{t.detalle}</span>
          {t.lugar && <span style={{ marginTop: 4, fontSize: historia ? 34 : 27, fontWeight: 800, textAlign: "center", opacity: 0.8 }}>{t.lugar}</span>}
          {/* Franja con el estilo de la banda del gafete: itálica (satori no trae itálica: se inclina). */}
          <div style={{ marginTop: historia ? 52 : 34, display: "flex", padding: "10px 34px", background: acento, transform: "skewX(-10deg)" }}>
            <span style={{ fontSize: historia ? 34 : 30, fontWeight: 900, letterSpacing: 4, color: t.oro ? "#0b0910" : d.colores.fondo }}>{t.banda.toUpperCase()}</span>
          </div>
          {darf ? <img src={darf} style={{ marginTop: historia ? 34 : 26, width: 380, objectFit: "contain" }} alt="" /> : <span style={{ marginTop: 26, fontSize: 38, fontWeight: 900 }}>DARF PRODUCTIONS</span>}
          <span style={{ marginTop: 10, fontSize: historia ? 30 : 26, fontWeight: 800, letterSpacing: 2 }}>darfproductions.com</span>
        </div>
      </div>
    ),
    { width: w, height: h, fonts: await cargarFuentes() },
  );
  return Buffer.from(await res.arrayBuffer());
}
