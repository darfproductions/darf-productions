import { NextResponse } from "next/server";
import { juezActual } from "../../actions";

// Quién está en escena, para la pantalla del juez (se pregunta cada 4 s). Va por GET y no como acción del servidor:
// las acciones se atienden de una en una en el navegador, y la pregunta repetida dejaba «Guardando…» esperando atrás.
export async function GET(req: Request, ctx: RouteContext<"/panel/audiciones/[aid]/en-escena">) {
  const { aid } = await ctx.params;
  const sp = new URL(req.url).searchParams;
  const ronda = Math.max(1, Number(sp.get("ronda") ?? 1) || 1);
  const tengo = (sp.get("tengo") ?? "").split(",").filter(Boolean).slice(0, 20);
  const d = await juezActual(aid, ronda, tengo);
  return NextResponse.json(d, { headers: { "Cache-Control": "private, no-store" } });
}
