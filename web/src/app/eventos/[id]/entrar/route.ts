import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Entrar a un evento en línea (0081): la base da la liga solo en su horario y registra la asistencia.
export async function GET(req: Request, ctx: RouteContext<"/eventos/[id]/entrar">) {
  const { id } = await ctx.params;
  const volver = new URL(`/eventos#e-${id}`, req.url);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.redirect(volver);
  const supabase = await createClient();
  const { data } = await supabase.rpc("evento_entrar", { eid: id });
  const liga = typeof data === "string" && data.startsWith("https://") ? data : null;
  return NextResponse.redirect(liga ?? volver);
}
