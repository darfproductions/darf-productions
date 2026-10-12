import Image from "next/image";
import Link from "next/link";
import { EstadoObra } from "@/components/EstadoObra";
import { ArtFill } from "@/components/PosterArt";
import { lineaObra } from "@/components/ProductionCard";
import { partesFuncion } from "@/lib/disponibilidad";
import { formatPrice, getTheme, themeStyle, type PublicProduction } from "@/lib/productions";

// Tarjetas de la cartelera (guía de UI · Fusión). Toman los colores de cada obra.

/** Título de sección con filete: "Próximamente ───── 2027". */
export function SeccionObras({ id, titulo, nota, children }: { id: string; titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} className="flex scroll-mt-6 flex-col gap-7 md:gap-8">
      <div className="flex items-center gap-6">
        <h2 id={`${id}-t`} className="h3-seccion whitespace-nowrap">{titulo}</h2>
        <hr aria-hidden="true" className="flex-1 border-linea-2" />
        {nota && <span className="shrink-0 text-[12.5px] text-texto-3">{nota}</span>}
      </div>
      {children}
    </section>
  );
}

/** Obra en cartelera: tarjeta panorámica con ambiente, logo, compra y próxima función. */
export function ObraPanoramica({ p }: { p: PublicProduction }) {
  const t = getTheme(p);
  const f = p.proxima ? partesFuncion(p.proxima) : null;
  return (
    <article style={themeStyle(t)} className="relative flex min-h-[540px] overflow-hidden rounded-[28px] border border-linea bg-obra-fondo text-obra-texto md:min-h-[560px]">
      {t && <Image src={t.ambiente} alt="" fill sizes="(min-width: 1440px) 1312px, 100vw" className="object-cover" />}
      <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(0deg,var(--obra-fondo)_35%,color-mix(in_srgb,var(--obra-fondo)_40%,transparent)_70%,transparent)] md:bg-[linear-gradient(90deg,var(--obra-fondo)_0%,color-mix(in_srgb,var(--obra-fondo)_85%,transparent)_38%,color-mix(in_srgb,var(--obra-fondo)_10%,transparent)_75%)]" />
      <div aria-hidden="true" className="cono absolute -top-72 left-[40%] hidden h-[900px] w-[640px] md:block" />
      <div className="relative flex w-full flex-col justify-end gap-6 p-6 md:max-w-[640px] md:justify-center md:p-16">
        <EstadoObra estado={p.estadoPublico} className="self-start" />
        <h3 className="flex">
          {t ? (
            <Image src={t.logo} alt={p.nombre} width={1400} height={1400} sizes="(min-width: 768px) 460px, 80vw" style={{ width: "auto", height: "auto" }} className="max-h-[130px] max-w-full object-contain object-left-bottom drop-shadow-[0_18px_40px_var(--obra-sombra)] md:max-h-[200px] md:max-w-[460px]" />
          ) : (
            <span className="titular text-4xl md:text-6xl">{p.nombre}</span>
          )}
        </h3>
        <ul className="flex flex-wrap gap-2">
          {p.temporada && <li className="chip chip-obra"><span className="text-obra-acento">✦</span>Temporada {p.temporada}</li>}
          {p.venue && <li className="chip chip-obra">{p.venue}</li>}
          {p.price > 0 && <li className="chip chip-obra num">Desde {formatPrice(p.price)}</li>}
        </ul>
        <div className="flex flex-wrap gap-3">
          <Link href={`/producciones/${p.id}#funciones`} className="fb fb-luz">Comprar boletos</Link>
          <Link href={`/producciones/${p.id}`} className="fb fb-obra">Conocer la obra</Link>
        </div>
      </div>
      {f && (
        <Link href={`/producciones/${p.id}#funciones`} className="glass absolute bottom-10 right-10 hidden gap-1 px-[22px] py-[18px] text-texto lg:grid">
          <span className="text-[12.5px] text-texto-3">Próxima función</span>
          <strong className="text-lg capitalize">{f.dia} {f.numero} {f.mes} · {f.hora}</strong>
        </Link>
      )}
    </article>
  );
}

/** Obra próxima: tarjeta horizontal (arte a la izquierda, datos a la derecha). */
export function ObraHorizontal({ p }: { p: PublicProduction }) {
  const t = getTheme(p);
  return (
    <Link href={`/producciones/${p.id}`} className="tarjeta tarjeta-hover group grid sm:grid-cols-2">
      <div className="relative aspect-[16/10] overflow-hidden sm:aspect-auto sm:min-h-[280px]" style={{ background: t?.fondo ?? "var(--telon-2)" }}>
        <div className="absolute inset-0 transition-transform duration-700 group-hover:scale-[1.04] motion-reduce:transition-none">
          {t ? <ArtFill theme={t} alt={p.nombre} sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw" /> : <span className="titular absolute inset-x-6 bottom-6 text-3xl">{p.nombre}</span>}
        </div>
      </div>
      <div className="flex flex-col justify-center gap-4 p-6 md:p-9">
        <EstadoObra estado={p.estadoPublico} texto={p.temporada ? `Próximamente · ${p.temporada}` : undefined} className="self-start" />
        <strong className="text-2xl font-black tracking-[-0.02em]">{p.nombre}</strong>
        <p className="text-[15px] leading-relaxed text-texto-2">{p.proxima || p.venue ? lineaObra(p) : "Detalles, fechas y audiciones por anunciar."}</p>
        <span className="text-[12.5px] font-bold text-oro-claro">Conocer la obra →</span>
      </div>
    </Link>
  );
}
