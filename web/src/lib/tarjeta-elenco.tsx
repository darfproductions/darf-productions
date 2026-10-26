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
export async function comoPng(url: string | null, ancho: number): Promise<string | null> {
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
  // En el post (más bajito) la foto sube para que la cara no quede detrás del logo de la obra (2026-10-26: un poco
  // más, con el logo, la leyenda y DARF más chicos y pegados abajo).
  const subir = historia ? 0 : 230;
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
            ? <img src={foto} width={w} height={fotoAlto + subir} style={{ objectFit: "cover", objectPosition: "top", width: w, height: fotoAlto + subir, marginTop: -subir }} alt="" />
            : <div style={{ width: w, height: fotoAlto, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 360, fontWeight: 900, color: d.colores.acento }}>{inicial}</div>}
          <div style={{ position: "absolute", left: 0, bottom: 0, width: w, height: historia ? 340 : 300, display: "flex", backgroundImage: `linear-gradient(180deg, transparent 0%, transparent 25%, ${d.colores.fondo} 100%)` }} />
        </div>
        <div style={{ position: "absolute", left: 0, bottom: 0, width: w, display: "flex", flexDirection: "column", alignItems: "center", padding: `0 60px ${historia ? 100 : 34}px` }}>
          {logo
            ? <img src={logo} style={{ maxWidth: historia ? 820 : 700, maxHeight: historia ? 320 : 200, objectFit: "contain" }} alt="" />
            : <span style={{ fontSize: 72, fontWeight: 900, letterSpacing: 4 }}>{d.obra.toUpperCase()}</span>}
          <span style={{ marginTop: historia ? 36 : 20, fontSize: historia ? 50 : 40, fontWeight: 800, letterSpacing: 8, color: d.colores.acento, textAlign: "center" }}>{d.papel.toUpperCase()}</span>
          <span style={{ marginTop: 10, fontSize: tamNombre, fontWeight: 900, textAlign: "center", lineHeight: 1.05 }}>{d.nombre}</span>
          {/* Leyenda con el estilo de la banda del gafete: negra, itálica y espaciada (satori no trae itálica: se inclina). */}
          <div style={{ marginTop: historia ? 60 : 26, display: "flex", padding: historia ? "10px 34px" : "7px 26px", background: d.colores.acento, transform: "skewX(-10deg)" }}>
            <span style={{ fontSize: historia ? 34 : 24, fontWeight: 900, letterSpacing: 4, color: d.colores.fondo }}>ADQUIERE TUS BOLETOS</span>
          </div>
          {darf ? <img src={darf} style={{ marginTop: historia ? 34 : 20, width: historia ? 380 : 290, objectFit: "contain" }} alt="" /> : <span style={{ marginTop: 26, fontSize: 38, fontWeight: 900 }}>DARF PRODUCTIONS</span>}
          <span style={{ marginTop: historia ? 10 : 6, fontSize: historia ? 30 : 22, fontWeight: 800, letterSpacing: 2 }}>darfproductions.com</span>
        </div>
      </div>
    ),
    { width: w, height: h, fonts: await cargarFuentes() },
  );
  return Buffer.from(await res.arrayBuffer());
}
