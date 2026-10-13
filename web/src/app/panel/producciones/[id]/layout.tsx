import Link from "next/link";
import { notFound } from "next/navigation";
import { EstadoChip } from "@/components/panel/ui";
import { ObraTabs } from "@/components/panel/ObraTabs";
import { conteoPorPestana } from "@/lib/panel-home-rules";
import { getPendientes } from "@/lib/panel-pendientes";
import { getPanelProduction } from "@/lib/panel-data";
import { ConcludedGuard } from "@/components/panel/ConcludedGuard";
import { CONCLUIDA_TABS, can, productionGroups, productionTabs } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";

// Espacio de trabajo de una obra: encabezado y pestañas agrupadas (0085) según mis permisos en ELLA.
export default async function ProductionWorkspace({ children, params }: LayoutProps<"/panel/producciones/[id]">) {
  const { id } = await params;
  const access = await requirePanel(`/panel/producciones/${id}`);
  const p = productionTabs(access, id).length ? await getPanelProduction(id) : null;
  if (!p) notFound();
  const concluida = p.estado === "archivada";
  const grupos = productionGroups(access, id, concluida);
  const conteo = conteoPorPestana(await getPendientes(), id);

  return (
    <>
      <header className="flex flex-col gap-3">
        <Link href="/panel/producciones" className="text-sm font-bold text-violeta-claro print:hidden">← Producciones</Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="titular text-3xl md:text-4xl">{p.nombre}</h1>
          <EstadoChip estado={p.estado} />
        </div>
        {concluida && (
          <p className="rounded-xl border border-white/15 bg-telon px-4 py-3 text-sm text-texto-2 print:hidden">
            <b className="text-texto">Producción concluida.</b> Se ocultan las secciones de temporada (boletería, ensayos, audiciones…).
            {can(access, id, "obra.publicar") && <> <Link href={`/panel/producciones/${id}/cierre`} className="font-bold text-violeta-claro">Reactivar →</Link></>}
          </p>
        )}
        {concluida && <ConcludedGuard base={`/panel/producciones/${id}`} permitidas={[...CONCLUIDA_TABS.map((t) => (t === "resumen" ? "" : t)), "guia"]} />}
        <ObraTabs base={`/panel/producciones/${id}`} grupos={grupos} conteo={conteo} />
      </header>
      {children}
    </>
  );
}
