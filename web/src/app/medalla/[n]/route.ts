import { NextResponse } from "next/server";
import { medallaPng } from "@/lib/medalla";

// Medalla DARF Loyalty (0103) con el número de producciones: /medalla/12. Pública (solo es el dibujo).
export async function GET(_req: Request, ctx: RouteContext<"/medalla/[n]">) {
  const { n } = await ctx.params;
  const num = /^\d{1,3}$/.test(n) ? Number(n) : 0;
  const png = await medallaPng(num);
  if (!png) return NextResponse.json({ error: "Medalla no encontrada." }, { status: 404 });
  return new NextResponse(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" } });
}
