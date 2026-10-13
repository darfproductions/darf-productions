import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { boletaPdf } from "@/lib/pdf-boleta";
import { boletaData } from "@/lib/rubric";

// Mi boleta (0058): solo la propia y de un periodo publicado (RLS).
export async function GET(_req: Request, ctx: RouteContext<"/cuenta/produccion/[id]/boleta/[periodo]">) {
  const { id, periodo } = await ctx.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });
  const b = await boletaData(id, periodo, session.userId, session.profile?.nombre || session.email);
  if (!b) return NextResponse.json({ error: "Aún no hay evaluación publicada." }, { status: 404 });
  return new NextResponse(Buffer.from(boletaPdf(b)), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="boleta-${b.periodo.replace(/[^A-Za-z0-9]+/g, "-")}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
