import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EstadoChip } from "@/components/panel/ui";
import { ProductionView } from "@/components/ProductionView";
import { productionTabs } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { getProduction } from "@/lib/productions";

export const metadata: Metadata = { title: "Vista previa", robots: { index: false } };

// Vista previa de la página de una obra, aunque esté en borrador: misma plantilla
// que ve el público. Solo para su equipo (la base decide qué puede leer cada quien).
export default async function PreviewPage({ params }: PageProps<"/vista-previa/[id]">) {
  const { id } = await params;
  const access = await requirePanel(`/vista-previa/${id}`);
  if (productionTabs(access, id).length === 0) notFound();
  const data = await getProduction(id, { includeDrafts: true });
  if (!data) notFound();
  return (
    <>
      <div className="sticky top-0 z-30 flex flex-wrap items-center justify-center gap-3 bg-[#ffd400] px-4 py-2 text-sm font-bold text-black">
        Vista previa · <EstadoChip estado={data.production.estado} />
        <Link href={`/panel/producciones/${id}/pagina`} className="underline">Volver al editor</Link>
      </div>
      <ProductionView data={data} vistaPrevia />
    </>
  );
}
