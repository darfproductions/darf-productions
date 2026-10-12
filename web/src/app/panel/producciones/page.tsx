import type { Metadata } from "next";
import Link from "next/link";
import { Card, EstadoChip, PanelTitle } from "@/components/panel/ui";
import { ActionForm } from "@/components/panel/ActionForm";
import { ETIQUETA_ESTADO } from "@/lib/home-rules";
import { listPanelProductions } from "@/lib/panel-data";
import { can, myProductionIds } from "@/lib/panel-nav";
import { getHomeData } from "@/lib/productions";
import { setFeatured } from "./actions";
import { requirePanel } from "@/lib/permissions";
import { kitMissing } from "@/lib/themes";

export const metadata: Metadata = { title: "Producciones" };

export default async function PanelProductions() {
  const access = await requirePanel("/panel/producciones");
  const [obras, home] = await Promise.all([listPanelProductions(access.isDirector ? undefined : myProductionIds(access)), getHomeData()]);
  const estadoPub = new Map(home.productions.map((p) => [p.id, p.estadoPublico]));
  const portada = home.featured?.production ?? null;
  const destacada = obras.find((p) => p.destacada) ?? null;

  return (
    <>
      <PanelTitle eyebrow="Proyectos" title="Producciones">
        Cada obra tiene su espacio de trabajo: contenido, audiciones, elenco, funciones y permisos.
      </PanelTitle>
      {access.isDirector && (
        <Link href="/panel/producciones/nueva" className="self-start rounded-full bg-texto px-5 py-2.5 text-sm font-bold text-sala">
          + Nueva producción o duplicar
        </Link>
      )}
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          <b>Portada del sitio:</b> {portada ? portada.nombre : "—"}{" "}
          <span className="text-texto-3">{destacada ? "(destacada a mano)" : "(automático: la función más cercana en cartelera)"}</span>
        </p>
        {destacada && can(access, destacada.id, "obra.publicar") && (
          <ActionForm inline action={setFeatured} hidden={{ pid: "" }} submit="Volver a automático" submitClass="rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold" />
        )}
      </Card>
      <Card className="p-0 md:p-0">
        <ul className="divide-y divide-white/10">
          {obras.map((p) => {
            const faltan = kitMissing(p).length;
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-2 pr-5 hover:bg-telon-2">
                <Link href={`/panel/producciones/${p.id}`} className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div className="min-w-0">
                    <p className="font-bold">{p.nombre}</p>
                    <p className="text-sm text-texto-3">
                      {[p.temporada && `Temporada ${p.temporada}`, p.venue, p.on_sale ? "En venta" : null].filter(Boolean).join(" · ") || "Sin datos"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {faltan > 0 && <span className="text-xs font-bold text-[#f2b544]">Kit incompleto</span>}
                    {estadoPub.get(p.id) && <span className="text-xs font-bold uppercase tracking-[0.12em] text-texto-3">{ETIQUETA_ESTADO[estadoPub.get(p.id)!]}</span>}
                    <EstadoChip estado={p.estado} />
                  </div>
                </Link>
                {p.estado === "publicada" && can(access, p.id, "obra.publicar") && (
                  p.destacada
                    ? <span className="text-sm font-bold text-[#f2b544]" title="Destacada en la portada">★ En portada</span>
                    : <ActionForm inline action={setFeatured} hidden={{ pid: p.id }} submit="☆ Destacar en portada" submitClass="rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold" />
                )}
              </li>
            );
          })}
          {obras.length === 0 && <li className="px-5 py-4 text-texto-2">Aún no tienes obras asignadas.</li>}
        </ul>
      </Card>
    </>
  );
}
