import { NextResponse } from "next/server";
import { csv } from "@/lib/pago-rules";
import { createClient } from "@/lib/supabase/server";

type Fila = { order_code: string; buyer_nombre: string; buyer_telefono: string; lugar: string; checked_in_at: string | null };
const hora = (iso: string) => new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit", timeZone: "America/Mexico_City" }).format(new Date(iso));

// Lista de la función para Excel (Bloque 4A): plan B si no hay internet en la puerta. Se baja antes
// de abrir y se palomea a mano. La base revisa el permiso (puerta.validar o ventas.ver).
export async function GET(_req: Request, ctx: RouteContext<"/panel/producciones/[id]/puerta/lista/[funcion]">) {
  const { funcion } = await ctx.params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("puerta_lista", { p_performance: funcion, p_q: null });
  if (error) return NextResponse.json({ error: "No autorizado o la función no existe." }, { status: 403 });
  const filas = (data ?? []) as Fila[];
  const cuerpo = csv([
    ["Nombre", "Teléfono", "Lugar", "Orden", "Entró", "Marca"],
    ...filas.map((f) => [f.buyer_nombre, f.buyer_telefono, f.lugar, f.order_code, f.checked_in_at ? hora(f.checked_in_at) : "", ""]),
  ]);
  return new NextResponse(cuerpo, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="lista-puerta-${funcion.slice(0, 8)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
