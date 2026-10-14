import { NextResponse } from "next/server";
import { leerMedalla } from "@/lib/lealtad-rules";
import { medallaPng } from "@/lib/medalla";

// Medallas con su número: /medalla/12 (DARF Loyalty, equipo, 0103) y /medalla/f12 (fans, 0104).
// Públicas (solo es el dibujo).
export async function GET(_req: Request, ctx: RouteContext<"/medalla/[n]">) {
  const { n } = await ctx.params;
  const m = leerMedalla(`/medalla/${n}`);
  const png = m ? await medallaPng(m.n, 512, m.prog) : null;
  if (!png) return NextResponse.json({ error: "Medalla no encontrada." }, { status: 404 });
  return new NextResponse(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" } });
}
