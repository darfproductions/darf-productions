/* eslint-disable @next/next/no-img-element -- fotos desde Storage */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeading } from "@/components/PageHeading";
import { YouTube } from "@/components/YouTube";
import { Icono } from "@/components/Icono";
import { CATEGORIAS, precioTexto, tipoVideo, type ShowcaseMedia } from "@/lib/showcase-rules";
import { getShowcases, showcaseFotoUrl } from "@/lib/showcases";
import { parseYoutube } from "@/lib/youtube";

export const metadata: Metadata = {
  title: "Showcases",
  description: "DARF Showcase Shows: música, danza y espectáculo en vivo para escuelas, empresas y celebraciones.",
};

function Galeria({ items, titulo }: { items: ShowcaseMedia[]; titulo?: string }) {
  if (!items.length) return null;
  const fotos = items.filter((m) => m.tipo === "foto" && m.path);
  const videos = items.filter((m) => m.tipo === "video" && m.url);
  return (
    <div className="flex flex-col gap-4">
      {titulo && <h3 className="text-lg font-extrabold">{titulo}</h3>}
      {videos.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {videos.map((v) => {
            const id = tipoVideo(v.url!) === "youtube" ? parseYoutube(v.url!) : null;
            return id ? <YouTube key={v.id} id={id} title={v.titulo ?? "Video"} /> : (
              <a key={v.id} href={v.url!} target="_blank" rel="noopener" className="flex items-center justify-between gap-3 rounded-xl border border-white/15 bg-telon p-4 font-semibold hover:border-white/40">
                <span>{v.titulo ?? "Ver video"}</span><Icono nombre="externo" />
              </a>
            );
          })}
        </div>
      )}
      {fotos.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {fotos.map((f) => (
            <li key={f.id} className="aspect-[4/3] overflow-hidden rounded-xl bg-telon">
              <img src={showcaseFotoUrl(f.path!)} alt={f.titulo ?? "Foto de showcase"} loading="lazy" className="h-full w-full object-cover" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// DARF Showcase Shows (0121): planes, muestras y cómo contratar. Se edita en Panel → Proyectos → Showcases.
export default async function ShowcasesPage() {
  const { ajustes: a, planes, media, editor } = await getShowcases();
  if (!a || (!a.publicado && !editor)) notFound();
  const activos = planes.filter((p) => p.activo);
  const generales = media.filter((m) => !m.plan_id);
  const desde = activos.map((p) => p.precio).filter((x): x is number => x != null);
  return (
    <main className="pb-24">
      <PageHeading eyebrow="Showcases en vivo" title={a.titulo}>
        {a.lema && <span className="block font-bold uppercase tracking-[0.14em] text-violeta-claro">{a.lema}</span>}
        {!a.publicado && <span className="mt-2 block font-bold text-aviso">Página sin publicar: solo la ve el equipo.</span>}
      </PageHeading>
      <div className="mx-auto flex max-w-[1100px] flex-col gap-16 px-5 md:px-16">
        <section className="flex flex-col gap-6">
          {a.intro && <p className="lead max-w-3xl whitespace-pre-line">{a.intro}</p>}
          <div className="flex flex-wrap gap-2">
            <span className="chip chip-obra">{activos.length} {activos.length === 1 ? "formato" : "formatos"}</span>
            {desde.length > 0 && <span className="chip chip-obra">Desde {precioTexto(Math.min(...desde))} MXN</span>}
            <a href="#planes" className="fb fb-luz fb-sm">Ver planes</a>
          </div>
          {a.publicos.length > 0 && (
            <ul className="grid gap-4 md:grid-cols-3">
              {a.publicos.map((b) => (
                <li key={b.titulo} className="rounded-[22px] border border-white/10 bg-telon p-6">
                  <h3 className="text-sm font-black uppercase tracking-[0.14em]">{b.titulo}</h3>
                  <p className="mt-2 text-sm text-texto-2">{b.texto}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {a.especial.length > 0 && (
          <section aria-labelledby="esp-t" className="flex flex-col gap-4">
            <h2 id="esp-t" className="h2-seccion">¿Qué hace especial a DARF?</h2>
            <dl className="grid gap-x-8 gap-y-4 md:grid-cols-2">
              {a.especial.map((b) => (
                <div key={b.titulo} className="border-b border-white/10 pb-4">
                  <dt className="font-extrabold">{b.titulo}</dt>
                  <dd className="text-sm text-texto-2">{b.texto}</dd>
                </div>
              ))}
            </dl>
            {a.importante && <p className="rounded-2xl bg-[#1d1626] p-5 text-sm"><b className="text-[#ff5ca8]">Importante · </b>{a.importante}</p>}
          </section>
        )}

        {generales.length > 0 && (
          <section aria-labelledby="gal-t" className="flex flex-col gap-6">
            <h2 id="gal-t" className="h2-seccion">Así se vive</h2>
            {(["show", "equipo", "ensayos"] as const).map((c) => <Galeria key={c} titulo={CATEGORIAS[c]} items={generales.filter((m) => m.categoria === c)} />)}
          </section>
        )}

        <section id="planes" aria-labelledby="planes-t" className="flex scroll-mt-24 flex-col gap-6">
          <h2 id="planes-t" className="h2-seccion">Planes</h2>
          {activos.length === 0 && <p className="text-texto-2">Pronto anunciaremos los planes. Escríbenos para cotizar tu fecha.</p>}
          {activos.map((p, i) => (
            <article key={p.id} id={`plan-${p.id}`} className="flex scroll-mt-24 flex-col gap-6 rounded-[28px] border border-white/10 bg-telon p-6 md:p-10">
              <header className="flex flex-col gap-2">
                <span className="self-start rounded-full bg-[#3b1ce8] px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em]">Paquete {String(i + 1).padStart(2, "0")}</span>
                <h3 className="display text-[clamp(2rem,5vw,3.5rem)]">{p.nombre}</h3>
                {p.descripcion && <p className="max-w-2xl text-texto-2">{p.descripcion}</p>}
              </header>
              <div className="flex flex-col gap-1 rounded-2xl bg-sala p-5">
                <p><strong className="num text-[clamp(2rem,5vw,3rem)] font-black">{precioTexto(p.precio)}</strong>{p.precio != null && <span className="ml-1 font-bold text-violeta-claro">MXN</span>}</p>
                {p.resumen && <p className="text-sm font-black uppercase tracking-[0.12em] text-[#ff5ca8]">{p.resumen}</p>}
                {p.detalle && <p className="text-sm text-texto-2">{p.detalle}</p>}
              </div>
              {p.incluye.length > 0 && (
                <div>
                  <h4 className="mb-2 text-sm font-black uppercase tracking-[0.14em] text-violeta-claro">Incluye</h4>
                  <ul className="flex flex-col gap-2">
                    {p.incluye.map((x) => <li key={x} className="flex gap-3"><span aria-hidden="true" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#ff5ca8]" />{x}</li>)}
                  </ul>
                </div>
              )}
              {p.ideal_para && <p className="rounded-2xl bg-[#1d1626] p-5 text-sm"><b className="text-[#ff5ca8]">Ideal para · </b>{p.ideal_para}</p>}
              {p.nota && <p className="text-xs text-texto-3">{p.nota}</p>}
              <Galeria items={media.filter((m) => m.plan_id === p.id)} />
              <Link href={`/showcases/contratar/${p.id}`} className="fb fb-luz self-start">Contratar {p.nombre}</Link>
            </article>
          ))}
        </section>

        {(a.antes_reservar.length > 0 || a.anticipacion.length > 0) && (
          <section aria-labelledby="enc-t" className="flex flex-col gap-4">
            <h2 id="enc-t" className="h2-seccion">Hagamos que encaje con tu evento</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {[["Antes de reservar", a.antes_reservar], ["Anticipación y montaje", a.anticipacion]].map(([t, xs]) => (xs as string[]).length > 0 && (
                <div key={t as string} className="rounded-[22px] border border-white/10 bg-telon p-6">
                  <h3 className="mb-3 text-sm font-black uppercase tracking-[0.14em] text-violeta-claro">{t as string}</h3>
                  <ul className="flex flex-col gap-2 text-sm">{(xs as string[]).map((x) => <li key={x} className="flex gap-3"><span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#ff5ca8]" />{x}</li>)}</ul>
                </div>
              ))}
            </div>
          </section>
        )}

        {a.condiciones.length > 0 && (
          <section aria-labelledby="cond-t" className="flex flex-col gap-4">
            <h2 id="cond-t" className="h2-seccion">Condiciones clave</h2>
            <dl className="flex flex-col divide-y divide-white/10">
              {a.condiciones.map((b) => (
                <div key={b.titulo} className="grid gap-1 py-3 md:grid-cols-[220px_1fr] md:gap-6">
                  <dt className="font-extrabold">{b.titulo}</dt>
                  <dd className="text-sm text-texto-2">{b.texto}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <section className="flex flex-col items-start gap-4 rounded-[28px] bg-[linear-gradient(120deg,#3b1ce8,#ff2f8c)] p-8 md:p-12">
          <p className="display text-[clamp(1.8rem,4vw,3rem)]">Tu evento. Nuestra escena.</p>
          <p className="max-w-2xl">Cuéntanos qué estás organizando y te ayudamos a elegir y adaptar el formato que mejor encaje con tu espacio, tu público y el momento que quieres crear.</p>
          <a href="#planes" className="fb bg-white text-[#0b0910]">Elegir un plan</a>
        </section>
      </div>
    </main>
  );
}
