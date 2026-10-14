import type { Metadata } from "next";
import { BackLink, Card, PanelTitle } from "@/components/panel/ui";
import { listPanelProductions } from "@/lib/panel-data";
import { requireCasa } from "@/lib/permissions";
import { CreateForm, DuplicateForm } from "./NewForms";

export const metadata: Metadata = { title: "Nueva producción" };

// Crear una obra desde cero o a partir de otra (nueva temporada). Solo el Director.
export default async function NewProduction() {
  await requireCasa("casa.producciones", "/panel/producciones/nueva");
  const obras = await listPanelProductions();
  return (
    <>
      <BackLink href="/panel/producciones">Producciones</BackLink>
      <PanelTitle eyebrow="Director" title="Nueva producción">
        La obra nace en borrador: nadie del público la ve hasta que se publique con su kit completo.
      </PanelTitle>
      <Card>
        <h2 className="titular mb-4 text-xl">Empezar desde cero</h2>
        <CreateForm />
      </Card>
      <Card>
        <h2 className="titular mb-1 text-xl">Duplicar una obra</h2>
        <p className="mb-4 text-sm text-texto-2">Útil para una nueva temporada: copia el kit, los textos y la ficha; tú eliges qué más.</p>
        <DuplicateForm obras={obras.map((o) => ({ id: o.id, nombre: o.nombre }))} />
      </Card>
    </>
  );
}
