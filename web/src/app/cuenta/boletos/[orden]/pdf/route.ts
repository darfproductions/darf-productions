import { textosBoleto, type BeneficioBoleto } from "@/lib/beneficios-rules";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { ticketsPdf } from "@/lib/pdf-ticket";
import { formatPerformanceDate } from "@/lib/productions";
import { createClient } from "@/lib/supabase/server";

type Row = {
  order_code: string; status: string; buyer_nombre: string;
  performances: { starts_at: string | null; venue: string | null; productions: { nombre: string; venue: string | null } | null } | null;
  tickets: { id: string; is_active: boolean; qr_token: string; seats: { seat_label: string } | null; price_categories: { nombre: string } | null }[];
};

// Boletos de una orden en PDF (Fase 4B). Solo la orden propia y aprobada (RLS: cada quien lee sus órdenes).
export async function GET(_req: Request, ctx: RouteContext<"/cuenta/boletos/[orden]/pdf">) {
  const { orden } = await ctx.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select("order_code, status, buyer_nombre, performances(starts_at, venue, productions(nombre, venue)), tickets(id, is_active, qr_token, seats(seat_label), price_categories(nombre))")
    .eq("order_code", orden)
    .eq("buyer_user_id", session.userId)
    .maybeSingle();
  const o = data as unknown as Row | null;
  if (!o || o.status !== "aprobado") return NextResponse.json({ error: "No encontramos boletos aprobados con esa orden." }, { status: 404 });
  const activos = o.tickets.filter((t) => t.is_active);
  if (!activos.length) return NextResponse.json({ error: "Esta orden ya no tiene boletos activos." }, { status: 404 });
  // 0122: lo que incluye la zona de cada boleto.
  const { data: benefRows } = await supabase.rpc("beneficios_boletos", { p_tickets: activos.map((t) => t.id) });
  const benef = new Map(((benefRows ?? []) as { ticket_id: string; beneficios: BeneficioBoleto[] }[]).map((r) => [r.ticket_id, r.beneficios]));
  const incluyeDe = (id: string) => {
    const x = textosBoleto(benef.get(id) ?? [], o.performances?.starts_at);
    return [...x.incluye, ...(x.acceso ? [x.acceso] : [])].join(" · ") || null;
  };
  const pdf = ticketsPdf(activos.map((t) => ({
    incluye: incluyeDe(t.id),
    obra: o.performances?.productions?.nombre ?? "DARF Productions",
    funcion: formatPerformanceDate(o.performances?.starts_at ?? null),
    lugar: o.performances?.venue ?? o.performances?.productions?.venue ?? null,
    asiento: t.seats?.seat_label ?? (t.price_categories ? `General · ${t.price_categories.nombre}` : "Admisión general"),
    orden: o.order_code,
    comprador: o.buyer_nombre,
    qr: t.qr_token,
  })));
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="DARF-${o.order_code.replace(/[^A-Za-z0-9-]/g, "")}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
