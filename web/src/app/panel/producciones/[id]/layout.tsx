import Link from "next/link";
import { notFound } from "next/navigation";
import { EstadoChip, Soon } from "@/components/panel/ui";
import { getPanelProduction } from "@/lib/panel-data";
import { ConcludedGuard } from "@/components/panel/ConcludedGuard";
import { CONCLUIDA_TABS, can, productionTabs } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";

// Espacio de trabajo de una obra: encabezado y pestañas según mis permisos en ELLA.
export default async function ProductionWorkspace({ children, params }: LayoutProps<"/panel/producciones/[id]">) {
  const { id } = await params;
  const access = await requirePanel(`/panel/producciones/${id}`);
  const p = productionTabs(access, id).length ? await getPanelProduction(id) : null;
  if (!p) notFound();
  const concluida = p.estado === "archivada";
  const tabs = productionTabs(access, id, concluida);

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
        {concluida && <ConcludedGuard base={`/panel/producciones/${id}`} permitidas={CONCLUIDA_TABS.map((t) => (t === "resumen" ? "" : t))} />}
        <nav aria-label="Secciones de la obra" className="-mx-1 flex gap-1 overflow-x-auto border-b border-white/10 pb-px print:hidden">
          {tabs.map((t) =>
            t.etapa ? (
              <span key={t.id} title={`Se construye en la etapa ${t.etapa}`} className="flex shrink-0 items-center gap-2 px-3 py-3 text-sm font-semibold text-texto-3">
                {t.label} <Soon etapa={t.etapa} />
              </span>
            ) : (
              <Link key={t.id} href={`/panel/producciones/${id}${t.path ? `/${t.path}` : ""}`} className="shrink-0 px-3 py-3 text-sm font-bold hover:text-violeta-claro">
                {t.label}
              </Link>
            ),
          )}
        </nav>
      </header>
      {children}
    </>
  );
}
