import type { Metadata } from "next";
import Link from "next/link";
import { PanelTitle } from "@/components/panel/ui";
import { seccionValida, TeamManager } from "@/components/team/TeamManager";
import { requireDirector } from "@/lib/permissions";
import { Icono } from "@/components/Icono";

export const metadata: Metadata = { title: "Portal general del equipo" };

// Espacio general de DARF (0065): para todo el equipo de cualquier producción. Solo el Director lo maneja.
export default async function PortalGeneral({ searchParams }: PageProps<"/panel/personas/equipo/portal">) {
  await requireDirector("/panel/personas/equipo/portal");
  const sp = await searchParams;
  return (
    <>
      <Link href="/panel/personas/equipo" className="text-sm font-bold text-violeta-claro"><Icono nombre="flecha-izq" /> Equipo DARF</Link>
      <PanelTitle eyebrow="Equipo DARF" title="Portal general">
        Para todo el equipo de DARF (quien tiene un rol en cualquier producción activa y las cuentas Staff): avisos de la empresa, material institucional, juntas generales y notas.
      </PanelTitle>
      <TeamManager pid={null} seccion={seccionValida(sp.seccion)} base="/panel/personas/equipo/portal" />
    </>
  );
}
