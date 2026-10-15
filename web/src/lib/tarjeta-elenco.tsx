/* eslint-disable @next/next/no-img-element -- dentro de ImageResponse (satori), no es una página */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { cargarFuentes } from "@/lib/medalla";
import { isLight } from "@/lib/themes";

// Tarjeta para redes del elenco (0110): foto, logo de la obra, nombre y personaje, con los colores de la
// obra y el logo de DARF. Post 4:5 (1080×1350) e historia 9:16 (1080×1920). Solo servidor.

export type FormatoTarjeta = "post" | "historia";
export const TAMANO: Record<FormatoTarjeta, { w: number; h: number }> = { post: { w: 1080, h: 1350 }, historia: { w: 1080, h: 1920 } };

export type DatosTarjeta = {
  formato: FormatoTarjeta;
  obra: string;
  nombre: string;
  /** Personaje (reparto) o "Ensamble". */
  papel: string;
  fotoUrl: string | null;
  logoUrl: string | null;
  colores: { fondo: string; superficie: string; texto: string; acento: string };
};

/** Imagen como PNG en data URI (satori no lee WebP ni muchos formatos); null si no se puede. */
async function comoPng(url: string | null, ancho: number): Promise<string | null> {
  if (!url) return null;
  try {
    const buf = url.startsWith("/")
      ? await readFile(path.join(process.cwd(), "public", url))
      : Buffer.from(await (await fetch(url, { cache: "no-store" })).arrayBuffer());
    const png = await sharp(buf, { density: 300 }).resize({ width: ancho, withoutEnlargement: false }).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function tarjetaPng(d: DatosTarjeta): Promise<Buffer> {
  const { w, h } = TAMANO[d.formato];
  const historia = d.formato === "historia";
  const claro = isLight(d.colores.fondo);
  const fotoAlto = historia ? 1240 : 860;
  const [foto, logo, darf] = await Promise.all([
    comoPng(d.fotoUrl, w),
    comoPng(d.logoUrl, 760),
    comoPng(claro ? "/marca/darf-horizontal.svg" : "/marca/darf-horizontal-blanco.svg", 360),
  ]);
  const inicial = d.nombre.trim().slice(0, 1).toUpperCase();
  const tamNombre = d.nombre.length > 22 ? 68 : d.nombre.length > 16 ? 80 : 92;

  // Foto de fondo arriba; el texto queda pegado abajo con DARF justo debajo (sin hueco).
  const res = new ImageResponse(
    (
      <div style={{ width: w, height: h, display: "flex", position: "relative", background: d.colores.fondo, color: d.colores.texto, fontFamily: "Montserrat" }}>
        <div style={{ position: "absolute", left: 0, top: 0, width: w, height: fotoAlto, display: "flex", overflow: "hidden", background: d.colores.superficie }}>
          {foto
            ? <img src={foto} width={w} height={fotoAlto} style={{ objectFit: "cover", objectPosition: "top", width: w, height: fotoAlto }} alt="" />
            : <div style={{ width: w, height: fotoAlto, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 360, fontWeight: 900, color: d.colores.acento }}>{inicial}</div>}
          <div style={{ position: "absolute", left: 0, bottom: 0, width: w, height: 420, display: "flex", backgroundImage: `linear-gradient(180deg, transparent, ${d.colores.fondo})` }} />
        </div>
        <div style={{ position: "absolute", left: 0, bottom: 0, width: w, display: "flex", flexDirection: "column", alignItems: "center", padding: `0 60px ${historia ? 100 : 52}px` }}>
          {logo
            ? <img src={logo} style={{ maxWidth: 820, maxHeight: historia ? 320 : 240, objectFit: "contain" }} alt="" />
            : <span style={{ fontSize: 72, fontWeight: 900, letterSpacing: 4 }}>{d.obra.toUpperCase()}</span>}
          <span style={{ marginTop: historia ? 36 : 26, fontSize: historia ? 50 : 44, fontWeight: 800, letterSpacing: 8, color: d.colores.acento, textAlign: "center" }}>{d.papel.toUpperCase()}</span>
          <span style={{ marginTop: 10, fontSize: tamNombre, fontWeight: 900, textAlign: "center", lineHeight: 1.05 }}>{d.nombre}</span>
          {/* Leyenda con el estilo de la banda del gafete: negra, itálica y espaciada (satori no trae itálica: se inclina). */}
          <div style={{ marginTop: historia ? 60 : 40, display: "flex", padding: "10px 34px", background: d.colores.acento, transform: "skewX(-10deg)" }}>
            <span style={{ fontSize: historia ? 34 : 30, fontWeight: 900, letterSpacing: 4, color: d.colores.fondo }}>ADQUIERE TUS BOLETOS</span>
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
