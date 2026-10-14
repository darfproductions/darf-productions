import Link from "next/link";
import { partesFuncion } from "@/lib/disponibilidad";
import { ACCESO_EVENTO, TIPOS_EVENTO, precioTexto } from "@/lib/eventos-rules";
import type { EventoCartelera } from "@/lib/fanzone";
import { Icono } from "@/components/Icono";

// Evento que la persona todavía no puede abrir (del Club Fan o con cuenta), con candado y la
// invitación: entrar o unirse al club (0082). Sin liga ni lugares.
export function EventoBloqueado({ e, sesion, mostrarObra = true }: { e: EventoCartelera; sesion: boolean; mostrarObra?: boolean }) {
  const f = partesFuncion(e.starts_at);
  const cta = !sesion ? { href: "/entrar?next=/eventos", label: "Entra para ver más" } : { href: "/fan-zone", label: "Únete al Club Fan" };
  return (
    <li id={`e-${e.id}`} className="flex flex-col gap-3 rounded-[18px] border border-oro/25 bg-sala/40 p-4">
      <div className="flex items-center gap-4">
        <div className="grid justify-items-center border-r border-white/10 pr-4">
          <small className="text-[10px] font-bold uppercase tracking-[0.2em] text-oro">{f.dia}</small>
          <b className="num text-3xl font-black leading-none">{f.numero}</b>
          <small className="text-[10px] font-bold uppercase tracking-[0.2em] text-texto-3">{f.mes}</small>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-oro">
            {e.categoria || TIPOS_EVENTO[e.tipo].label}
            <span className="rounded-full border border-oro/40 px-2 py-0.5 text-[9px] tracking-[0.12em] text-oro-claro"><Icono nombre="candado" /> {ACCESO_EVENTO[e.acceso].corto}</span>
          </span>
          <strong className="truncate">{e.titulo}</strong>
          <span className="text-[12.5px] text-texto-3">{f.hora}{e.tipo === "en_linea" ? " · En línea" : e.lugar ? ` · ${e.lugar}` : ""}{mostrarObra && e.obra ? ` · ${e.obra}` : ""}</span>
          {e.precio != null && <span className="text-[12.5px] font-bold">{precioTexto(e)}</span>}
        </div>
      </div>
      <Link href={cta.href} className="fb fb-fz fb-sm self-start">{cta.label}</Link>
    </li>
  );
}
