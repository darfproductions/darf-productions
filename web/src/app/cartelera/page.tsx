import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/PageHeading";
import { ProductionCard } from "@/components/ProductionCard";
import { agrupar } from "@/lib/home-rules";
import { getHomeData } from "@/lib/productions";

export const metadata: Metadata = { title: "Cartelera" };

export default async function CarteleraPage() {
  const { productions } = await getHomeData();
  const { cartelera, proximamente } = agrupar(productions);

  return (
    <main className="pb-10">
      <PageHeading eyebrow="Cartelera" title="En escena">
        Elige una producción para ver sus funciones, zonas y precios, y comprar tus boletos.
      </PageHeading>
      <div className="mx-auto max-w-[1440px] px-5 md:px-16">
        {cartelera.length ? (
          <ul className="grid gap-5 md:grid-cols-3">
            {cartelera.map((p) => <li key={p.id}><ProductionCard p={p} /></li>)}
          </ul>
        ) : (
          <div className="rounded-2xl bg-telon p-8">
            <p className="text-lg">No hay boletos a la venta en este momento.</p>
            <Link href="/producciones" className="mt-4 inline-block font-bold text-violeta-claro">Ver todas las producciones →</Link>
          </div>
        )}
        {proximamente.length > 0 && (
          <section aria-labelledby="proximamente" className="mt-12 flex flex-col gap-5">
            <h2 id="proximamente" className="titular text-2xl">Próximamente</h2>
            <ul className="grid gap-5 md:grid-cols-3">
              {proximamente.map((p) => <li key={p.id}><ProductionCard p={p} /></li>)}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
