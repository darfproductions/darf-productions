import Link from "next/link";
import { partesFuncion } from "@/lib/disponibilidad";
import { ACCESO_EVENTO, TIPOS_EVENTO, precioTexto } from "@/lib/eventos-rules";
import type { EventoCartelera } from "@/lib/fanzone";
import { Icono } from "@/components/Icono";

const club = (e: EventoCartelera) => e.acceso === "club";
const donde = (e: EventoCartelera) => (e.tipo === "en_linea" ? "En línea" : e.lugar);

function Chips({ e }: { e: EventoCartelera }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em]">
      <span className={club(e) ? "text-oro" : "text-lila"}>{e.categoria || TIPOS_EVENTO[e.tipo].label}</span>
      {e.en_vivo && <span className="rounded-full bg-[#d20122] px-2 py-0.5 tracking-[0.12em] text-white">En vivo</span>}
      <span className={`rounded-full border px-2 py-0.5 tracking-[0.12em] ${club(e) ? "border-oro/50 text-oro-claro" : "border-white/25 text-texto-2"}`}>{ACCESO_EVENTO[e.acceso].corto}</span>
      {e.precio != null && <span className="rounded-full border border-white/25 px-2 py-0.5 tracking-[0.12em] text-texto">{precioTexto(e)}</span>}
    </span>
  );
}

// Portada (0082): próximos eventos debajo de Producciones. El más cercano va destacado; los del
// Club Fan se ven aunque no seas socio (invitan a unirse); los detalles y la liga, en /eventos.
export function EventosInicio({ eventos }: { eventos: EventoCartelera[] }) {
  const [destacado, ...resto] = eventos;
  return (
    <section id="eventos" aria-labelledby="eventos-t" className="relative mx-auto flex max-w-[1440px] scroll-mt-6 flex-col gap-8 px-5 pb-20 md:px-16 md:pb-28">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-3">
          <p className="eyebrow">Vívelo de cerca</p>
          <h2 id="eventos-t" className="h2-seccion">Próximos eventos</h2>
        </div>
        <Link href="/eventos" className="text-sm font-bold text-texto-2 underline-offset-4 hover:text-white hover:underline">Ver todos los eventos <Icono nombre="flecha-der" /></Link>
      </div>
      {!destacado ? (
        <div className="tarjeta flex flex-col items-start gap-3 p-6 text-texto-2 md:flex-row md:items-center md:justify-between">
          <p>Pronto anunciaremos fotos con el elenco, tours por backstage y transmisiones exclusivas.</p>
          <Link href="/fan-zone" className="fb fb-fz fb-sm shrink-0">Únete al Club Fan para enterarte primero</Link>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          {(() => {
            const f = partesFuncion(destacado.starts_at);
            return (
              <Link
                href={`/eventos#e-${destacado.id}`}
                className={`tarjeta-hover group relative flex min-h-[320px] flex-col justify-end gap-5 overflow-hidden rounded-[28px] border p-7 md:p-10 ${club(destacado) ? "border-oro/40 bg-[#08070c] shadow-[0_0_80px_-30px_rgb(215_187_95/0.45)]" : "border-linea-2 bg-telon"}`}
              >
                <div aria-hidden="true" className={`absolute -top-40 left-1/3 h-[700px] w-[600px] ${club(destacado) ? "cono-oro" : "haz opacity-60"}`} />
                <div className="relative flex items-end gap-5">
                  <div className="grid justify-items-center rounded-2xl border border-white/10 bg-sala/70 px-4 py-3">
                    <small className={`text-[11px] font-bold uppercase tracking-[0.2em] ${club(destacado) ? "text-oro" : "text-lila"}`}>{f.dia}</small>
                    <b className="num text-5xl font-black leading-none">{f.numero}</b>
                    <small className="text-[11px] font-bold uppercase tracking-[0.2em] text-texto-3">{f.mes}</small>
                  </div>
                  <div className="flex min-w-0 flex-col gap-2">
                    <Chips e={destacado} />
                    <h3 className="text-[clamp(1.6rem,3vw,2.4rem)] font-black uppercase leading-[0.95] tracking-[-0.02em]">{destacado.titulo}</h3>
                    <p className="text-sm text-texto-2">{f.hora}{donde(destacado) ? ` · ${donde(destacado)}` : ""}{destacado.obra ? ` · ${destacado.obra}` : ""}</p>
                  </div>
                </div>
                <span className={`relative fb self-start ${club(destacado) ? "fb-fz" : "fb-luz"}`}>{club(destacado) ? "Exclusivo Club Fan · Ver evento" : "Ver evento"}</span>
              </Link>
            );
          })()}
          <ul className="flex flex-col gap-3">
            {resto.slice(0, 3).map((e) => {
              const f = partesFuncion(e.starts_at);
              return (
                <li key={e.id}>
                  <Link href={`/eventos#e-${e.id}`} className="tarjeta-hover flex items-center gap-4 rounded-[20px] border border-linea bg-telon/60 p-4">
                    <div className="grid w-14 shrink-0 justify-items-center border-r border-white/10 pr-4">
                      <small className={`text-[10px] font-bold uppercase tracking-[0.2em] ${club(e) ? "text-oro" : "text-lila"}`}>{f.dia}</small>
                      <b className="num text-2xl font-black leading-none">{f.numero}</b>
                      <small className="text-[10px] font-bold uppercase tracking-[0.2em] text-texto-3">{f.mes}</small>
                    </div>
                    <div className="flex min-w-0 flex-col gap-1">
                      <Chips e={e} />
                      <strong className="truncate">{e.titulo}</strong>
                      <span className="truncate text-[12.5px] text-texto-3">{f.hora}{donde(e) ? ` · ${donde(e)}` : ""}{e.obra ? ` · ${e.obra}` : ""}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
            {resto.length === 0 && (
              <li className="tarjeta flex flex-col gap-2 p-5 text-sm text-texto-2">
                <p>Los socios del Club Fan se enteran primero de cada evento y apartan su lugar antes.</p>
                <Link href="/fan-zone" className="font-bold text-oro-claro underline">Únete gratis <Icono nombre="flecha-der" /></Link>
              </li>
            )}
            {resto.length > 3 && <li><Link href="/eventos" className="text-sm font-bold text-texto-2 hover:text-white">Y {resto.length - 3} más <Icono nombre="flecha-der" /></Link></li>}
          </ul>
        </div>
      )}
    </section>
  );
}
