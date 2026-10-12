/* eslint-disable @next/next/no-img-element -- sello y monograma SVG del kit (línea Oro) */
import { numeroSocio } from "@/lib/fanzone-rules";
import type { Credencial as Datos } from "@/lib/fanzone";

// Credencial del Club Fan (imagen de referencia de Diego): nombre, número de socio, año y
// "Fan fundador" para los socios #1 a #100. Todo en la línea Oro del kit.
export function Credencial({ nombre, c }: { nombre: string; c: Datos }) {
  const desde = new Intl.DateTimeFormat("es-MX", { year: "numeric", timeZone: "America/Mexico_City" }).format(new Date(c.desde));
  return (
    <div
      role="group"
      aria-label={`Credencial del Club Fan de ${nombre}, miembro ${numeroSocio(c.numero)}`}
      className="relative isolate aspect-[1.6/1] w-full max-w-[400px] overflow-hidden rounded-[22px] border border-oro/45 p-6 shadow-[0_0_70px_-20px_rgb(215_187_95/0.55)]"
      style={{ background: "radial-gradient(90% 120% at 100% 0%, rgb(215 187 95 / 0.18), transparent 55%), linear-gradient(160deg, #1a1622, #0b0910)" }}
    >
      <img src="/marca/sello-club.svg" alt="" aria-hidden="true" className="absolute -right-14 -top-14 -z-10 w-[48%] opacity-50" />
      <div className="flex h-full flex-col justify-between">
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-oro">Club Fan DARF</p>
        <div className="flex flex-col gap-1.5">
          <p className="max-w-[70%] text-lg font-black uppercase leading-tight tracking-[-0.01em] text-texto sm:text-xl">{nombre}</p>
          <p className="text-[12px] text-texto-3">
            Miembro <b className="num text-oro-claro">{numeroSocio(c.numero)}</b>
            <span className="mx-2">·</span>
            Desde <b className="num text-oro-claro">{desde}</b>
          </p>
        </div>
        <div className="flex items-end justify-between">
          {c.fundador ? <span className="chip chip-fz min-h-[26px] px-3 text-[10px] uppercase tracking-[0.14em]">Fan fundador</span> : <span />}
          <img src="/marca/darf-monograma-oro.svg" alt="" aria-hidden="true" className="h-9 w-auto" />
        </div>
      </div>
    </div>
  );
}
