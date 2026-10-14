import { NextResponse } from "next/server";
import sharp, { type OverlayOptions } from "sharp";
import { BANDA_CUENTA } from "@/lib/credencial-rules";
import { BANDA_FAN } from "@/lib/credencial-fan-rules";
import { FRANJAS, type Banda, type Franja } from "@/lib/gafete-rules";
import { assetUrl } from "@/lib/productions";
import { createClient } from "@/lib/supabase/server";
import { leerImagen } from "@/lib/wallet-imagenes";

// Imágenes PNG para Google Wallet (Google las descarga por liga pública). Solo cosas que ya son
// públicas: logos de DARF, imagen de obras publicadas y la banda de color de la credencial.
//   darf · fan · obra-<id> · banda-<manager|produccion|direccion|crew|staff|fan|cuenta>

const FONDO = "#0b0910";
const HERO = { w: 1032, h: 336 };

async function cuadro(src: string): Promise<Buffer | null> {
  const img = await leerImagen(src);
  if (!img) return null;
  const dentro = await sharp(img, { density: 300 }).resize(460, 460, { fit: "inside" }).png().toBuffer();
  return sharp({ create: { width: 660, height: 660, channels: 4, background: FONDO } }).composite([{ input: dentro, gravity: "center" }]).png().toBuffer();
}

async function obra(id: string): Promise<Buffer | null> {
  if (!/^[\w-]{1,80}$/.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("productions").select("logo_path, ambiente_path").eq("id", id).in("estado", ["publicada", "archivada"]).maybeSingle();
  if (!data?.ambiente_path) return null;
  const [amb, logo] = await Promise.all([leerImagen(assetUrl(data.ambiente_path as string)), leerImagen(data.logo_path ? assetUrl(data.logo_path as string) : null)]);
  if (!amb) return null;
  const capas: OverlayOptions[] = [{ input: Buffer.from(`<svg width="${HERO.w}" height="${HERO.h}"><rect width="100%" height="100%" fill="#000" fill-opacity="0.35"/></svg>`) }];
  if (logo) capas.push({ input: await sharp(logo, { density: 300 }).resize(620, 220, { fit: "inside" }).png().toBuffer(), gravity: "center" });
  return sharp(amb).resize(HERO.w, HERO.h, { fit: "cover", position: "attention" }).composite(capas).png().toBuffer();
}

/** El logo en un solo color (blanco o negro, el texto de la banda) para que se lea sobre ella. */
async function silueta(img: Buffer, color: string): Promise<Buffer> {
  const { width = 1, height = 1 } = await sharp(img).metadata();
  return sharp({ create: { width, height, channels: 4, background: color } }).composite([{ input: img, blend: "dest-in" }]).png().toBuffer();
}

async function banda(id: string): Promise<Buffer | null> {
  const b: Banda | undefined = id === "fan" ? BANDA_FAN : id === "cuenta" ? BANDA_CUENTA : FRANJAS[id as Franja];
  if (!b) return null;
  const stops = b.degradado ?? (id === "manager" ? [[0, "#340feb"], [0.55, "#830886"], [1, "#d20122"]] as [number, string][] : [[0, b.fondo], [1, b.fondo]] as [number, string][]);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${HERO.w}" height="${HERO.h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0.35">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join("")}</linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
  const logo = await leerImagen(id === "fan" ? "/marca/sello-club.svg" : "/marca/darf-monograma.svg");
  const capas: OverlayOptions[] = logo ? [{ input: await silueta(await sharp(logo, { density: 300 }).resize(220, 220, { fit: "inside" }).png().toBuffer(), b.texto), gravity: "center" }] : [];
  return sharp(Buffer.from(svg)).composite(capas).png().toBuffer();
}

export async function GET(_req: Request, ctx: RouteContext<"/wallet/img/[clave]">) {
  const { clave } = await ctx.params;
  const png = clave === "darf" ? await cuadro("/marca/darf-monograma.svg")
    : clave === "fan" ? await cuadro("/marca/fan-zone-oro.svg")
    : clave.startsWith("obra-") ? await obra(clave.slice(5))
    : clave.startsWith("banda-") ? await banda(clave.slice(6))
    : null;
  if (!png) return NextResponse.json({ error: "Imagen no encontrada." }, { status: 404 });
  return new NextResponse(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" } });
}
