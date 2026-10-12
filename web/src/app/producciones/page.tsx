import type { Metadata } from "next";
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
    <main className="pb-10">
      <PageHeading eyebrow="Producciones" title="Nuestras producciones">
        Lo que está en escena, lo que viene y todo lo que ya hicimos historia.
      </PageHeading>
      <div className="mx-auto flex max-w-[1440px] flex-col gap-12 px-5 md:px-16">
        {secciones.map((x) => (
          <section key={x.id} aria-labelledby={x.id} className="flex flex-col gap-5">
            <h2 id={x.id} className="titular text-2xl">{x.titulo}</h2>
            <ul className="grid gap-5 md:grid-cols-3">
              {x.obras.map((p) => <li key={p.id}><ProductionCard p={p} /></li>)}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
