import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getEstadoCuenta, pdfResponse } from "@/lib/pagos";
import { estadoCuentaPdf } from "@/lib/pdf-recibo";

// Mi estado de cuenta en PDF (0079): solo lo propio (RLS).
export async function GET(_req: Request, ctx: RouteContext<"/cuenta/produccion/[id]/estado-de-cuenta">) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });
  const e = await getEstadoCuenta(id, session.userId, session.profile?.nombre || session.email);
  if (!e) return NextResponse.json({ error: "Esta obra no tiene pagos." }, { status: 404 });
  return pdfResponse(estadoCuentaPdf(e), `estado-de-cuenta-${id}.pdf`);
}
