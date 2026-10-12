/* eslint-disable @next/next/no-img-element -- logos de patrocinadores desde Storage */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CastGrid, Ensemble, TeamGroups } from "@/components/Credits";
import { Section } from "@/components/PageHeading";
import { HeroBackdrop, ProductionLogo } from "@/components/PosterArt";
import { getProductionContent } from "@/lib/production-content";
import { assetUrl, getProduction, getTheme, themeStyle } from "@/lib/productions";
import { getProgram } from "@/lib/program";

export async function generateMetadata({ params }: PageProps<"/programa/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const data = await getProduction(slug);
  return { title: data ? `Programa · ${data.production.nombre}` : "Programa" };
}

// Programa de mano digital: se abre con el QR de la sala. Se llena solo con la obra
// (reparto, ensamble, canciones, equipos, agradecimientos) más notas de dirección y patrocinadores.
export default async function Programa({ params }: PageProps<"/programa/[slug]">) {
  const { slug } = await params;
  const data = await getProduction(slug);
  if (!data) notFound();
  const { page, sponsors } = await getProgram(slug);
  if (!page) notFound();
  // Enlace o archivo: el QR y "Programa de mano" llevan directo ahí.
  if (page.modo === "enlace" && page.enlace_url) redirect(page.enlace_url);
  if (page.modo === "archivo" && page.archivo_path) redirect(assetUrl(page.archivo_path));
  const p = data.production;
  const theme = getTheme(p);
  const c = await getProductionContent(p.id);
  const equipos = [
    { titulo: "Equipo creativo", items: c.creativo },
    { titulo: "Equipo de producción", items: c.produccion },
    { titulo: "Crew", items: c.crew },
    { titulo: "Equipo técnico", items: c.tecnico },
  ].filter((g) => g.items.length);
  let n = 0;

  return (
    <main style={themeStyle(theme)} className="min-h-dvh bg-obra-fondo pb-16 text-obra-texto">
      <section className="relative h-[420px] overflow-hidden md:h-[520px]">
        {theme && <HeroBackdrop theme={theme} />}
        <div className="relative mx-auto flex h-full max-w-[900px] flex-col justify-end gap-4 px-5 pb-10">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-obra-acento">Programa de mano · DARF Productions</p>
          {theme ? <ProductionLogo theme={theme} nombre={p.nombre} priority /> : <h1 className="titular text-5xl">{p.nombre}</h1>}
          {p.venue && <p className="text-sm font-semibold opacity-90">{p.venue}</p>}
        </div>
      </section>

      <div className="mx-auto flex max-w-[900px] flex-col gap-12 px-5 pt-10">
        {page.notas_direccion && (
          <Section id="notas" title="Notas de dirección">
            <p className="whitespace-pre-line text-lg leading-relaxed opacity-90">{page.notas_direccion}</p>
            {page.firma_direccion && <p className="font-bold">— {page.firma_direccion}</p>}
          </Section>
        )}
        {c.reparto.length > 0 && <Section id="reparto" title="Reparto"><CastGrid reparto={c.reparto} /></Section>}
        {c.ensamble.length > 0 && <Section id="ensamble" title="Ensamble"><Ensemble items={c.ensamble} /></Section>}
        {page.mostrar_canciones && c.actos.some((a) => a.canciones.length) && (
          <Section id="canciones" title="Números musicales">
            <div className="grid gap-6 sm:grid-cols-2">
              {c.actos.map((a, i) => (
                <div key={i}>
                  {a.nombre && <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-obra-acento">{a.nombre}</p>}
                  <ol className="flex flex-col gap-1.5">{a.canciones.map((song) => <li key={`${i}-${song}`}><span className="mr-2 opacity-60">{++n}.</span>{song}</li>)}</ol>
                </div>
              ))}
            </div>
          </Section>
        )}
        {page.mostrar_equipos && equipos.length > 0 && <Section id="equipos" title="Equipos"><TeamGroups groups={equipos} /></Section>}
        {page.mensaje && <Section id="mensaje" title="Un mensaje para ti"><p className="whitespace-pre-line text-lg leading-relaxed opacity-90">{page.mensaje}</p></Section>}
        {page.mostrar_agradecimientos && c.agradecimientos.length > 0 && (
          <Section id="agradecimientos" title="Agradecimientos"><ul className="flex flex-col gap-2 opacity-90">{c.agradecimientos.map((a, i) => <li key={i}>{a}</li>)}</ul></Section>
        )}
        {sponsors.length > 0 && (
          <Section id="patrocinadores" title="Patrocinadores">
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {sponsors.map((s) => {
                const inner = s.logo_path
                  ? <img src={assetUrl(s.logo_path)} alt={s.nombre} className="h-20 w-full object-contain" />
                  : <span className="font-bold">{s.nombre}</span>;
                return (
                  <li key={s.id} className="grid min-h-24 place-items-center rounded-2xl bg-white/90 p-4 text-center text-[#111]">
                    {s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="grid w-full place-items-center">{inner}</a> : inner}
                  </li>
                );
              })}
            </ul>
          </Section>
        )}
        <div className="flex flex-wrap gap-3">
          <Link href={`/producciones/${p.id}`} className="rounded-full border border-obra-acento px-5 py-3 text-sm font-bold uppercase tracking-[0.1em]">Página de la obra</Link>
          <Link href={`/fan-zone/${p.id}`} className="rounded-full border border-current/30 px-5 py-3 text-sm font-bold uppercase tracking-[0.1em]">Fan Zone</Link>
        </div>
      </div>
    </main>
  );
}
