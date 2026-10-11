import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CastGrid, Ensemble, TeamGroups } from "@/components/Credits";
import { Section } from "@/components/PageHeading";
import { HeroBackdrop, ProductionLogo } from "@/components/PosterArt";
import { YouTube, youtubeId } from "@/components/YouTube";
import { PRODUCTION_CONTENT } from "@/content/producciones";
import {
  formatPerformanceDate,
  formatPrice,
  getGallery,
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

export default async function ProductionPage({ params }: PageProps<"/producciones/[slug]">) {
  const { slug } = await params;
  const data = await getProduction(slug);
  if (!data) notFound();
  const { production: p, performances, prices } = data;
  const theme = getTheme(p.id);
  const c = PRODUCTION_CONTENT[p.id];
  const gallery = await getGallery(p.id);
  const canciones = c?.actos.reduce((n, a) => n + a.canciones.length, 0) ?? 0;
  const videos = (c?.videos ?? []).map((v) => ({ ...v, id: youtubeId(v.url) })).filter((v) => v.id);
  const equipos = [
    { titulo: "Equipo creativo", items: c?.creativo ?? [] },
    { titulo: "Equipo de producción", items: c?.produccion ?? [] },
    { titulo: "Crew", items: c?.crew ?? [] },
    { titulo: "Equipo técnico", items: c?.tecnico ?? [] },
  ];
  const hayEquipo = equipos.some((g) => g.items.length > 0);
  const f = c?.ficha;
  const ficha = [
    { etiqueta: "Temporada", valor: f?.temporada },
    { etiqueta: "Fechas", valor: f?.fechas },
    { etiqueta: "Sede", valor: p.venue ?? undefined },
    { etiqueta: "Duración", valor: f?.duracion },
    { etiqueta: "Clasificación", valor: f?.clasificacion },
    { etiqueta: "Basada en", valor: f?.basadaEn },
    ...(f?.extras ?? []),
  ].filter((x): x is { etiqueta: string; valor: string } => !!x.valor);

  // Orden fijo de la plantilla (decisión de Johann).
  const sections = [
    { id: "sinopsis", label: "Sinopsis", show: !!c?.sinopsis.length },
    { id: "funciones", label: "Funciones", show: !p.concluded || performances.length > 0 },
    { id: "canciones", label: "Canciones", show: canciones > 0 },
    { id: "elenco", label: "Elenco", show: !!(c?.reparto.length || c?.ensamble.length) },
    { id: "equipos", label: "Equipos", show: hayEquipo },
    { id: "galeria", label: "Galería", show: gallery.length > 0 },
    { id: "videos", label: "Videos", show: videos.length > 0 },
    { id: "agradecimientos", label: "Agradecimientos", show: !!c?.agradecimientos.length },
  ].filter((s) => s.show);
  const show = (id: string) => sections.some((s) => s.id === id);

  return (
    <main style={themeStyle(theme)} className="min-h-dvh bg-obra-fondo pb-10 text-obra-texto md:-mt-[100px]">
      {/* Hero de la plantilla: altura fija, ambiente de fondo, logo en caja fija.
          El menú DARF queda arriba sobre la sala oscura: así funciona con cualquier fondo de obra. */}
      <section className="relative h-[560px] overflow-hidden md:h-[660px]">
        {theme && <HeroBackdrop theme={theme} />}
        <div className="relative mx-auto flex h-full max-w-[1440px] flex-col justify-end gap-5 px-5 pb-14 md:px-16 md:pb-20">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-obra-acento">
            {p.concluded ? "Archivo · DARF Productions" : "DARF Productions presenta"}
          </p>
          {theme ? <ProductionLogo theme={theme} nombre={p.nombre} priority /> : <h1 className="titular text-5xl md:text-7xl">{p.nombre}</h1>}
          {theme && <p className="max-w-xl text-lg leading-relaxed opacity-90 md:text-xl">{theme.tagline}</p>}
          <ul className="flex flex-wrap gap-2 text-sm font-semibold">
            {p.venue && <li className="rounded-full border border-current/30 bg-obra-fondo/60 px-3 py-1.5 backdrop-blur">{p.venue}</li>}
            <li className="rounded-full border border-current/30 bg-obra-fondo/60 px-3 py-1.5 backdrop-blur">{p.concluded ? "Producción concluida" : "En cartelera"}</li>
          </ul>
          <div className="flex flex-wrap gap-3">
            {!p.concluded && performances.some((f) => f.on_sale) && (
              <a href="#funciones" className="boton-compra rounded-full px-7 py-4 text-sm font-bold uppercase tracking-[0.1em]">Comprar boletos</a>
            )}
            {c?.ensayos.length ? (
              <Link href={`/fan-zone/${p.id}`} className="rounded-full border border-obra-acento bg-obra-fondo/60 px-6 py-4 text-sm font-bold uppercase tracking-[0.1em] backdrop-blur">Fan Zone</Link>
            ) : null}
          </div>
        </div>
      </section>

      {sections.length > 1 && (
        <nav aria-label="Secciones de la obra" className="sticky top-0 z-10 border-b border-current/15 bg-obra-fondo/95 backdrop-blur">
          <ul className="mx-auto flex max-w-[1440px] gap-1 overflow-x-auto px-5 md:px-16">
            {sections.map((s) => (
              <li key={s.id}><a href={`#${s.id}`} className="block whitespace-nowrap px-3 py-4 text-sm font-semibold opacity-85 hover:opacity-100">{s.label}</a></li>
            ))}
          </ul>
        </nav>
      )}

      <div className="mx-auto grid max-w-[1440px] gap-12 px-5 pt-10 md:px-16 lg:grid-cols-12">
        <div className="flex flex-col gap-14 lg:col-span-8">
          {show("sinopsis") && c && (
            <Section id="sinopsis" title="Sinopsis">
              {c.sinopsis.map((t, i) => <p key={i} className="max-w-3xl text-lg leading-relaxed opacity-90">{t}</p>)}
            </Section>
          )}

          {show("funciones") && (
            <Section id="funciones" title="Funciones y precios">
              {performances.length === 0 && <p className="opacity-75">Aún no hay funciones registradas.</p>}
              <ul className="flex flex-col gap-3">
                {performances.map((fn) => {
                  const vendible = fn.on_sale && !!fn.starts_at && !p.concluded;
                  return (
                    <li key={fn.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-obra-superficie px-5 py-4">
                      <div>
                        <p className="font-bold capitalize">{formatPerformanceDate(fn.starts_at)}</p>
                        <p className="text-sm opacity-80">{fn.venue ?? p.venue}</p>
                      </div>
                      {vendible ? (
                        <Link href={`/comprar/${fn.id}`} className="boton-compra rounded-full px-5 py-3 text-xs font-bold uppercase tracking-[0.08em]">Elegir asientos</Link>
                      ) : (
                        <span className="rounded-full border border-current/30 px-3 py-1.5 text-xs font-bold">{p.concluded ? "Concluida" : "Próximamente"}</span>
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

          {show("canciones") && c && (
            <Section id="canciones" title="Canciones">
              <div className="grid gap-8 sm:grid-cols-2">
                {c.actos.map((a, i) => {
                  // Numeración continua entre actos (Acto II sigue donde terminó el Acto I).
                  const inicio = c.actos.slice(0, i).reduce((n, x) => n + x.canciones.length, 0);
                  return (
                    <div key={i}>
                      {a.nombre && <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-obra-acento">{a.nombre}</p>}
                      <ol className="flex flex-col">
                        {a.canciones.map((song, j) => (
                          <li key={j} className="flex gap-4 border-b border-current/15 py-2.5">
                            <span className="w-6 text-sm font-bold text-obra-acento">{String(inicio + j + 1).padStart(2, "0")}</span>
                            <span>{song}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {show("elenco") && c && (
            <Section id="elenco" title="Elenco">
              {c.reparto.length > 0 && <CastGrid reparto={c.reparto} />}
              {c.ensamble.length > 0 && <Ensemble names={c.ensamble} />}
            </Section>
          )}

          {show("equipos") && (
            <Section id="equipos" title="Equipos">
              <TeamGroups groups={equipos} />
            </Section>
          )}

          {show("galeria") && (
            <Section id="galeria" title="Galería">
              <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {gallery.map((ph) => (
                  <li key={ph.id} className="overflow-hidden rounded-xl">
                    {/* eslint-disable-next-line @next/next/no-img-element -- foto desde Storage */}
                    <img src={ph.url} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover transition-transform hover:scale-105" />
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {show("videos") && (
            <Section id="videos" title="Videos">
              <div className="grid gap-6 sm:grid-cols-2">
                {videos.map((v) => <YouTube key={v.id} id={v.id!} title={v.titulo} />)}
              </div>
            </Section>
          )}

          {show("agradecimientos") && c && (
            <Section id="agradecimientos" title="Agradecimientos">
              <ul className="flex flex-col gap-2 opacity-90">{c.agradecimientos.map((a, i) => <li key={i}>{a}</li>)}</ul>
            </Section>
          )}

          {!c?.sinopsis.length && !canciones && (
            <p className="rounded-xl bg-obra-superficie p-6 opacity-85">
              La sinopsis, las canciones y el elenco de esta producción se publicarán pronto.
            </p>
          )}
        </div>

        {/* Ficha técnica: fija a la derecha en computadora, al final en celular. */}
        {ficha.length > 0 && (
          <aside className="lg:col-span-4">
            <div className="rounded-2xl bg-obra-superficie p-6 lg:sticky lg:top-20">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-obra-acento">Ficha técnica</p>
              <dl>
                {ficha.map((x) => (
                  <div key={x.etiqueta} className="flex justify-between gap-4 border-b border-current/15 py-2.5 text-sm last:border-0">
                    <dt className="opacity-75">{x.etiqueta}</dt>
                    <dd className="text-right font-semibold">{x.valor}</dd>
                  </div>
                ))}
              </dl>
              <Link href="/producciones" className="mt-5 block text-sm font-bold text-obra-acento">← Todas las producciones</Link>
            </div>
          </aside>
        )}
      </div>
    </main>
  );
}
