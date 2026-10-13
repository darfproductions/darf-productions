import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { listZones } from "@/lib/boleteria";
import { listPanelProductions } from "@/lib/panel-data";
import { can, salidaBoletos } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { SeatMapBuilder, type BuilderSeat } from "./SeatMapBuilder";
import { todasLasFilas } from "@/lib/supabase/paginar";

export const metadata: Metadata = { title: "Mapa de asientos" };

// Mapa de asientos de la obra (0062): generarlo por filas, ajustarlo asiento por asiento o copiarlo.
export default async function SeatMapPage({ params }: PageProps<"/panel/producciones/[id]/boletos/mapa">) {
  const { id } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/boletos/mapa`);
  if (!can(access, id, "funciones.gestionar")) redirect(salidaBoletos(access, id, "boletos/mapa"));
  const supabase = await createClient();
  const [{ data: seats }, zonas, { data: vendidos }, obras] = await Promise.all([
    todasLasFilas((a, b) => supabase.from("seats").select("id, seat_label, seat_row, seat_number, lado, price_category_id, is_active").eq("production_id", id).order("id").range(a, b)),
    listZones(id),
    supabase.rpc("seat_map_has_tickets", { pid: id }),
    listPanelProductions(),
  ]);
  // Obras que ya tienen mapa (para "Copiar mapa de otra obra"): se cuenta en cada una, sin bajar sus asientos.
  const conMapa = await Promise.all(obras.filter((o) => o.id !== id).map(async (o) =>
    ((await supabase.from("seats").select("id", { count: "exact", head: true }).eq("production_id", o.id)).count ?? 0) > 0 ? o.id : null));
  const otras = new Set(conMapa.filter((x): x is string => !!x));
  return (
    <SeatMapBuilder
      pid={id}
      seats={(seats ?? []) as BuilderSeat[]}
      zonas={zonas.filter((z) => z.cupo == null).map((z) => ({ id: z.id, nombre: z.nombre, color: z.color ?? null, descripcion: z.descripcion }))}
      conBoletos={!!vendidos}
      obras={obras.filter((o) => otras.has(o.id)).map((o) => ({ id: o.id, nombre: o.nombre }))}
    />
  );
}
