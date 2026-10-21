import { NextResponse } from "next/server";
import { guiaPng } from "@/lib/difusion-guias";
import { guiaValida } from "@/lib/difusion-guias-rules";
import { env, isDev } from "@/lib/env";
import { casa } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import type { FormatoTarjeta } from "@/lib/tarjeta-elenco";

// Guía de difusión de DARF: ?f=post (4:5) o ?f=historia (9:16), &descargar=1 para bajarla.
export async function GET(req: Request, ctx: RouteContext<"/panel/ajustes/difusion/[tipo]">) {
  const { tipo } = await ctx.params;
  const access = await requirePanel("/panel/ajustes/difusion");
  if (!casa(access, "casa.sitio") && !casa(access, "casa.club")) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const g = guiaValida(tipo);
  if (!g) return NextResponse.json({ error: "Ese diseño no existe." }, { status: 404 });
  const sp = new URL(req.url).searchParams;
  const formato: FormatoTarjeta = sp.get("f") === "historia" ? "historia" : "post";
  // El QR siempre lleva al sitio oficial (también desde DEV), para que la imagen sirva tal cual.
  const sitio = !isDev && env.siteUrl ? env.siteUrl : "https://darfproductions.com";
  const png = await guiaPng(g, formato, sitio);
  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png", "Cache-Control": "private, no-store",
      ...(sp.get("descargar") ? { "Content-Disposition": `attachment; filename="DARF-${g.id}-${formato}.png"` } : {}),
    },
  });
}
