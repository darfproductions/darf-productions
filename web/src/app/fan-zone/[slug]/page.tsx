/* eslint-disable @next/next/no-img-element -- fotos de la Fan Zone desde Storage */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FanZoneHeading } from "@/components/FanZoneHeading";
import { YouTube } from "@/components/YouTube";
import { requireSession } from "@/lib/auth";
import { listFanzone } from "@/lib/fanzone";
import { dominio, type FanItem } from "@/lib/fanzone-rules";
import { getProduction } from "@/lib/productions";

export const metadata: Metadata = { title: "Fan Zone" };

type Item = FanItem & { archivo_url: string | null };

function Contenido({ it }: { it: Item }) {
  const desc = it.descripcion && it.tipo !== "texto" ? <p className="whitespace-pre-line text-sm opacity-80">{it.descripcion}</p> : null;
  switch (it.tipo) {
    case "video":
      return (
        <div className="flex flex-col gap-2">
          <YouTube id={it.youtube_id!} title={it.titulo} />
          {desc}
        </div>
      );
    case "foto":
      return (
        <figure className="flex flex-col gap-2">
          <a href={it.archivo_url ?? "#"} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl">
            <img src={it.archivo_url ?? ""} alt={it.titulo} className="aspect-[4/3] w-full object-cover transition hover:scale-[1.02]" />
          </a>
          <figcaption className="font-bold">{it.titulo}</figcaption>
          {desc}
        </figure>
      );
    case "documento":
      return (
        <a href={it.archivo_url ?? "#"} target="_blank" rel="noreferrer" className="flex h-full flex-col gap-2 rounded-[18px] border border-linea bg-telon p-5 hover:border-oro/40">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-oro">Documento · PDF</span>
          <span className="text-lg font-bold">{it.titulo}</span>
          {desc}
          <span className="mt-auto text-sm font-bold">Abrir ↗</span>
        </a>
      );
    case "enlace":
      return (
        <a href={it.url ?? "#"} target="_blank" rel="noreferrer" className="flex h-full flex-col gap-2 rounded-[18px] border border-linea bg-telon p-5 hover:border-oro/40">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-oro">{dominio(it.url ?? "")}</span>
          <span className="text-lg font-bold">{it.titulo}</span>
          {desc}
          <span className="mt-auto text-sm font-bold">Ir al enlace ↗</span>
        </a>
      );
    case "texto":
      return (
        <article className="flex h-full flex-col gap-2 rounded-[18px] border border-linea bg-telon p-5">
          <h3 className="text-lg font-bold">{it.titulo}</h3>
          <p className="whitespace-pre-line text-sm leading-relaxed opacity-90">{it.descripcion}</p>
        </article>
      );
  }
}

// Fan Zone de una obra: solo con cuenta. Destacados arriba y luego todo en el orden que eligió el equipo.
export default async function FanZoneProductionPage({ params }: PageProps<"/fan-zone/[slug]">) {
  const { slug } = await params;
  await requireSession(`/fan-zone/${slug}`);
  const data = await getProduction(slug);
  if (!data) notFound();
  const p = data.production;
  const items = (await listFanzone(p.id)).filter((i) => i.visible);
  const destacados = items.filter((i) => i.destacado);
  const resto = items.filter((i) => !i.destacado);

  return (
    <main className="pb-24">
      <FanZoneHeading title={p.nombre}>
        Videos, fotos, documentos y material exclusivo de la producción.
      </FanZoneHeading>
      <div className="mx-auto flex max-w-[1440px] flex-col gap-10 px-5 pt-12 md:px-16 md:pt-16">
        {items.length === 0 && <p className="tarjeta p-8 text-lg">El contenido de esta producción se publicará pronto.</p>}
        {destacados.length > 0 && (
          <section aria-label="Destacados" className="grid gap-6 md:grid-cols-2">
            {destacados.map((it) => <div key={it.id} className="rounded-[22px] p-1 ring-1 ring-oro/45"><Contenido it={it} /></div>)}
          </section>
        )}
        {resto.length > 0 && (
          <section aria-label="Contenidos" className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {resto.map((it) => <div key={it.id}><Contenido it={it} /></div>)}
          </section>
        )}
        <Link href="/fan-zone" className="fb fb-oro fb-sm self-start">← Volver a la Fan Zone</Link>
      </div>
    </main>
  );
}
