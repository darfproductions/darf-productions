import type { Metadata } from "next";
import { PanelTitle } from "@/components/panel/ui";
import { seccionValida, TeamManager } from "@/components/team/TeamManager";
import { requireCasa } from "@/lib/permissions";

export const metadata: Metadata = { title: "Portal general del equipo" };

// Espacio general de DARF (0065): para todo el equipo de cualquier producción. Solo el Director lo maneja.
export default async function PortalGeneral({ searchParams }: PageProps<"/panel/personas/equipo/portal">) {
  await requireCasa("casa.equipo", "/panel/personas/equipo/portal");
  const sp = await searchParams;
  return (
    <>
      <PanelTitle eyebrow="Casa DARF" title="Portal del equipo">
        Para todo el equipo de DARF (Casa DARF y quien tiene un rol en cualquier producción activa): avisos de la empresa, material institucional, juntas generales y notas.
      </PanelTitle>
      <TeamManager pid={null} seccion={seccionValida(sp.seccion)} base="/panel/personas/equipo/portal" />
    </>
  );
}
