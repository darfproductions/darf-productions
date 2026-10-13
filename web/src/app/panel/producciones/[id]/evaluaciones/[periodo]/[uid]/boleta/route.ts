import { NextResponse } from "next/server";
import { boletaPdf } from "@/lib/pdf-boleta";
import { boletaData } from "@/lib/rubric";
import { createClient } from "@/lib/supabase/server";

// Boleta de un alumno para el equipo (rubrica.gestionar: lo revisa RLS al leer la evaluación).
export async function GET(_req: Request, ctx: RouteContext<"/panel/producciones/[id]/evaluaciones/[periodo]/[uid]/boleta">) {
  const { id, periodo, uid } = await ctx.params;
  const supabase = await createClient();
  const { data: roster, error } = await supabase.rpc("rubric_roster", { pid: id });
  if (error) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const alumno = ((roster ?? []) as { user_id: string; nombre: string }[]).find((a) => a.user_id === uid)?.nombre;
  const b = alumno ? await boletaData(id, periodo, uid, alumno) : null;
  if (!b) return NextResponse.json({ error: "No hay evaluación." }, { status: 404 });
  return new NextResponse(Buffer.from(boletaPdf(b)), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="boleta-${b.periodo.replace(/[^A-Za-z0-9]+/g, "-")}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
