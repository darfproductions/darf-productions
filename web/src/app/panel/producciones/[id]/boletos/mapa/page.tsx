import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { listZones } from "@/lib/boleteria";
import { listPanelProductions } from "@/lib/panel-data";
import { can } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { SeatMapBuilder, type BuilderSeat } from "./SeatMapBuilder";

export const metadata: Metadata = { title: "Mapa de asientos" };

// Mapa de asientos de la obra (0062): generarlo por filas, ajustarlo asiento por asiento o copiarlo.
export default async function SeatMapPage({ params }: PageProps<"/panel/producciones/[id]/boletos/mapa">) {
  const { id } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/boletos/mapa`);
  if (!can(access, id, "funciones.gestionar")) redirect(`/panel/producciones/${id}/boletos`);
  const supabase = await createClient();
  const [{ data: seats }, zonas, { data: vendidos }, { data: conMapa }, obras] = await Promise.all([
    supabase.from("seats").select("id, seat_label, seat_row, seat_number, lado, price_category_id, is_active").eq("production_id", id).limit(2000),
    listZones(id),
    supabase.rpc("seat_map_has_tickets", { pid: id }),
    supabase.from("seats").select("production_id").neq("production_id", id).limit(10000),
    listPanelProductions(),
  ]);
  const otras = new Set((conMapa ?? []).map((s) => s.production_id as string));
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
