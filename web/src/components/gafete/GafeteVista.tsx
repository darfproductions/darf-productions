/* eslint-disable @next/next/no-img-element -- monograma SVG del kit, foto firmada y QR (data URL) */
import { FRANJAS, iniciales, type Franja } from "@/lib/gafete-rules";

// Gafete digital (referencia del kit "uso-gafete-staff"): ranura, monograma DARF, foto redonda,
// nombre, papel en oro, QR con código corto, temporada y franja de color abajo.
export function GafeteVista({ nombre, fotoUrl, franja, papel, obra, temporada, qr, codigo }: {
  nombre: string; fotoUrl: string | null; franja: Franja; papel: string; obra: string | null; temporada: string | null; qr?: string; codigo?: string;
}) {
  const f = FRANJAS[franja];
  return (
    <article aria-label={`Gafete de ${nombre}`} className="relative flex w-[min(340px,86vw)] flex-col items-center overflow-hidden rounded-[26px] border border-linea-2 bg-sala text-texto shadow-[0_40px_100px_-30px_rgb(0_0_0/0.9)]">
      <span aria-hidden="true" className="mt-4 h-[22px] w-[96px] rounded-full bg-telon-2" />
      <img src="/marca/darf-monograma.svg" alt="DARF" className="mt-4 h-14 w-auto" />
      <div className="mt-4 h-[104px] w-[104px] overflow-hidden rounded-full bg-[linear-gradient(160deg,#2a2236,#141019)] ring-1 ring-white/10">
        {fotoUrl ? <img src={fotoUrl} alt="" className="h-full w-full object-cover" /> : <span className="grid h-full w-full place-items-center text-3xl font-black text-texto-3">{iniciales(nombre)}</span>}
      </div>
      <p className="mt-4 px-6 text-center text-[22px] font-black uppercase leading-[1.05] tracking-[-0.01em]">{nombre}</p>
      <p className="mt-2 px-6 text-center text-[11px] font-bold uppercase tracking-[0.28em] text-oro">{papel}</p>
      {qr && (
        <div className="mt-4 flex flex-col items-center gap-1.5">
          <div className="rounded-[16px] bg-white p-2.5">
            <img src={qr} alt={`Código QR del gafete de ${nombre}`} className="h-[148px] w-[148px] [image-rendering:pixelated]" />
          </div>
          {codigo && <span className="font-mono text-[13px] font-bold tracking-[0.2em] text-texto-2">{codigo}</span>}
        </div>
      )}
      <p className="mt-2 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-texto-3">{[obra, temporada ? `Temporada ${temporada}` : null].filter(Boolean).join(" · ") || "DARF Productions"}</p>
      <div className="mt-4 w-full py-3 text-center text-[22px] font-black italic tracking-[0.08em]" style={{ background: f.fondo, color: f.texto }}>{f.label}</div>
    </article>
  );
}
