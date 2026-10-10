import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/PageHeading";
import { ProductionCard } from "@/components/ProductionCard";
import { getHomeData } from "@/lib/productions";

export const metadata: Metadata = { title: "Cartelera" };

export default async function CarteleraPage() {
  const { productions } = await getHomeData();
  const activas = productions.filter((p) => !p.concluded);

  return (
    <main className="pb-10">
      <PageHeading eyebrow="Cartelera" title="En escena">
        Elige una producción para ver sus funciones, zonas y precios, y comprar tus boletos.
      </PageHeading>
      <div className="mx-auto max-w-[1440px] px-5 md:px-16">
        {activas.length ? (
          <ul className="grid gap-5 md:grid-cols-3">
            {activas.map((p) => <li key={p.id}><ProductionCard p={p} /></li>)}
          </ul>
        ) : (
          <div className="rounded-2xl bg-telon p-8">
            <p className="text-lg">No hay producciones en cartelera en este momento.</p>
            <Link href="/producciones" className="mt-4 inline-block font-bold text-violeta-claro">Ver el archivo de producciones →</Link>
          </div>
        )}
      </div>
    </main>
  );
}
