import type { Metadata } from "next";
import { PageHeading } from "@/components/PageHeading";
import { ProductionCard } from "@/components/ProductionCard";
import { getHomeData } from "@/lib/productions";

export const metadata: Metadata = { title: "Producciones" };

export default async function ProduccionesPage() {
  const { productions } = await getHomeData();
  const activas = productions.filter((p) => !p.concluded);
  const archivo = productions.filter((p) => p.concluded);

  return (
    <main className="pb-10">
      <PageHeading eyebrow="Producciones" title="Nuestras producciones">
        Lo que está en escena y todo lo que ya hicimos historia.
      </PageHeading>
      <div className="mx-auto flex max-w-[1440px] flex-col gap-12 px-5 md:px-16">
        {activas.length > 0 && (
          <section aria-labelledby="activas" className="flex flex-col gap-5">
            <h2 id="activas" className="titular text-2xl">En cartelera</h2>
            <ul className="grid gap-5 md:grid-cols-3">
              {activas.map((p) => <li key={p.id}><ProductionCard p={p} /></li>)}
            </ul>
          </section>
        )}
        {archivo.length > 0 && (
          <section aria-labelledby="archivo" className="flex flex-col gap-5">
            <h2 id="archivo" className="titular text-2xl">Archivo</h2>
            <ul className="grid gap-5 md:grid-cols-3">
              {archivo.map((p) => <li key={p.id}><ProductionCard p={p} /></li>)}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
