import type { Metadata } from "next";
import Link from "next/link";
import { Card, EstadoChip, PanelTitle } from "@/components/panel/ui";
import { listPanelProductions } from "@/lib/panel-data";
import { myProductionIds } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { kitMissing } from "@/lib/themes";

export const metadata: Metadata = { title: "Producciones" };

export default async function PanelProductions() {
  const access = await requirePanel("/panel/producciones");
  const obras = await listPanelProductions(access.isDirector ? undefined : myProductionIds(access));

  return (
    <>
      <PanelTitle eyebrow="Panel" title="Producciones">
        Cada obra tiene su espacio de trabajo: contenido, audiciones, elenco, funciones y permisos.
      </PanelTitle>
      {access.isDirector && (
        <Link href="/panel/producciones/nueva" className="self-start rounded-full bg-texto px-5 py-2.5 text-sm font-bold text-sala">
          + Nueva producción o duplicar
        </Link>
      )}
      <Card className="p-0 md:p-0">
        <ul className="divide-y divide-white/10">
          {obras.map((p) => {
            const faltan = kitMissing(p).length;
            return (
              <li key={p.id}>
                <Link href={`/panel/producciones/${p.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-telon-2">
                  <div className="min-w-0">
                    <p className="font-bold">{p.nombre}</p>
                    <p className="text-sm text-texto-3">
                      {[p.temporada && `Temporada ${p.temporada}`, p.venue, p.on_sale ? "En venta" : null].filter(Boolean).join(" · ") || "Sin datos"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {faltan > 0 && <span className="text-xs font-bold text-[#f2b544]">Kit incompleto</span>}
                    <EstadoChip estado={p.estado} />
                  </div>
                </Link>
              </li>
            );
          })}
          {obras.length === 0 && <li className="px-5 py-4 text-texto-2">Aún no tienes obras asignadas.</li>}
        </ul>
      </Card>
    </>
  );
}
