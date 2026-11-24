import { NextResponse } from "next/server";
import { csv } from "@/lib/pago-rules";
import { createClient } from "@/lib/supabase/server";
import type { Tablero } from "../../cast/CastBoard";
import { filasCast } from "../../cast/filas-cast";

// 0168: el cast como va (ajuste o enviado) en Excel, por sección. La dirección (lo revisa la base).
export async function GET(_req: Request, ctx: RouteContext<"/panel/audiciones/[aid]/exportar/cast">) {
  const { aid } = await ctx.params;
  const { data, error } = await (await createClient()).rpc("audition_cast_board", { aid });
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });
  const t = data as Tablero;
  const cuerpo = csv([
    ["Sección", "Personaje o grupo", "Nº", "Nombre", "Tiene cuenta"],
    ...filasCast(t).map((f) => [f.seccion, f.personaje, f.numero ?? "", f.nombre || "(vacío)", f.nombre ? (f.cuenta ? "Sí" : "No: avisarle") : ""]),
    [], ["No seleccionados"],
    ...t.fuera.map((p) => ["No seleccionado", "", p.numero ?? "", p.nombre, p.cuenta ? "Sí" : "No"]),
  ]);
  return new Response(cuerpo, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="cast-${aid.slice(0, 8)}.csv"`, "Cache-Control": "private, no-store" },
  });
}
