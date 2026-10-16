/* eslint-disable @next/next/no-img-element -- imágenes desde Storage */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeading } from "@/components/PageHeading";
import { Icono } from "@/components/Icono";
import { FORMATO_INFO, FORMATOS, poster } from "@/lib/poster";
import { getProductionContent } from "@/lib/production-content";
import { assetUrl, formatPerformanceDate, getGallery, getProduction } from "@/lib/productions";

// 0114: kit de prensa de cada obra. Liga pública que no está en el menú; se comparte con medios.
// Solo usa lo que ya es público en la página de la obra, con las imágenes en su tamaño original.

const CORREO = "contact@darfproductions.com";

export async function generateMetadata({ params }: PageProps<"/producciones/[slug]/prensa">): Promise<Metadata> {
  const { slug } = await params;
  const data = await getProduction(slug);
  return {
    title: data ? `Kit de prensa · ${data.production.nombre}` : "Kit de prensa",
    alternates: { canonical: `/producciones/${slug}/prensa` },
  };
}

type Descarga = { titulo: string; detalle: string; url: string; fondo?: boolean };

export default async function KitPrensa({ params }: PageProps<"/producciones/[slug]/prensa">) {
  const { slug } = await params;
  const data = await getProduction(slug);
  if (!data) notFound();
  const p = data.production;
  const [c, galeria] = await Promise.all([getProductionContent(p.id), getGallery(p.id)]);

  const descargas: Descarga[] = [];
  if (p.logo_path) descargas.push({ titulo: "Logo de la obra", detalle: "PNG con fondo transparente", url: assetUrl(p.logo_path), fondo: true });
  for (const f of FORMATOS) {
    const info = poster(p, f, true);
    const limpio = poster(p, f, false);
    if (info) descargas.push({ titulo: `Póster ${FORMATO_INFO[f].titulo}`, detalle: "Con la información", url: assetUrl(info) });
    if (limpio) descargas.push({ titulo: `Póster ${FORMATO_INFO[f].titulo}`, detalle: "Solo imagen", url: assetUrl(limpio) });
  }
  if (p.ambiente_path) descargas.push({ titulo: "Imagen de ambiente", detalle: "Fondo de la obra", url: assetUrl(p.ambiente_path) });

  const ahora = new Date().toISOString();
  const proximas = data.performances.filter((f) => f.starts_at && f.starts_at > ahora);
  const creditos = [
    ...c.creativo.map((x) => ({ rol: x.rol, persona: x.persona })),
    ...c.produccion.map((x) => ({ rol: x.rol, persona: x.persona })),
  ].filter((x) => x.rol);

  return (
    <main className="pb-24">
      <PageHeading eyebrow="Kit de prensa" title={p.nombre}>
        {p.frase?.trim() || "Una producción de DARF Productions."} Material libre para medios: cita a DARF Productions como fuente.
      </PageHeading>
      <div className="mx-auto flex max-w-[1100px] flex-col gap-12 px-5 md:px-16">
        <section aria-labelledby="contacto-t" className="flex flex-col gap-3 rounded-[22px] bg-telon p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 id="contacto-t" className="text-lg font-bold">Contacto para medios</h2>
            <p className="text-sm text-texto-2">Entrevistas, acreditaciones y fotos adicionales: <span className="font-semibold text-texto">{CORREO}</span></p>
          </div>
          <a href={`mailto:${CORREO}?subject=${encodeURIComponent(`Prensa · ${p.nombre}`)}`} className="fb fb-luz fb-sm self-start">Escribir a prensa</a>
        </section>

        {descargas.length > 0 && (
          <section aria-labelledby="descargas-t" className="flex flex-col gap-4">
            <h2 id="descargas-t" className="h2-seccion">Logo y pósters</h2>
            <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {descargas.map((d) => (
                <li key={d.url} className="flex flex-col gap-2">
                  <a href={d.url} target="_blank" rel="noreferrer" className={`grid aspect-square place-items-center overflow-hidden rounded-[18px] ${d.fondo ? "bg-[repeating-conic-gradient(#2a2436_0_25%,#1d1828_0_50%)] bg-[length:24px_24px] p-4" : "bg-telon"}`}>
                    <img src={d.url} alt={`${d.titulo} de ${p.nombre}`} loading="lazy" className={d.fondo ? "max-h-full max-w-full object-contain" : "h-full w-full object-cover"} />
                  </a>
                  <span className="text-sm"><b>{d.titulo}</b><span className="block text-xs text-texto-3">{d.detalle}</span></span>
                  <a href={d.url} download target="_blank" rel="noreferrer" className="self-start text-xs font-bold text-lila"><Icono nombre="descargar" /> Descargar</a>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="grid gap-10 md:grid-cols-[minmax(0,1fr)_320px]">
          {c.sinopsis.length > 0 && (
            <section aria-labelledby="sinopsis-t" className="flex flex-col gap-3">
              <h2 id="sinopsis-t" className="h2-seccion">Sinopsis</h2>
              {c.sinopsis.map((t, i) => <p key={i} className="text-texto-2">{t}</p>)}
            </section>
          )}
          <section aria-labelledby="ficha-t" className="flex flex-col gap-3">
            <h2 id="ficha-t" className="h2-seccion">Ficha</h2>
            <dl className="flex flex-col gap-2 text-sm">
              {c.ficha.map((f) => <div key={f.etiqueta}><dt className="text-texto-3">{f.etiqueta}</dt><dd className="font-semibold">{f.valor}</dd></div>)}
              {proximas.length > 0 && (
                <div><dt className="text-texto-3">Funciones</dt>
                  <dd className="font-semibold">{proximas.map((f) => <span key={f.id} className="block">{formatPerformanceDate(f.starts_at)}</span>)}</dd>
                </div>
              )}
            </dl>
          </section>
        </div>

        {(c.reparto.length > 0 || creditos.length > 0) && (
          <section aria-labelledby="creditos-t" className="flex flex-col gap-4">
            <h2 id="creditos-t" className="h2-seccion">Créditos</h2>
            <div className="grid gap-8 md:grid-cols-2">
              {c.reparto.length > 0 && (
                <ul className="flex flex-col gap-1.5 text-sm">
                  <li className="text-xs font-bold uppercase tracking-widest text-texto-3">Reparto</li>
                  {c.reparto.map((r, i) => <li key={i}><b>{r.persona}</b>{r.personaje && <span className="text-texto-2"> · {r.personaje}</span>}</li>)}
                  {c.ensamble.length > 0 && <li className="pt-2 text-texto-2"><b className="text-texto">Ensamble:</b> {c.ensamble.map((e) => e.persona).join(", ")}</li>}
                </ul>
              )}
              {creditos.length > 0 && (
                <ul className="flex flex-col gap-1.5 text-sm">
                  <li className="text-xs font-bold uppercase tracking-widest text-texto-3">Equipo creativo y producción</li>
                  {creditos.map((r, i) => <li key={i}><span className="text-texto-2">{r.rol}:</span> <b>{r.persona}</b></li>)}
                </ul>
              )}
            </div>
          </section>
        )}

        {galeria.length > 0 && (
          <section aria-labelledby="fotos-t" className="flex flex-col gap-4">
            <h2 id="fotos-t" className="h2-seccion">Fotos</h2>
            <p className="text-sm text-texto-2">Toca una foto para abrirla en su tamaño original.</p>
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {galeria.map((g, i) => (
                <li key={g.id} className="overflow-hidden rounded-[18px] bg-telon">
                  <a href={g.url} download target="_blank" rel="noreferrer" aria-label={`Abrir foto ${i + 1}`}>
                    <img src={g.url} alt={`${p.nombre}: foto ${i + 1} de ${galeria.length}`} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="darf-t" className="flex flex-col gap-2">
          <h2 id="darf-t" className="h2-seccion">Sobre DARF Productions</h2>
          <p className="text-texto-2">Compañía de teatro musical hecho por jóvenes, para toda la familia, en Querétaro, México. <Link href="/nosotros" className="font-bold text-lila">Conoce al equipo</Link>.</p>
        </section>

        <Link href={`/producciones/${p.id}`} className="self-start text-sm font-bold text-lila"><Icono nombre="flecha-izq" /> Ver la página de {p.nombre}</Link>
      </div>
    </main>
  );
}
