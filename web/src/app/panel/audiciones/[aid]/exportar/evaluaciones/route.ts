import { NextResponse } from "next/server";
import { filasExcel, type Evaluaciones } from "@/lib/evaluaciones-rules";
import { csv } from "@/lib/pago-rules";
import { createClient } from "@/lib/supabase/server";

// Evaluaciones de todos los jueces para Excel (0166): una fila por aspirante, ronda y juez, con calificaciones,
// opciones de personaje y notas. La dirección siempre; los jueces a partir de la votación (lo revisa la base).
export async function GET(_req: Request, ctx: RouteContext<"/panel/audiciones/[aid]/exportar/evaluaciones">) {
  const { aid } = await ctx.params;
  const { data, error } = await (await createClient()).rpc("audition_evaluaciones", { aid });
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });
  return new Response(csv(filasExcel(data as Evaluaciones)), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="evaluaciones-${aid.slice(0, 8)}.csv"`, "Cache-Control": "private, no-store" },
  });
}
