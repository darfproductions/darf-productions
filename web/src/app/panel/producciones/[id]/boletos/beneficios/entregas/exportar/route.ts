import { NextResponse } from "next/server";
import { ESTADOS_ENTREGA, type EstadoEntrega } from "@/lib/beneficios-rules";
import { csv } from "@/lib/pago-rules";
import { createClient } from "@/lib/supabase/server";

type Fila = { order_code: string; comprador: string; telefono: string; lugar: string; zona: string; beneficio: string; estado: EstadoEntrega;
  limite: string | null; entregado_at: string | null; entregado_por: string | null; nota: string | null };
const fecha = (iso: string | null) => (iso ? new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date(iso)) : "");

// 0125: lista de entregas de beneficios de una función en Excel (CSV). La base revisa el permiso.
export async function GET(req: Request) {
  const funcion = new URL(req.url).searchParams.get("funcion") ?? "";
  const { data, error } = await (await createClient()).rpc("beneficios_entregas", { p_performance: funcion });
  if (error) return NextResponse.json({ error: "No autorizado o la función no existe." }, { status: 403 });
  const filas = (data ?? []) as Fila[];
  const cuerpo = csv([
    ["Nombre", "Teléfono", "Lugar", "Zona", "Orden", "Beneficio", "Estado", "Fecha límite", "Entregado", "Entregó", "Nota"],
    ...filas.map((f) => [f.comprador, f.telefono, f.lugar, f.zona, f.order_code, f.beneficio, ESTADOS_ENTREGA[f.estado]?.label ?? f.estado,
      fecha(f.limite), fecha(f.entregado_at), f.entregado_por ?? "", f.nota ?? ""]),
  ]);
  return new NextResponse(cuerpo, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="entregas-beneficios-${funcion.slice(0, 8)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
