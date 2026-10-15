import { NextResponse } from "next/server";
import { difusionPng } from "@/lib/difusion";
import { funcionPorOmision, getObraDifusion } from "@/lib/difusion-datos";
import { DISENOS, textoDifusion, tipoValido } from "@/lib/difusion-rules";
import { can } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import type { FormatoTarjeta } from "@/lib/tarjeta-elenco";

// Diseño de difusión (0111): ?f=post (4:5) o ?f=historia (9:16), &funcion=<id> y &descargar=1 para bajarlo.
// Solo para quien edita o publica la página de la obra.
export async function GET(req: Request, ctx: RouteContext<"/panel/producciones/[id]/difusion/[tipo]">) {
  const { id, tipo: t } = await ctx.params;
  const access = await requirePanel(`/panel/producciones/${id}/difusion`);
  if (!can(access, id, "obra.editar") && !can(access, id, "obra.publicar")) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const tipo = tipoValido(t);
  if (!tipo) return NextResponse.json({ error: "Ese diseño no existe." }, { status: 404 });
  const sp = new URL(req.url).searchParams;
  const formato: FormatoTarjeta = sp.get("f") === "historia" ? "historia" : "post";
  const obra = await getObraDifusion(id);
  if (!obra) return NextResponse.json({ error: "No se encontró." }, { status: 404 });
  const usaFuncion = DISENOS.find((d) => d.id === tipo)!.funcion;
  const elegida = sp.get("funcion");
  // funcion=todas: toda la temporada ("Funciones agotadas"); sin función: la próxima.
  const funcion = !usaFuncion || elegida === "todas" ? null
    : elegida ? obra.funciones.find((f) => f.id === elegida) ?? null
    : funcionPorOmision(obra.funciones);
  const png = await difusionPng({
    formato, obra: obra.nombre, logoUrl: obra.logoUrl, fondoUrl: obra.fondo[formato], colores: obra.colores,
    texto: textoDifusion(tipo, { funcion, funciones: obra.funciones, venue: obra.venue }),
  });
  const archivo = `${obra.nombre}-${tipo}-${formato}`.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9-]+/g, "-");
  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png", "Cache-Control": "private, no-store",
      ...(sp.get("descargar") ? { "Content-Disposition": `attachment; filename="${archivo}.png"` } : {}),
    },
  });
}
