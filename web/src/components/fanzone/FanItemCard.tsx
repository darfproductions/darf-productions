/* eslint-disable @next/next/no-img-element -- fotos de la Fan Zone desde Storage */
import { dominio, FAN_CATEGORIAS, type FanCategoria } from "@/lib/fanzone-rules";
import type { FanItemVista, FanProximo } from "@/lib/fanzone";
import { VideoLite } from "./VideoLite";
import { Icono } from "@/components/Icono";

const fecha = (iso: string) => new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", timeZone: "America/Mexico_City" }).format(new Date(iso));
const ETIQUETA: Record<FanCategoria, string> = { ensayo: "Ensayo", making: "Making of", fotos: "Fotos", otro: "Fan Zone" };

const Chip = ({ c }: { c: FanCategoria }) => (
  <span className="chip chip-fz absolute left-3 top-3 z-10 min-h-[24px] px-2.5 text-[10px] uppercase tracking-[0.14em]">{ETIQUETA[c]}</span>
);

// Tarjeta de un contenido de la Fan Zone: arriba el medio (video, foto, documento, enlace o
// texto) y abajo el título con la obra.
export function FanItemCard({ it, obra }: { it: FanItemVista; obra?: string }) {
  const pie = (
    <div className="flex flex-col gap-1 px-5 py-4">
      <strong className="leading-snug">{it.titulo}</strong>
      <span className="text-[12px] text-texto-3">{[obra, it.tipo === "enlace" && it.url ? dominio(it.url) : null].filter(Boolean).join(" · ")}</span>
      {it.descripcion && it.tipo !== "texto" && <p className="mt-1 line-clamp-3 whitespace-pre-line text-[13px] text-texto-2">{it.descripcion}</p>}
    </div>
  );
  const caja = "tarjeta flex h-full flex-col border-oro/20";
  if (it.tipo === "video" && it.youtube_id) {
    return (
      <article className={caja}>
        <div className="relative aspect-video overflow-hidden bg-black"><Chip c={it.categoria} /><VideoLite id={it.youtube_id} title={it.titulo} /></div>
        {pie}
      </article>
    );
  }
  if (it.tipo === "foto" && it.archivo_url) {
    return (
      <article className={caja}>
        <a href={it.archivo_url} target="_blank" rel="noreferrer" className="group relative block aspect-video overflow-hidden">
          <Chip c={it.categoria} />
          <img src={it.archivo_url} alt={it.titulo} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
        </a>
        {pie}
      </article>
    );
  }
  if (it.tipo === "texto") {
    return (
      <article className={`${caja} gap-3 p-5`}>
        <span className="text-[10.5px] font-bold uppercase tracking-[0.24em] text-oro">{ETIQUETA[it.categoria]}</span>
        <h3 className="text-lg font-extrabold">{it.titulo}</h3>
        <p className="whitespace-pre-line text-sm leading-relaxed text-texto-2">{it.descripcion}</p>
        {obra && <span className="mt-auto text-[12px] text-texto-3">{obra}</span>}
      </article>
    );
  }
  const href = it.tipo === "documento" ? it.archivo_url : it.url;
  return (
    <a href={href ?? "#"} target="_blank" rel="noreferrer" className={`${caja} tarjeta-hover`}>
      <div className="relative grid aspect-video place-items-center bg-[radial-gradient(70%_60%_at_50%_40%,rgb(215_187_95/0.18),transparent_70%),#120f17]">
        <Chip c={it.categoria} />
        <span aria-hidden="true" className="text-4xl text-oro"><Icono nombre={it.tipo === "documento" ? "documento" : "externo"} /></span>
        <span className="absolute bottom-3 right-3 text-[11px] font-bold text-oro-claro">{it.tipo === "documento" ? "Abrir PDF" : "Ir al enlace"} <Icono nombre="externo" /></span>
      </div>
      {pie}
    </a>
  );
}

/** Contenido que todavía no se desbloquea: candado y fecha. */
export function FanProximoCard({ p, obra }: { p: FanProximo; obra?: string }) {
  return (
    <article className="tarjeta flex h-full flex-col border-oro/20" aria-label={`${p.titulo}: se desbloquea el ${fecha(p.disponible_desde)}`}>
      <div className="grid aspect-video place-items-center bg-[linear-gradient(160deg,#1a1622,#0b0910)]">
        <div className="flex flex-col items-center gap-2 text-center">
          <span aria-hidden="true" className="text-2xl text-oro"><Icono nombre="candado" /></span>
          <span className="text-[10.5px] font-bold uppercase tracking-[0.24em] text-oro">Se desbloquea el {fecha(p.disponible_desde)}</span>
        </div>
      </div>
      <div className="flex flex-col gap-1 px-5 py-4">
        <strong className="leading-snug">{p.titulo}</strong>
        <span className="text-[12px] text-texto-3">{[obra, FAN_CATEGORIAS[p.categoria]].filter(Boolean).join(" · ")} · Solo Club Fan</span>
      </div>
    </article>
  );
}
