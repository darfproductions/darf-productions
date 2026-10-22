import { NextResponse } from "next/server";
import { getObraDifusion } from "@/lib/difusion-datos";
import { preventaPng } from "@/lib/difusion-preventa";
import { esFormatoPreventa, sitioCorto, textoPreventaCodigo, type FormatoPreventa } from "@/lib/difusion-preventa-rules";
import { env } from "@/lib/env";
import { can } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

// Preventa privada (0123): diseño de un código con su liga y QR. ?f=cuadrado|post|historia&descargar=1.
// Mismos permisos que la pestaña Preventa privada; la base solo da los códigos de esta obra a su equipo.
export async function GET(req: Request, ctx: RouteContext<"/panel/producciones/[id]/boletos/preventa/[codigo]/diseno">) {
  const { id, codigo } = await ctx.params;
  const access = await requirePanel(`/panel/producciones/${id}/boletos/preventa`);
  if (!can(access, id, "funciones.gestionar") && !can(access, id, "ventas.ver")) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const supabase = await createClient();
  const [{ data: c }, { data: priv }, obra] = await Promise.all([
    supabase.from("preventa_codigos").select("codigo, nombre").eq("production_id", id).eq("codigo", codigo.toUpperCase()).maybeSingle(),
    supabase.from("preventa_privada_obras").select("desde").eq("production_id", id).maybeSingle(),
    getObraDifusion(id),
  ]);
  if (!c || !obra) return NextResponse.json({ error: "No se encontró el código." }, { status: 404 });
  const sp = new URL(req.url).searchParams;
  const f = sp.get("f");
  const formato: FormatoPreventa = esFormatoPreventa(f) ? f : "post";
  const base = (env.siteUrl || "https://darfproductions.com").replace(/\/$/, "");
  const t = textoPreventaCodigo({ nombre: c.nombre as string, codigo: c.codigo as string, desde: (priv?.desde as string | null) ?? null, hasta: obra.preventa.desde, sitio: sitioCorto(base) });
  const png = await preventaPng({
    formato, obra: obra.nombre, logoUrl: obra.logoUrl, colores: obra.colores, fan: false,
    fondoUrl: formato === "historia" ? obra.poster.p9x16 : obra.poster.p3x4,
    texto: t, codigo: { codigo: t.codigo, liga: t.liga, url: `${base}/preventa/${t.codigo}` },
  });
  const archivo = `${obra.nombre}-preventa-${c.codigo}-${formato}`.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9-]+/g, "-");
  return new NextResponse(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store", ...(sp.get("descargar") ? { "Content-Disposition": `attachment; filename="${archivo}.png"` } : {}) },
  });
}
