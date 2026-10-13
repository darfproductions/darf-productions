import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Abrir una notificación: la marca leída y lleva a su liga (solo ligas internas del sitio).
// La base solo deja ver y marcar las propias (RLS).
export async function GET(req: NextRequest, { params }: RouteContext<"/notificacion/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("notifications").select("href, read_at").eq("id", Number(id)).maybeSingle();
  if (data && !data.read_at) await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", Number(id));
  const destino = typeof data?.href === "string" && data.href.startsWith("/") && !data.href.startsWith("//") ? data.href : "/cuenta/notificaciones";
  return NextResponse.redirect(new URL(destino, req.url));
}
