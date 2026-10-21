import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EstadoChip } from "@/components/panel/ui";
import { ProductionView } from "@/components/ProductionView";
import { productionTabs } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { getProduction } from "@/lib/productions";
import { getCapa } from "@/lib/obra-capa";

export const metadata: Metadata = { title: "Vista previa", robots: { index: false } };

// Vista previa de la página de una obra, aunque esté en borrador: misma plantilla
// que ve el público. Solo para su equipo (la base decide qué puede leer cada quien).
const VERSIONES = [["borrador", "Con el borrador"], ["fans", "Lo que ven los fans"], ["publico", "Lo que ve el público"]] as const;

export default async function PreviewPage({ params, searchParams }: PageProps<"/vista-previa/[id]">) {
  const { id } = await params;
  // 0119: qué versión ver: con el borrador (lo más nuevo), la de fans o la pública.
  const v = (await searchParams).version;
  const version = v === "fans" || v === "publico" ? v : "borrador";
  const access = await requirePanel(`/vista-previa/${id}`);
  if (productionTabs(access, id).length === 0) notFound();
  const data = await getProduction(id, { includeDrafts: true });
  if (!data) notFound();
  const capa = version === "publico" ? {} : await getCapa(id, version);
  return (
    <>
      <div className="sticky top-0 z-30 flex flex-wrap items-center justify-center gap-3 bg-[#ffd400] px-4 py-2 text-sm font-bold text-black">
        Vista previa · <EstadoChip estado={data.production.estado} />
        <span className="flex flex-wrap gap-1">
          {VERSIONES.map(([k, l]) => (
            <Link key={k} href={`?version=${k}`} aria-current={version === k ? "page" : undefined}
              className={`rounded-full px-2.5 py-0.5 ${version === k ? "bg-black text-[#ffd400]" : "border border-black/40"}`}>{l}</Link>
          ))}
        </span>
        <Link href={`/panel/producciones/${id}/pagina`} className="underline">Volver al editor</Link>
      </div>
      <ProductionView data={data} vistaPrevia capa={capa} />
    </>
  );
}
