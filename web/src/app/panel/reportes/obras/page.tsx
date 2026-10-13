import type { Metadata } from "next";
import Link from "next/link";
import { Card, EstadoChip, PanelTitle } from "@/components/panel/ui";
import { listPanelProductions } from "@/lib/panel-data";
import { can, myProductionIds } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";

export const metadata: Metadata = { title: "Reportes por producción" };

// Lista de obras cuyo reporte puedo ver; cada una abre su pestaña Reportes.
export default async function ReportesPorObra() {
  const access = await requirePanel("/panel/reportes/obras");
  const obras = (await listPanelProductions(access.isDirector ? undefined : myProductionIds(access)))
    .filter((p) => can(access, p.id, "reportes.ver"));
  return (
    <>
      <PanelTitle eyebrow="Reportes" title="Por producción">
        Ventas, ocupación, vendedores y asistencia de cada obra.
      </PanelTitle>
      {obras.length === 0 && <Card>No tienes reportes de ninguna obra.</Card>}
      <Card className="p-0 md:p-0">
        <ul className="divide-y divide-white/10">
          {obras.map((p) => (
            <li key={p.id}>
              <Link href={`/panel/producciones/${p.id}/reportes`} className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-telon-2">
                <span className="font-bold">{p.nombre}</span>
                <span className="flex items-center gap-3"><EstadoChip estado={p.estado} /><span className="text-violeta-claro">→</span></span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
