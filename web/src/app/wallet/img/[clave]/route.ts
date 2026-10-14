import { NextResponse } from "next/server";
import sharp from "sharp";
import { assetUrl } from "@/lib/productions";
import { createClient } from "@/lib/supabase/server";
import { bandaCredencial, leerImagen, portadaObra, silueta } from "@/lib/wallet-imagenes";

// Imágenes PNG para Google Wallet (Google las descarga por liga pública). Solo cosas que ya son
// públicas: logos de DARF, imagen de obras publicadas y la banda de color de la credencial.
//   darf · fan · obra-<id> · banda-<manager|direccion_general|produccion|direccion|crew|staff|fan|cuenta>[-socio]

const FONDO = "#0b0910";
const HERO = { w: 1032, h: 336 };

/** Logo cuadrado (Google lo muestra en círculo): DARF en blanco sobre el degradado de la marca;
 *  Fan Zone con el monograma dorado sobre fondo oscuro. */
async function cuadro(fan: boolean): Promise<Buffer | null> {
  const img = await leerImagen(fan ? "/marca/darf-monograma-oro.svg" : "/marca/darf-monograma.svg");
  if (!img) return null;
  const chico = await sharp(img, { density: 300 }).resize(400, 400, { fit: "inside" }).png().toBuffer();
  const dentro = fan ? chico : await silueta(chico, "#ffffff");
  const fondo = fan
    ? await sharp({ create: { width: 660, height: 660, channels: 4, background: FONDO } }).png().toBuffer()
    : Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="660" height="660"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#340feb"/><stop offset=".55" stop-color="#830886"/><stop offset="1" stop-color="#d20122"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`);
  return sharp(fondo).composite([{ input: dentro, gravity: "center" }]).png().toBuffer();
}

async function obra(id: string): Promise<Buffer | null> {
  if (!/^[\w-]{1,80}$/.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("productions").select("logo_path, ambiente_path").eq("id", id).in("estado", ["publicada", "archivada"]).maybeSingle();
  if (!data?.ambiente_path) return null;
  const [amb, logo] = await Promise.all([leerImagen(assetUrl(data.ambiente_path as string)), leerImagen(data.logo_path ? assetUrl(data.logo_path as string) : null)]);
  return amb ? portadaObra(amb, logo, HERO.w, HERO.h) : null;
}

export async function GET(_req: Request, ctx: RouteContext<"/wallet/img/[clave]">) {
  const { clave } = await ctx.params;
  const png = clave === "darf" ? await cuadro(false)
    : clave === "fan" ? await cuadro(true)
    : clave.startsWith("obra-") ? await obra(clave.slice(5))
    : clave.startsWith("banda-") ? await bandaCredencial(clave.slice(6), HERO.w, HERO.h)
    : null;
  if (!png) return NextResponse.json({ error: "Imagen no encontrada." }, { status: 404 });
  return new NextResponse(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" } });
}
