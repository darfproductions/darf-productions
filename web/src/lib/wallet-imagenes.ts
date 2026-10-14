import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

// Imágenes de los pases de Wallet (solo servidor). Las de la web viven en public/ (se leen del disco:
// next.config incluye public/marca y public/producciones en estas rutas) y las de Storage por URL.
// Todo sale en PNG, que es lo que piden Apple y Google.

/** Lee una imagen: "/marca/x.svg" del disco (public) o una URL https. null si no se puede. */
export async function leerImagen(src: string | null | undefined): Promise<Buffer | null> {
  if (!src) return null;
  try {
    if (src.startsWith("/")) {
      const limpio = path.normalize(src).replace(/^([/\\])+/, "");
      if (limpio.startsWith("..")) return null;
      return await readFile(path.join(process.cwd(), "public", limpio));
    }
    if (!/^https:\/\//.test(src)) return null;
    const r = await fetch(src, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch {
    return null;
  }
}

const ESCALAS = [1, 2, 3] as const;
const sufijo = (e: number) => (e === 1 ? "" : `@${e}x`);

/** Recorta para llenar exactamente w×h (puntos) en @1x, @2x y @3x. */
export async function cubrir(img: Buffer, nombre: string, w: number, h: number): Promise<Record<string, Buffer>> {
  const out: Record<string, Buffer> = {};
  for (const e of ESCALAS) {
    out[`${nombre}${sufijo(e)}.png`] = await sharp(img, { density: 300 }).resize(w * e, h * e, { fit: "cover", position: "attention" }).png().toBuffer();
  }
  return out;
}

/** Cabe dentro de w×h sin recortar y sin fondo (logos). */
export async function contener(img: Buffer, nombre: string, w: number, h: number): Promise<Record<string, Buffer>> {
  const out: Record<string, Buffer> = {};
  for (const e of ESCALAS) {
    out[`${nombre}${sufijo(e)}.png`] = await sharp(img, { density: 300 }).resize(w * e, h * e, { fit: "inside", withoutEnlargement: false }).png().toBuffer();
  }
  return out;
}

/** Ícono cuadrado sobre un color de fondo (el ícono de las notificaciones no debe ser transparente). */
export async function icono(img: Buffer, fondo: string, nombre = "icon", lado = 29): Promise<Record<string, Buffer>> {
  const out: Record<string, Buffer> = {};
  for (const e of ESCALAS) {
    const n = lado * e;
    const dentro = await sharp(img, { density: 300 }).resize(Math.round(n * 0.78), Math.round(n * 0.78), { fit: "inside" }).png().toBuffer();
    out[`${nombre}${sufijo(e)}.png`] = await sharp({ create: { width: n, height: n, channels: 4, background: fondo } })
      .composite([{ input: dentro, gravity: "center" }]).png().toBuffer();
  }
  return out;
}

/** Una sola imagen PNG (para Google, que la descarga por URL). */
export async function png(img: Buffer, w: number, h: number, fit: "cover" | "inside"): Promise<Buffer> {
  return sharp(img, { density: 300 }).resize(w, h, { fit, position: "attention" }).png().toBuffer();
}
