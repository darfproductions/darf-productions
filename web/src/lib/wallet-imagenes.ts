import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp, { type OverlayOptions } from "sharp";
import { BANDA_CUENTA } from "@/lib/credencial-rules";
import { BANDA_FAN } from "@/lib/credencial-fan-rules";
import { DEGRADADOS, FRANJAS, type Banda, type Franja } from "@/lib/gafete-rules";

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

/** El logo en un solo color (blanco o negro) para que se lea sobre un fondo de color. */
export async function silueta(img: Buffer, color: string): Promise<Buffer> {
  const { width = 1, height = 1 } = await sharp(img).metadata();
  return sharp({ create: { width, height, channels: 4, background: color } }).composite([{ input: img, blend: "dest-in" }]).png().toBuffer();
}

/** Logo y sello del Club Fan lado a lado, del mismo alto y sin fondo (gafete de quien también es socio). */
export async function logoConSello(logo: Buffer, sello: Buffer, alto = 300): Promise<Buffer> {
  const [a, b] = await Promise.all([
    sharp(logo, { density: 300 }).resize({ height: alto }).png().toBuffer(),
    sharp(sello, { density: 300 }).resize({ height: alto }).png().toBuffer(),
  ]);
  const [ma, mb] = await Promise.all([sharp(a).metadata(), sharp(b).metadata()]);
  const hueco = Math.round(alto * 0.25), wa = ma.width ?? alto, wb = mb.width ?? alto;
  return sharp({ create: { width: wa + hueco + wb, height: alto, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: a, left: 0, top: 0 }, { input: b, left: wa + hueco, top: 0 }]).png().toBuffer();
}

/** Imagen de la obra (ambiente) oscurecida con su logo al centro: franja del boleto y hero de Google. */
export async function portadaObra(ambiente: Buffer, logo: Buffer | null, w: number, h: number): Promise<Buffer> {
  const capas: OverlayOptions[] = [{ input: Buffer.from(`<svg width="${w}" height="${h}"><rect width="100%" height="100%" fill="#000" fill-opacity="0.35"/></svg>`) }];
  if (logo) capas.push({ input: await sharp(logo, { density: 300 }).resize(Math.round(w * 0.62), Math.round(h * 0.7), { fit: "inside" }).png().toBuffer(), gravity: "center" });
  return sharp(ambiente).resize(w, h, { fit: "cover", position: "attention" }).composite(capas).png().toBuffer();
}


/** Banda de color de la credencial (franja del gafete, oro del Club Fan o gris de cuenta) con su
 *  sello: DARF en el gafete; sello del club + logo de Fan Zone en el Club Fan. */
export async function bandaCredencial(clave: string, w: number, h: number): Promise<Buffer | null> {
  // "<franja>-socio": gafete de quien también es socio del Club Fan (lleva el sello junto a DARF).
  const socio = clave.endsWith("-socio");
  const id = socio ? clave.slice(0, -6) : clave;
  const b: Banda | undefined = id === "fan" ? BANDA_FAN : id === "cuenta" ? BANDA_CUENTA : FRANJAS[id as Franja];
  if (!b) return null;
  const stops = b.degradado ?? DEGRADADOS[id as Franja] ?? [[0, b.fondo], [1, b.fondo]] as [number, string][];
  const fondo = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0.35">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join("")}</linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`);
  const piezas: Buffer[] = [];
  if (id === "fan") {
    const [sello, marca] = await Promise.all([leerImagen("/marca/sello-club.svg"), leerImagen("/marca/fan-zone-oro.svg")]);
    if (sello) piezas.push(await silueta(await sharp(sello, { density: 300 }).resize(Math.round(h * 0.72), Math.round(h * 0.72), { fit: "inside" }).png().toBuffer(), b.texto));
    if (marca) piezas.push(await silueta(await sharp(marca, { density: 300 }).resize(Math.round(w * 0.5), Math.round(h * 0.26), { fit: "inside" }).png().toBuffer(), b.texto));
  } else {
    const logo = await leerImagen("/marca/darf-monograma.svg");
    if (logo) piezas.push(await silueta(await sharp(logo, { density: 300 }).resize(Math.round(h * 0.62), Math.round(h * 0.62), { fit: "inside" }).png().toBuffer(), b.texto));
    const sello = socio && id !== "cuenta" ? await leerImagen("/marca/sello-club.svg") : null;
    if (sello) piezas.push(await silueta(await sharp(sello, { density: 300 }).resize(Math.round(h * 0.62), Math.round(h * 0.62), { fit: "inside" }).png().toBuffer(), b.texto));
  }
  if (!piezas.length) return sharp(fondo).png().toBuffer();
  // Las piezas en fila, centradas.
  const medidas = await Promise.all(piezas.map((p) => sharp(p).metadata()));
  const hueco = Math.round(h * 0.12);
  const ancho = medidas.reduce((n, m) => n + (m.width ?? 0), 0) + hueco * (piezas.length - 1);
  let x = Math.round((w - ancho) / 2);
  const capas: OverlayOptions[] = piezas.map((input, i) => {
    const m = medidas[i];
    const capa = { input, left: Math.max(0, x), top: Math.round((h - (m.height ?? 0)) / 2) };
    x += (m.width ?? 0) + hueco;
    return capa;
  });
  return sharp(fondo).composite(capas).png().toBuffer();
}
