import { NextResponse, type NextRequest } from "next/server";
import { getGafetePublico } from "@/lib/gafete";
import { vcard } from "@/lib/gafete-rules";

// Tarjeta de contacto (.vcf) del gafete: el celular la agrega a sus contactos.
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const g = await getGafetePublico(token);
  if (!g || (g.nivel && g.nivel !== "equipo")) return new NextResponse("No encontrado", { status: 404 });
  const url = g.perfil ? new URL(`/artistas/${g.perfil}`, req.url).toString() : null;
  const nombre = g.nombre.normalize("NFD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "contacto";
  return new NextResponse(vcard(g, url), {
    headers: { "content-type": "text/vcard; charset=utf-8", "content-disposition": `attachment; filename="${nombre}.vcf"`, "cache-control": "no-store" },
  });
}
