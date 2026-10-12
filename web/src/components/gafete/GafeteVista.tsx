/* eslint-disable @next/next/no-img-element -- logos SVG del kit, foto firmada y QR (data URL) */
import { iniciales, type PaseVista } from "@/lib/gafete-rules";

// Gafete digital (referencia del kit "uso-gafete-staff"): ranura, logo, foto redonda, nombre,
// título en oro, QR con código corto, pie y banda de color. Sirve para el gafete del equipo
// (tema DARF) y para la credencial del Club Fan (tema dorado, 0080).
export function GafeteVista({ p }: { p: PaseVista }) {
  const fan = p.tema === "fan";
  return (
    <article
      aria-label={fan ? `Credencial Club Fan de ${p.nombre}` : `Gafete de ${p.nombre}`}
      className={`relative flex w-[min(340px,86vw)] shrink-0 flex-col items-center overflow-hidden rounded-[26px] border text-texto shadow-[0_40px_100px_-30px_rgb(0_0_0/0.9)] ${fan ? "border-oro/50 bg-[radial-gradient(120%_70%_at_50%_0%,rgb(215_187_95/0.28),transparent_60%),linear-gradient(170deg,#1a1622,#0b0910)] shadow-[0_30px_90px_-30px_rgb(215_187_95/0.45)]" : "border-linea-2 bg-sala"}`}
    >
      <span aria-hidden="true" className={`mt-4 h-[22px] w-[96px] rounded-full ${fan ? "bg-[#2a2216]" : "bg-telon-2"}`} />
      <img src={p.logo} alt={p.logoAlt} className={`mt-4 w-auto ${fan ? "h-10 max-w-[230px]" : "h-14"}`} />
      <div className={`mt-4 h-[104px] w-[104px] shrink-0 overflow-hidden rounded-full bg-[linear-gradient(160deg,#2a2236,#141019)] ring-1 ${fan ? "ring-2 ring-oro/70" : "ring-white/10"}`}>
        {p.fotoUrl ? <img src={p.fotoUrl} alt="" className="h-full w-full object-cover" /> : <span className={`grid h-full w-full place-items-center text-3xl font-black ${fan ? "text-oro-claro" : "text-texto-3"}`}>{iniciales(p.nombre)}</span>}
      </div>
      <p className="mt-4 px-6 text-center text-[22px] font-black uppercase leading-[1.05] tracking-[-0.01em]">{p.nombre}</p>
      <p className="mt-2 px-6 text-center text-[11px] font-bold uppercase tracking-[0.28em] text-oro">{p.titulo}</p>
      {p.qr && (
        <div className="mt-4 flex flex-col items-center gap-1.5">
          <div className="rounded-[16px] bg-white p-2.5">
            <img src={p.qr} alt={`Código QR de ${p.nombre}`} className="h-[148px] w-[148px] [image-rendering:pixelated]" />
          </div>
          {p.codigo && <span className={`font-mono text-[13px] font-bold tracking-[0.2em] ${fan ? "text-oro-claro" : "text-texto-2"}`}>{p.codigo}</span>}
        </div>
      )}
      <p className="mt-2 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-texto-3">{p.pie}</p>
      <div className="mt-4 flex w-full items-center justify-center gap-3 py-3 text-center text-[22px] font-black italic tracking-[0.08em]" style={{ background: p.banda.fondo, color: p.banda.texto }}>
        {fan && <img src="/marca/sello-club.svg" alt="" className="h-7 w-7" />}
        {p.banda.label}
      </div>
    </article>
  );
}
