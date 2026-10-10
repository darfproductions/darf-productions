import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import {
  formatPerformanceDate,
  formatPrice,
  getProduction,
  getTheme,
  themeStyle,
} from "@/lib/productions";

// Página de obra: aquí la producción toma el escenario con su tema.
// Una sola plantilla para todas las producciones; el contenido viene de la base.

export async function generateMetadata({ params }: PageProps<"/producciones/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const data = await getProduction(slug);
  return { title: data?.production.nombre ?? "Producción" };
}

export default async function ProductionPage({ params }: PageProps<"/producciones/[slug]">) {
  const { slug } = await params;
  const data = await getProduction(slug);
  if (!data) notFound();
  const { production: p, performances, prices } = data;
  const theme = getTheme(p.id);

  return (
    <main style={themeStyle(theme)} className="-mt-[92px] min-h-dvh bg-obra-fondo pb-24 text-obra-texto">
      <section className="relative">
        {theme && (
          <div className="absolute inset-0">
            <Image src={theme.hero} alt="" fill priority sizes="100vw" className="object-cover opacity-75" />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,var(--obra-fondo)_0%,color-mix(in_srgb,var(--obra-fondo)_50%,transparent)_50%,transparent_100%),linear-gradient(180deg,transparent_60%,var(--obra-fondo)_100%)]" />
          </div>
        )}
        <div className="relative mx-auto flex max-w-[1440px] flex-col gap-5 px-5 pb-16 pt-36 md:px-16 md:pt-44">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-obra-acento">DARF Productions presenta</p>
          {theme?.titulo ? (
            <Image src={theme.titulo} alt={p.nombre} className="w-full max-w-[520px]" sizes="520px" priority />
          ) : (
            <h1 className="titular text-5xl md:text-7xl">{p.nombre}</h1>
          )}
          {theme && <p className="max-w-xl text-xl">{theme.tagline}</p>}
          {p.concluded && (
            <p className="self-start rounded-full border border-white/30 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em]">Producción concluida</p>
          )}
        </div>
      </section>

      <div className="mx-auto grid max-w-[1440px] gap-10 px-5 md:grid-cols-12 md:px-16">
        <section className="flex flex-col gap-3 md:col-span-6" aria-labelledby="funciones">
          <h2 id="funciones" className="titular text-2xl">Funciones</h2>
          {performances.length === 0 && <p className="text-texto-3">Aún no hay funciones registradas.</p>}
          <ul className="flex flex-col gap-3">
            {performances.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-4 rounded-xl bg-obra-superficie px-5 py-4">
                <div>
                  <p className="font-bold capitalize">{formatPerformanceDate(f.starts_at)}</p>
                  <p className="text-sm opacity-80">{f.venue ?? p.venue}</p>
                </div>
                {f.on_sale ? (
                  <span className="boton-compra rounded-full px-4 py-2 text-xs font-bold uppercase tracking-[0.08em]">En venta</span>
                ) : (
                  <span className="rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold">Próximamente</span>
                )}
              </li>
            ))}
          </ul>
        </section>

        {prices.length > 0 && (
          <section className="flex flex-col gap-3 md:col-span-5 md:col-start-8" aria-labelledby="precios">
            <h2 id="precios" className="titular text-2xl">Zonas y precios</h2>
            <ul className="grid grid-cols-2 gap-2">
              {prices.map((z) => (
                <li key={z.nombre} className="flex justify-between rounded-lg bg-obra-superficie px-4 py-3 text-sm">
                  <span>{z.nombre}</span>
                  <b>{formatPrice(z.price)}</b>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
