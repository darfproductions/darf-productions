import type { Expediente } from "@/lib/evaluaciones-rules";

// Piezas del expediente y del PDF de la votación (0166), pensadas para imprimir o guardar como PDF.

export const fechaMx = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "long", year: "numeric" }) : "";
const hoyMx = () => new Date().toLocaleString("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" });

export const celda = "border-b border-white/10 px-2 py-1.5 text-left align-top print:border-black/20";
export const th = `${celda} text-xs font-bold uppercase tracking-[0.1em] text-texto-3 print:text-black/60`;

export function Seccion({ titulo, children, salto = false }: { titulo: string; children: React.ReactNode; salto?: boolean }) {
  return (
    <section className={`flex flex-col gap-3 ${salto ? "print:break-before-page" : ""}`}>
      <h2 className="titular border-b border-white/15 pb-1 text-xl print:border-black/30 print:text-lg">{titulo}</h2>
      {children}
    </section>
  );
}

export function Encabezado({ e, que }: { e: Expediente; que: string }) {
  return (
    <header className="flex flex-col gap-1">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-texto-3 print:text-black/60">DARF Productions · {que}</p>
      <h1 className="titular text-3xl print:text-2xl">{e.obra ? `${e.obra} · ` : ""}{e.titulo}</h1>
      <p className="text-sm text-texto-2 print:text-black/70">Generado el {hoyMx()}</p>
    </header>
  );
}

/** Por personaje: los totales y qué votó cada juez. */
export function Votos({ votacion }: { votacion: NonNullable<Expediente["votacion"]> }) {
  if (votacion.length === 0) return <p className="text-sm text-texto-3">No hubo personajes en la votación.</p>;
  return (
    <div className="flex flex-col gap-5">
      {votacion.map((v) => (
        <div key={v.personaje} className="flex flex-col gap-2 print:break-inside-avoid">
          <h3 className="text-lg font-bold">{v.personaje}</h3>
          <div className="grid gap-4 md:grid-cols-2 print:grid-cols-2">
            <table className="w-full border-collapse text-sm print:text-xs">
              <thead><tr><th className={th}>Aspirante</th><th className={th}>Votos</th></tr></thead>
              <tbody>
                {v.totales.map((t, i) => (
                  <tr key={i}><td className={`${celda} ${i === 0 ? "font-bold" : ""}`}>{t.numero ? `Nº ${t.numero} · ` : ""}{t.nombre}</td><td className={celda}>{t.votos}</td></tr>
                ))}
                {v.abstenciones > 0 && <tr><td className={`${celda} italic`}>Abstenciones</td><td className={celda}>{v.abstenciones}</td></tr>}
                {v.totales.length === 0 && v.abstenciones === 0 && <tr><td className={celda} colSpan={2}>Nadie votó en este personaje.</td></tr>}
              </tbody>
            </table>
            <table className="w-full border-collapse text-sm print:text-xs">
              <thead><tr><th className={th}>Juez</th><th className={th}>Votó por</th></tr></thead>
              <tbody>
                {v.por_juez.map((j, i) => <tr key={i}><td className={celda}>{j.juez}</td><td className={celda}>{j.voto ?? <i>Se abstuvo</i>}</td></tr>)}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
