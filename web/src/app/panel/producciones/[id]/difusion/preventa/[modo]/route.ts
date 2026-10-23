import { NextResponse } from "next/server";
import { getObraDifusion } from "@/lib/difusion-datos";
import { preventaPng } from "@/lib/difusion-preventa";
import { esFormatoPreventa, esModoFan, sitioCorto, textoPreventaFan, type FormatoPreventa } from "@/lib/difusion-preventa-rules";
import { env } from "@/lib/env";
import { can } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";

// Preventa del Club Fan: ?f=cuadrado|post|historia, &funcion=<id> (fechas de esa función; sin ella, las de la obra)
// y &descargar=1. Mismo permiso que Difusión.
export async function GET(req: Request, ctx: RouteContext<"/panel/producciones/[id]/difusion/preventa/[modo]">) {
  const { id, modo } = await ctx.params;
  const access = await requirePanel(`/panel/producciones/${id}/difusion`);
  if (!can(access, id, "obra.editar") && !can(access, id, "obra.publicar")) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  if (!esModoFan(modo)) return NextResponse.json({ error: "Ese diseño no existe." }, { status: 404 });
  const sp = new URL(req.url).searchParams;
  const f = sp.get("f");
  const formato: FormatoPreventa = esFormatoPreventa(f) ? f : "post";
  const obra = await getObraDifusion(id);
  if (!obra) return NextResponse.json({ error: "No se encontró." }, { status: 404 });
  const fn = sp.get("funcion") ? obra.funciones.find((x) => x.id === sp.get("funcion")) : null;
  const desde = fn ? fn.preventa_desde ?? null : obra.preventa.desde;
  const hasta = fn ? fn.preventa_hasta ?? null : obra.preventa.hasta;
  const png = await preventaPng({
    formato, obra: obra.nombre, logoUrl: obra.logoUrl, colores: obra.colores, fan: true,
    fondoUrl: formato === "historia" ? obra.poster.p9x16 : obra.poster.p3x4,
    texto: textoPreventaFan(modo, desde, hasta, sitioCorto(env.siteUrl)),
  });
  const archivo = `${obra.nombre}-preventa-club-fan-${modo}-${formato}`.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9-]+/g, "-");
  return new NextResponse(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store", ...(sp.get("descargar") ? { "Content-Disposition": `attachment; filename="${archivo}.png"` } : {}) },
  });
}
