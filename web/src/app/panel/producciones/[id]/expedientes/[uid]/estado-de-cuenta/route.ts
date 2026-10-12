import { NextResponse } from "next/server";
import { getEstadoCuenta, pdfResponse } from "@/lib/pagos";
import { estadoCuentaPdf } from "@/lib/pdf-recibo";
import { createClient } from "@/lib/supabase/server";

// Estado de cuenta de un integrante para quien maneja pagos (mensualidades.gestionar).
export async function GET(_req: Request, ctx: RouteContext<"/panel/producciones/[id]/expedientes/[uid]/estado-de-cuenta">) {
  const { id, uid } = await ctx.params;
  const supabase = await createClient();
  const { data: puede } = await supabase.rpc("has_perm", { pid: id, perm: "mensualidades.gestionar" });
  if (!puede) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const { data: roster } = await supabase.rpc("cast_roster", { pid: id });
  const nombre = ((roster ?? []) as { user_id: string; nombre: string }[]).find((r) => r.user_id === uid)?.nombre;
  const e = nombre ? await getEstadoCuenta(id, uid, nombre) : null;
  if (!e) return NextResponse.json({ error: "No hay pagos para esta persona." }, { status: 404 });
  return pdfResponse(estadoCuentaPdf(e), `estado-de-cuenta-${nombre!.replace(/[^A-Za-z0-9]+/g, "-")}.pdf`);
}
