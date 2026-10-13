import { NextResponse } from "next/server";
import { ticketsPdf } from "@/lib/pdf-ticket";
import { formatPerformanceDate } from "@/lib/productions";
import { createClient } from "@/lib/supabase/server";

type Row = {
  order_code: string; status: string; buyer_nombre: string;
  performances: { production_id: string; starts_at: string | null; venue: string | null; productions: { nombre: string; venue: string | null } | null } | null;
  tickets: { is_active: boolean; qr_token: string; seats: { seat_label: string } | null; price_categories: { nombre: string } | null }[];
};

// Reimprimir los boletos de cualquier orden aprobada de la obra (Bloque 4A): sirve para quien compró en
// taquilla sin cuenta o perdió su PDF. Solo quien ve las ventas de esta obra (ventas.ver).
export async function GET(_req: Request, ctx: RouteContext<"/panel/producciones/[id]/boletos/orden/[codigo]/pdf">) {
  const { id, codigo } = await ctx.params;
  const supabase = await createClient();
  const { data: puede } = await supabase.rpc("has_perm", { pid: id, perm: "ventas.ver" });
  if (!puede) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const { data } = await supabase
    .from("orders")
    .select("order_code, status, buyer_nombre, performances!inner(production_id, starts_at, venue, productions(nombre, venue)), tickets(is_active, qr_token, seats(seat_label), price_categories(nombre))")
    .eq("order_code", codigo.toUpperCase())
    .eq("performances.production_id", id)
    .maybeSingle();
  const o = data as unknown as Row | null;
  if (!o || o.status !== "aprobado") return NextResponse.json({ error: "No hay una orden aprobada con ese código en esta obra." }, { status: 404 });
  const activos = o.tickets.filter((t) => t.is_active);
  if (!activos.length) return NextResponse.json({ error: "Esta orden ya no tiene boletos activos." }, { status: 404 });
  const pdf = ticketsPdf(activos.map((t) => ({
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
