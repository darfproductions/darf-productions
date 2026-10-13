import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PanelTitle } from "@/components/panel/ui";
import { seccionValida, TeamManager } from "@/components/team/TeamManager";
import { can } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";

export const metadata: Metadata = { title: "Equipo" };

// Portal del equipo de la obra (0065): lo manejan Producción y Dirección (equipo.gestionar).
export default async function EquipoObra({ params, searchParams }: PageProps<"/panel/producciones/[id]/equipo">) {
  const { id } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/equipo`);
  if (!can(access, id, "equipo.gestionar")) redirect(`/panel/producciones/${id}`);
  const sp = await searchParams;
  return (
    <>
      <PanelTitle eyebrow="Equipo" title="Portal del equipo">
        Notas de dirección, juntas con su resumen, avisos y materiales para quienes tienen un rol en esta producción. Cada quien lo ve en Mi cuenta → Mi equipo.
      </PanelTitle>
      <TeamManager pid={id} seccion={seccionValida(sp.seccion)} base={`/panel/producciones/${id}/equipo`} />
    </>
  );
}
