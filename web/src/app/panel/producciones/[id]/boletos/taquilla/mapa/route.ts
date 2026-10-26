import { NextResponse } from "next/server";
import { boxOfficeData, generalAvailability, listPerformances } from "@/lib/boleteria";
import { can } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { formatPerformanceDate } from "@/lib/productions";
import { colorZona } from "@/lib/seatmap-rules";
import { createClient } from "@/lib/supabase/server";
import { mapaTaquillaPng } from "@/lib/taquilla-mapa";
import { planoTaquilla } from "@/lib/taquilla-mapa-rules";
import { ZONE_COLORS } from "@/lib/tickets";

// Mapa de la función con lo ocupado al momento, en PNG, para mandarlo por WhatsApp (2026-10-26).
// ?funcion=<id>&descargar=1. Mismo permiso que la taquilla.
export async function GET(req: Request, ctx: RouteContext<"/panel/producciones/[id]/boletos/taquilla/mapa">) {
  const { id } = await ctx.params;
  const access = await requirePanel(`/panel/producciones/${id}/boletos/taquilla`);
  if (!can(access, id, "ventas.operar")) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const f = (await listPerformances(id)).find((x) => x.id === sp.get("funcion"));
  if (!f) return NextResponse.json({ error: "No se encontró la función." }, { status: 404 });
  const [data, general, obra] = await Promise.all([
    boxOfficeData(id, f.id),
    generalAvailability(f.id),
    (await createClient()).from("productions").select("nombre, venue").eq("id", id).maybeSingle(),
  ]);
  if (data.error) return NextResponse.json({ error: "No se pudo leer el mapa." }, { status: 500 });
  const gen = new Set(general.map((z) => z.price_category_id));
  // Mismos colores que el mapa de la taquilla (SeatMap): por nombre de zona.
  const zonas = [...data.prices].filter((p) => !gen.has(p.categoryId)).sort((a, b) => a.nombre.localeCompare(b.nombre))
    .map((p, i) => ({ id: p.categoryId, nombre: p.nombre, color: colorZona(p, i, ZONE_COLORS), precio: p.price, orden: p.orden }))
    .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es"));
  const plano = planoTaquilla(data.seats.map((s) => ({ id: s.id, x: s.pos_x ?? null, y: s.pos_y ?? null, fila: s.seat_row, numero: s.seat_number, lado: s.lado, zona: s.price_category_id, grupo: s.section ?? null })), data.formas);
  const png = await mapaTaquillaPng({
    obra: obra.data?.nombre ?? "DARF Productions",
    funcion: formatPerformanceDate(f.starts_at),
    lugar: f.venue ?? obra.data?.venue ?? null,
    al: new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit", timeZone: "America/Mexico_City" }).format(new Date()),
    plano,
    ocupados: new Set(data.taken),
    zonas,
    generales: general.map((g) => ({ nombre: g.nombre, libres: g.libres, precio: g.precio })),
  });
  const dia = f.starts_at ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date(f.starts_at)) : "funcion";
  const archivo = `${obra.data?.nombre ?? id}-mapa-${dia}`.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9-]+/g, "-");
  return new NextResponse(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store", ...(sp.get("descargar") ? { "Content-Disposition": `attachment; filename="${archivo}.png"` } : {}) },
  });
}
