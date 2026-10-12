import type { Metadata } from "next";
import { SeccionObras } from "@/components/ObraCards";
import { PageHeading } from "@/components/PageHeading";
import { ProductionCard } from "@/components/ProductionCard";
import { agrupar } from "@/lib/home-rules";
import { getHomeData } from "@/lib/productions";

export const metadata: Metadata = { title: "Producciones" };

export default async function ProduccionesPage() {
  const { productions } = await getHomeData();
  const g = agrupar(productions);
  const secciones = [
    { id: "cartelera", titulo: "En cartelera", obras: g.cartelera },
    { id: "proximamente", titulo: "Próximamente", obras: g.proximamente },
    { id: "archivo", titulo: "Archivo", obras: g.archivo },
  ].filter((x) => x.obras.length);

  return (
    <main className="pb-24">
      <PageHeading eyebrow="Producciones · Nuestro repertorio" title="Nuestras producciones">
        Lo que está en escena, lo que viene y todo lo que ya hicimos historia.
      </PageHeading>
      <div className="mx-auto flex max-w-[1440px] flex-col gap-20 px-5 md:px-16">
        {secciones.map((x) => (
          <SeccionObras key={x.id} id={x.id} titulo={x.titulo}>
            <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {x.obras.map((p) => (
                <li key={p.id}>
                  <ProductionCard p={p} cta={x.id === "archivo" ? "Galería y créditos" : undefined} sizes="(min-width: 1024px) 30vw, (min-width: 640px) 50vw, 100vw" />
                </li>
              ))}
            </ul>
          </SeccionObras>
        ))}
        {secciones.length === 0 && <p className="tarjeta p-6 text-texto-2">Muy pronto anunciaremos nuestras producciones.</p>}
      </div>
    </main>
  );
}
