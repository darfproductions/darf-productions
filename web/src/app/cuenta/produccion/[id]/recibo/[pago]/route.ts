import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getRecibo, pdfResponse } from "@/lib/pagos";
import { reciboPdf } from "@/lib/pdf-recibo";

// Recibo de un pago (0079): la persona o quien maneja pagos en la obra (lo decide la base).
export async function GET(_req: Request, ctx: RouteContext<"/cuenta/produccion/[id]/recibo/[pago]">) {
  const { id, pago } = await ctx.params;
  if (!(await getSession())) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });
  const r = await getRecibo(pago);
  if (!r || r.production_id !== id) return NextResponse.json({ error: "Ese recibo no existe o no es tuyo." }, { status: 404 });
  return pdfResponse(reciboPdf(r), `recibo-${r.folio}.pdf`);
}
