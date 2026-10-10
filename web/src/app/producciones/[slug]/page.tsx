import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Section } from "@/components/PageHeading";
import { PosterBackdrop, PosterFull } from "@/components/PosterArt";
import { YouTube, youtubeId } from "@/components/YouTube";
import { PRODUCTION_CONTENT } from "@/content/producciones";
import {
  formatPerformanceDate,
  formatPrice,
  getProduction,
  getTheme,
  themeStyle,
} from "@/lib/productions";

// Página de obra: una sola plantilla para todas las producciones.
// Datos de venta (funciones, precios) desde la base; contenido artístico desde
// src/content (transitorio hasta la Fase 2).

export async function generateMetadata({ params }: PageProps<"/producciones/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const data = await getProduction(slug);
  return { title: data?.production.nombre ?? "Producción" };
}

function CreditList({ items }: { items: { a: string; b: string }[] }) {
  return (
    <dl className="grid gap-x-6 sm:grid-cols-2">
      {items.map((x, i) => (
        <div key={i} className="flex justify-between gap-4 border-b border-white/10 py-3">
          <dt className="opacity-75">{x.a}</dt>
          <dd className="text-right font-semibold">{x.b}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function ProductionPage({ params }: PageProps<"/producciones/[slug]">) {
  const { slug } = await params;
  const data = await getProduction(slug);
  if (!data) notFound();
  const { production: p, performances, prices } = data;
  const theme = getTheme(p.id);
  const c = PRODUCTION_CONTENT[p.id];
  const canciones = c?.actos.reduce((n, a) => n + a.canciones.length, 0) ?? 0;
  const videos = (c?.videos ?? []).map((v) => ({ ...v, id: youtubeId(v.url) })).filter((v) => v.id);
  const equipo = [...(c?.creativo ?? []), ...(c?.produccion ?? []), ...(c?.crew ?? [])];

  const sections = [
    { id: "funciones", label: "Funciones", show: !p.concluded || performances.length > 0 },
    { id: "sinopsis", label: "Sinopsis", show: !!c?.sinopsis.length },
    { id: "canciones", label: "Canciones", show: canciones > 0 },
    { id: "multimedia", label: "Videos", show: videos.length > 0 },
    { id: "elenco", label: "Elenco", show: !!(c?.reparto.length || c?.ensamble.length) },
    { id: "equipo", label: "Equipo", show: equipo.length > 0 },
  ].filter((s) => s.show);

  return (
    <main style={themeStyle(theme)} className="-mt-[84px] min-h-dvh bg-obra-fondo pb-10 text-obra-texto md:-mt-[100px]">
      <section className="relative overflow-hidden">
        {theme && <PosterBackdrop theme={theme} />}
        <div className="relative mx-auto grid max-w-[1440px] items-center gap-10 px-5 pb-16 pt-32 md:px-16 md:pt-40 lg:grid-cols-12">
          {theme && (
            <div className="mx-auto w-full max-w-[300px] sm:max-w-[360px] lg:order-2 lg:col-span-4 lg:col-start-9 lg:max-w-none">
              <PosterFull theme={theme} alt={p.nombre} priority />
            </div>
          )}
          <div className="flex flex-col gap-5 lg:order-1 lg:col-span-7">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-obra-acento">
              {p.concluded ? "Archivo · DARF Productions" : "DARF Productions presenta"}
            </p>
            <h1 className="titular text-5xl md:text-7xl">{p.nombre}</h1>
            {theme && <p className="max-w-xl text-xl leading-relaxed opacity-90">{theme.tagline}</p>}
            <ul className="flex flex-wrap gap-2 text-sm font-semibold">
              {p.venue && <li className="rounded-full border border-white/25 px-3 py-1.5">{p.venue}</li>}
              <li className="rounded-full border border-white/25 px-3 py-1.5">{p.concluded ? "Producción concluida" : "En cartelera"}</li>
            </ul>
            <div className="flex flex-wrap gap-3">
              {!p.concluded && performances.some((f) => f.on_sale) && (
                <a href="#funciones" className="boton-compra rounded-full px-7 py-4 text-sm font-bold uppercase tracking-[0.1em]">Comprar boletos</a>
              )}
              {c?.ensayos.length ? (
                <Link href={`/fan-zone/${p.id}`} className="rounded-full border border-obra-acento px-6 py-4 text-sm font-bold uppercase tracking-[0.1em]">Fan Zone</Link>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {sections.length > 1 && (
        <nav aria-label="Secciones de la obra" className="sticky top-0 z-10 border-b border-white/10 bg-obra-fondo/95 backdrop-blur">
          <ul className="mx-auto flex max-w-[1440px] gap-1 overflow-x-auto px-5 md:px-16">
            {sections.map((s) => (
              <li key={s.id}><a href={`#${s.id}`} className="block whitespace-nowrap px-3 py-4 text-sm font-semibold opacity-85 hover:opacity-100">{s.label}</a></li>
            ))}
          </ul>
        </nav>
      )}

      <div className="mx-auto grid max-w-[1440px] gap-12 px-5 pt-10 md:px-16 lg:grid-cols-12">
        <div className="flex flex-col gap-14 lg:col-span-8">
          {sections.some((s) => s.id === "funciones") && (
            <Section id="funciones" title="Funciones">
              {performances.length === 0 && <p className="opacity-75">Aún no hay funciones registradas.</p>}
              <ul className="flex flex-col gap-3">
                {performances.map((f) => {
                  const vendible = f.on_sale && !!f.starts_at && !p.concluded;
                  return (
                    <li key={f.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-obra-superficie px-5 py-4">
                      <div>
                        <p className="font-bold capitalize">{formatPerformanceDate(f.starts_at)}</p>
                        <p className="text-sm opacity-80">{f.venue ?? p.venue}</p>
                      </div>
                      {vendible ? (
                        <Link href={`/comprar/${f.id}`} className="boton-compra rounded-full px-5 py-3 text-xs font-bold uppercase tracking-[0.08em]">Elegir asientos</Link>
                      ) : (
                        <span className="rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold">{p.concluded ? "Concluida" : "Próximamente"}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
              {prices.length > 0 && (
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {prices.map((z) => (
                    <li key={z.nombre} className="flex justify-between rounded-lg bg-obra-superficie px-4 py-3 text-sm">
                      <span>{z.nombre}</span><b>{formatPrice(z.price)}</b>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}

          {c?.sinopsis.length ? (
            <Section id="sinopsis" title="Sinopsis">
              {c.sinopsis.map((t, i) => <p key={i} className="max-w-3xl text-lg leading-relaxed opacity-90">{t}</p>)}
            </Section>
          ) : null}

          {canciones > 0 && c && (
            <Section id="canciones" title="Canciones">
              <div className="grid gap-8 sm:grid-cols-2">
                {c.actos.map((a, i) => (
                  <div key={i}>
                    {a.nombre && <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-obra-acento">{a.nombre}</p>}
                    <ol className="flex flex-col">
                      {a.canciones.map((s, j) => (
                        <li key={j} className="flex gap-4 border-b border-white/10 py-2.5">
                          <span className="w-6 text-sm font-bold text-obra-acento">{String(j + 1).padStart(2, "0")}</span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {videos.length > 0 && (
            <Section id="multimedia" title="Videos">
              <div className="grid gap-6 sm:grid-cols-2">
                {videos.map((v) => <YouTube key={v.id} id={v.id!} title={v.titulo} />)}
              </div>
            </Section>
          )}

          {c && (c.reparto.length > 0 || c.ensamble.length > 0) && (
            <Section id="elenco" title="Elenco">
              <CreditList items={c.reparto.map((r) => ({ a: r.personaje, b: r.persona }))} />
              {c.ensamble.length > 0 && (
                <div>
                  <p className="mb-2 mt-4 text-xs font-bold uppercase tracking-[0.2em] text-obra-acento">Ensamble</p>
                  <p className="leading-relaxed opacity-90">{c.ensamble.join(" · ")}</p>
                </div>
              )}
            </Section>
          )}

          {equipo.length > 0 && c && (
            <Section id="equipo" title="Equipo">
              {c.creativo.length > 0 && <><p className="text-xs font-bold uppercase tracking-[0.2em] text-obra-acento">Equipo creativo</p><CreditList items={c.creativo.map((r) => ({ a: r.rol, b: r.persona }))} /></>}
              {c.produccion.length > 0 && <><p className="mt-4 text-xs font-bold uppercase tracking-[0.2em] text-obra-acento">Equipo de producción</p><CreditList items={c.produccion.map((r) => ({ a: r.rol, b: r.persona }))} /></>}
              {c.crew.length > 0 && <><p className="mt-4 text-xs font-bold uppercase tracking-[0.2em] text-obra-acento">Crew</p><CreditList items={c.crew.map((r) => ({ a: r.rol, b: r.persona }))} /></>}
            </Section>
          )}

          {c?.agradecimientos.length ? (
            <Section title="Agradecimientos">
              <ul className="flex flex-col gap-2 opacity-90">{c.agradecimientos.map((a, i) => <li key={i}>{a}</li>)}</ul>
            </Section>
          ) : null}

          {!c?.sinopsis.length && !canciones && (
            <p className="rounded-xl bg-obra-superficie p-6 opacity-85">
              La sinopsis, las canciones y el elenco de esta producción se publicarán pronto.
            </p>
          )}
        </div>

        {c?.ficha.length ? (
          <aside className="lg:col-span-4">
            <div className="sticky top-20 rounded-2xl bg-obra-superficie p-6">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-obra-acento">Ficha técnica</p>
              <dl>
                {c.ficha.map((f, i) => (
                  <div key={i} className="flex justify-between gap-4 border-b border-white/10 py-2.5 text-sm last:border-0">
                    <dt className="opacity-75">{f.etiqueta}</dt>
                    <dd className="text-right font-semibold">{f.valor}</dd>
                  </div>
                ))}
              </dl>
              <Link href="/producciones" className="mt-5 block text-sm font-bold text-obra-acento">← Todas las producciones</Link>
            </div>
          </aside>
        ) : null}
      </div>
    </main>
  );
}
