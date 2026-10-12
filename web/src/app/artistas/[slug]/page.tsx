/* eslint-disable @next/next/no-img-element -- fotos del perfil desde Storage */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { YouTube } from "@/components/YouTube";
import { TIPO_CREDITO } from "@/lib/casting-rules";
import { getProBySlug } from "@/lib/pro-profile";
import { LISTAS, reelYoutube } from "@/lib/pro-rules";
import { perfilUrl } from "@/lib/productions";

export async function generateMetadata({ params }: PageProps<"/artistas/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const d = await getProBySlug(slug);
  return { title: d ? d.nombre : "Artista" };
}

// Perfil público de un artista (0057): solo si la persona lo activó (y, si es menor, con permiso del tutor).
export default async function Artista({ params }: PageProps<"/artistas/[slug]">) {
  const { slug } = await params;
  const d = await getProBySlug(slug);
  if (!d) notFound();
  const { pro, nombre, fotos, obras } = d;
  const h = pro.habilidades ?? {};
  const reel = reelYoutube(pro.reel_url);
  const habilidades = [
    ...(h.canto ? [{ label: "Canto", items: [h.canto] }] : []),
    ...LISTAS.map((l) => ({ label: l.label, items: h[l.key] ?? [] })).filter((x) => x.items.length),
  ];
  return (
    <main className="pb-16">
      <section className="mx-auto grid max-w-[1100px] gap-8 px-5 pt-6 md:grid-cols-[280px_1fr] md:px-16">
        <div className="overflow-hidden rounded-2xl bg-telon">
          {pro.retrato_path ? <img src={perfilUrl(pro.retrato_path)} alt={`Retrato de ${nombre}`} className="aspect-[4/5] w-full object-cover" />
            : <div className="grid aspect-[4/5] place-items-center text-6xl font-black">{nombre.slice(0, 1)}</div>}
        </div>
        <div className="flex flex-col gap-4">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-violeta-claro">Artista DARF</p>
          <h1 className="titular text-4xl md:text-6xl">{nombre}</h1>
          {pro.semblanza && <p className="whitespace-pre-line text-lg leading-relaxed text-texto-2">{pro.semblanza}</p>}
          <div className="flex flex-wrap gap-3 text-sm font-bold">
            {pro.instagram && <a href={`https://instagram.com/${pro.instagram}`} target="_blank" rel="noreferrer" className="rounded-full border border-white/25 px-4 py-2">Instagram ↗</a>}
            {pro.tiktok && <a href={`https://tiktok.com/@${pro.tiktok}`} target="_blank" rel="noreferrer" className="rounded-full border border-white/25 px-4 py-2">TikTok ↗</a>}
            {pro.youtube && <a href={pro.youtube} target="_blank" rel="noreferrer" className="rounded-full border border-white/25 px-4 py-2">YouTube ↗</a>}
            {pro.reel_url && !reel && <a href={pro.reel_url} target="_blank" rel="noreferrer" className="rounded-full border border-white/25 px-4 py-2">Reel ↗</a>}
          </div>
        </div>
      </section>

      <div className="mx-auto mt-12 flex max-w-[1100px] flex-col gap-12 px-5 md:px-16">
        {reel && <section><h2 className="titular mb-4 text-2xl">Reel</h2><YouTube id={reel} title={`Reel de ${nombre}`} /></section>}

        {obras.length > 0 && (
          <section>
            <h2 className="titular mb-4 text-2xl">Con DARF Productions</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {obras.map((o, i) => (
                <li key={i}><Link href={`/producciones/${o.production_id}`} className="block rounded-xl bg-telon p-4 hover:bg-telon-2">
                  <span className="font-bold">{o.obra}</span><span className="block text-sm text-texto-2">{o.papel || TIPO_CREDITO[o.tipo] || o.tipo}</span>
                </Link></li>
              ))}
            </ul>
          </section>
        )}

        {pro.trayectoria.length > 0 && (
          <section>
            <h2 className="titular mb-4 text-2xl">Trayectoria</h2>
            <ul className="flex flex-col divide-y divide-white/10">
              {pro.trayectoria.map((t, i) => (
                <li key={i} className="flex flex-wrap justify-between gap-2 py-2.5">
                  <span><b>{t.obra}</b>{t.papel && <span className="text-texto-2"> · {t.papel}</span>}</span>
                  <span className="text-sm text-texto-3">{[t.compania, t.anio].filter(Boolean).join(" · ")}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {habilidades.length > 0 && (
          <section>
            <h2 className="titular mb-4 text-2xl">Habilidades</h2>
            <dl className="grid gap-4 sm:grid-cols-2">
              {habilidades.map((x) => (
                <div key={x.label}><dt className="text-xs font-bold uppercase tracking-[0.2em] text-texto-3">{x.label}</dt>
                  <dd className="mt-1 flex flex-wrap gap-2">{x.items.map((it) => <span key={it} className="rounded-full bg-telon px-3 py-1 text-sm">{it}</span>)}</dd></div>
              ))}
            </dl>
          </section>
        )}

        {fotos.length > 0 && (
          <section>
            <h2 className="titular mb-4 text-2xl">Galería</h2>
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {fotos.map((f) => <li key={f.id}><a href={perfilUrl(f.path)} target="_blank" rel="noreferrer"><img src={perfilUrl(f.path)} alt="" className="aspect-[4/5] w-full rounded-xl object-cover" /></a></li>)}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
