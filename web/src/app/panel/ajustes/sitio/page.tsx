import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AnunciosEditor } from "@/components/anuncios/AnunciosEditor";
import { Card, PanelTitle } from "@/components/panel/ui";
import { saveSiteBanner } from "@/lib/anuncio-panel-actions";
import { getSiteBanner } from "@/lib/banner";
import { requirePanel } from "@/lib/permissions";
import { BannerEditor } from "../../producciones/[id]/pagina/BannerEditor";

export const metadata: Metadata = { title: "Sitio" };

// Ajustes del sitio (0074): la franja de avisos del inicio y los anuncios generales
// (inicio y Fan Zone). Solo el Director.
export default async function SitioAjustes() {
  const access = await requirePanel("/panel/ajustes/sitio");
  if (!access.isDirector) redirect("/panel");
  const banner = await getSiteBanner();
  return (
    <>
      <PanelTitle eyebrow="Ajustes" title="Sitio">
        La franja de avisos del inicio y los anuncios generales del inicio y de la Fan Zone.
      </PanelTitle>
      <Card className="flex flex-col gap-4">
        <div>
          <h2 className="titular text-xl">Franja del sitio</h2>
          <p className="mt-1 text-sm text-texto-2">Barra abajo del encabezado del inicio: preventas, nuevas fechas, audiciones… Puede correr o quedarse fija, con varios avisos que se turnan.</p>
        </div>
        <BannerEditor pid="sitio" banner={banner} acento="#830886" action={saveSiteBanner} />
      </Card>
      <Card className="flex flex-col gap-4">
        <div>
          <h2 className="titular text-xl">Anuncios generales</h2>
          <p className="mt-1 text-sm text-texto-2">Tarjetas en el inicio o en la Fan Zone. Con fecha de revelación se ve una cuenta regresiva; con &quot;Avísame&quot;, quien se apunte recibe un aviso al revelarse.</p>
        </div>
        <AnunciosEditor scope="sitio" />
      </Card>
    </>
  );
}
