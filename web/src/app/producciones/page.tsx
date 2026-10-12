import type { Metadata } from "next";
import Link from "next/link";
import { ObraHorizontal, ObraPanoramica, SeccionObras } from "@/components/ObraCards";
import { PageHeading } from "@/components/PageHeading";
import { ProductionCard } from "@/components/ProductionCard";
import { agrupar, ETIQUETA_ESTADO, type EstadoPublico } from "@/lib/home-rules";
import { getHomeData } from "@/lib/productions";

export const metadata: Metadata = { title: "Producciones" };

const FILTROS: (EstadoPublico | "todas")[] = ["todas", "cartelera", "proximamente", "archivo"];

// Producciones (guía de UI · Fusión; antes Cartelera, unidas por decisión de Diego): lo que está en
// escena en grande, lo que viene y el archivo, con filtros.
export default async function ProduccionesPage({ searchParams }: PageProps<"/producciones">) {
  const sp = await searchParams;
  const { productions, featured } = await getHomeData();
  const g = agrupar(productions);
  // La obra destacada en el panel (la misma de la portada) va en grande; las demás, en tarjetas.
  const destacada = g.cartelera.find((p) => p.id === featured?.production.id) ?? g.cartelera[0];
  const otras = g.cartelera.filter((p) => p !== destacada);
  const filtro = (FILTROS.find((f) => f === sp.estado) ?? "todas") as EstadoPublico | "todas";
  const ver = (e: EstadoPublico) => filtro === "todas" || filtro === e;
  const temporadas = g.archivo.map((p) => p.temporada).filter((x): x is string => !!x).sort();
  const rango = temporadas.length ? (temporadas[0] === temporadas.at(-1) ? temporadas[0] : `${temporadas[0]} a ${temporadas.at(-1)}`) : undefined;

  return (
    <main className="pb-24">
      <PageHeading
        eyebrow="Producciones · Jóvenes para jóvenes"
        title="Producciones"
        aside={
          <nav aria-label="Filtrar producciones" className="flex flex-wrap gap-2">
            {FILTROS.filter((f) => f === "todas" || g[f].length > 0).map((f) => (
              <Link
                key={f}
                href={f === "todas" ? "/producciones" : `/producciones?estado=${f}`}
                scroll={false}
                aria-current={filtro === f ? "page" : undefined}
                className={`chip ${filtro === f ? "chip-on" : "hover:border-white/40"}`}
              >
                {f === "todas" ? "Todas" : ETIQUETA_ESTADO[f]}
              </Link>
            ))}
          </nav>
        }
      >
        Elige una producción para ver sus funciones, zonas y precios, y comprar tus boletos.
      </PageHeading>

      <div className="mx-auto flex max-w-[1440px] flex-col gap-20 px-5 md:gap-24 md:px-16">
        {ver("cartelera") &&
          (g.cartelera.length ? (
            <section aria-label="En cartelera" className="flex flex-col gap-6">
              <ObraPanoramica p={destacada} />
              {otras.length > 0 && (
                <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {otras.map((p) => <li key={p.id}><ProductionCard p={p} sizes="(min-width: 1024px) 30vw, (min-width: 640px) 50vw, 100vw" /></li>)}
                </ul>
              )}
            </section>
          ) : (
            <div className="tarjeta flex flex-col items-start gap-4 p-8">
              <p className="text-lg">No hay boletos a la venta en este momento.</p>
              {filtro === "cartelera" && <Link href="/producciones" className="font-bold text-lila hover:underline">Ver todas las producciones →</Link>}
            </div>
          ))}

        {ver("proximamente") && g.proximamente.length > 0 && (
          <SeccionObras id="proximamente" titulo="Próximamente">
            <ul className="grid gap-6 xl:grid-cols-2">
              {g.proximamente.map((p) => <li key={p.id}><ObraHorizontal p={p} /></li>)}
            </ul>
          </SeccionObras>
        )}

        {ver("archivo") && g.archivo.length > 0 && (
          <SeccionObras id="archivo" titulo="Archivo" nota={rango}>
            <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {g.archivo.map((p) => <li key={p.id}><ProductionCard p={p} cta="Galería y créditos" sizes="(min-width: 1024px) 30vw, (min-width: 640px) 50vw, 100vw" /></li>)}
            </ul>
          </SeccionObras>
        )}
      </div>
    </main>
  );
}
