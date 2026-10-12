import type { BoletoVista, EstiloBoleto } from "@/lib/ticket-design";
import { contador, logoDarf } from "@/lib/ticket-design";

// Boleto diseñado con el logo y los colores de la obra (Bloque 4). Mismo dibujo que el PDF.
export function TicketCard({ b, estilo, i, total }: { b: BoletoVista; estilo: EstiloBoleto; i: number; total: number }) {
  return (
    <article
      aria-label={`${contador(i, total)}: ${b.asiento}`}
      className="mx-auto flex w-full max-w-[360px] flex-col overflow-hidden rounded-3xl shadow-2xl"
      style={{ background: estilo.fondo, color: estilo.texto }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- logo SVG del kit de marca */}
      <img src={logoDarf(estilo.fondo)} alt="DARF Productions" className="mx-auto mt-5 h-7 w-auto" />
      <div className="flex h-32 items-center justify-center px-6 pt-3">
        {estilo.logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- logo de la obra (puede venir de Storage)
          <img src={estilo.logo} alt={b.obra} className="max-h-full max-w-full object-contain" />
        ) : (
          <p className="text-center text-3xl font-black leading-tight">{b.obra}</p>
        )}
      </div>
      <div className="px-6 pb-4 pt-2 text-center">
        <p className="font-bold first-letter:uppercase">{b.funcion}</p>
        {b.lugar && <p className="text-sm opacity-80">{b.lugar}</p>}
      </div>
      <div className="relative mx-0 my-1 h-0 border-t-2 border-dashed" style={{ borderColor: estilo.acento }}>
        <span className="absolute -left-3 -top-3 h-6 w-6 rounded-full bg-sala" />
        <span className="absolute -right-3 -top-3 h-6 w-6 rounded-full bg-sala" />
      </div>
      <dl className="grid grid-cols-2 gap-3 px-6 py-4 text-sm">
        <div className="col-span-2">
          <dt className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: estilo.acento }}>Asiento</dt>
          <dd className="text-3xl font-black">{b.asiento}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: estilo.acento }}>Orden</dt>
          <dd className="font-bold">{b.orden}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: estilo.acento }}>Nombre</dt>
          <dd className="truncate font-bold">{b.comprador}</dd>
        </div>
      </dl>
      <div className="px-6 pb-4">
        <div className="relative mx-auto aspect-square w-full max-w-[280px] rounded-2xl bg-white p-3">
          {b.qr ? (
            // eslint-disable-next-line @next/next/no-img-element -- QR generado (data URL)
            <img src={b.qr} alt={`Código QR del asiento ${b.asiento}`} className="h-full w-full [image-rendering:pixelated]" />
          ) : (
            <p className="flex h-full items-center justify-center text-center text-sm text-[#555]">Función pasada</p>
          )}
          {b.usado && (
            <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 -rotate-12 bg-[#8a1c2c] py-2 text-center text-lg font-black uppercase text-white">Ya utilizado</span>
          )}
        </div>
      </div>
      <p className="px-6 pb-5 text-center text-xs opacity-75">{contador(i, total)} · Presenta este código en la entrada. Vale una sola vez.</p>
    </article>
  );
}
