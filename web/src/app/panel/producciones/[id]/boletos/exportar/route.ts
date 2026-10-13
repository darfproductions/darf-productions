import { NextResponse, type NextRequest } from "next/server";
import { listOrders, listPerformances } from "@/lib/boleteria";
import { csv } from "@/lib/pago-rules";
import { formatPerformanceDate } from "@/lib/productions";
import { createClient } from "@/lib/supabase/server";
import { estadoOrden, metodoLabel } from "@/lib/ventas-rules";

const fecha = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

// Órdenes de la obra para Excel (Bloque 4B), con los mismos filtros de la lista. Todas, sin tope. ventas.ver.
export async function GET(req: NextRequest, ctx: RouteContext<"/panel/producciones/[id]/boletos/exportar">) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: puede } = await supabase.rpc("has_perm", { pid: id, perm: "ventas.ver" });
  if (!puede) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const funcion = req.nextUrl.searchParams.get("funcion") || undefined;
  const estado = req.nextUrl.searchParams.get("estado") || undefined;
  const [ordenes, funciones] = await Promise.all([listOrders(id, { funcion, estado, todas: true }), listPerformances(id)]);
  const nombreFuncion = new Map(funciones.map((f) => [f.id, formatPerformanceDate(f.starts_at)]));
  const cuerpo = csv([
    ["Orden", "Estado", "Función", "Comprador", "Teléfono", "Boletos", "Lugares", "Total", "Código", "Descuento", "Método", "Referencia", "Canal", "Fecha", "Motivo"],
    ...ordenes.map((o) => {
      const activos = o.tickets.filter((t) => t.is_active);
      return [o.order_code, estadoOrden(o), nombreFuncion.get(o.performance_id) ?? "", o.buyer_nombre, o.buyer_telefono, activos.length,
        activos.map((t) => t.seat_label ?? "General").join(" "), Number(o.total), o.discount_codigo, o.discount_codigo ? Number(o.discount_amount) : "",
        metodoLabel(o.metodo_pago), o.referencia, o.created_by_staff_id ? "Taquilla" : "En línea", fecha(o.created_at), o.motivo];
    }),
  ]);
  return new Response(cuerpo, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="ordenes-${id}.csv"`, "Cache-Control": "private, no-store" },
  });
}
