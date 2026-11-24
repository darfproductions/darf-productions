import type { Criterio } from "@/lib/audition-rules";
import { nombreRonda, promedioDe, promedioGeneral, resumenOpciones, type Evaluacion } from "@/lib/evaluaciones-rules";

const uno = (n: number | null) => (n === null ? "—" : Number.isInteger(n) ? String(n) : n.toFixed(1));

// Lo que cada juez puso de una persona (0166), por ronda: calificaciones, opciones de personaje y notas.
// Se usa en la votación (al tocar a alguien) y en el expediente. `imprimir` lo deja legible en papel.
export function LoQuePusieron({ rondas, criterios, imprimir = false }: { rondas: { ronda: number; jueces: Evaluacion[] }[]; criterios: Criterio[]; imprimir?: boolean }) {
  if (rondas.length === 0) return <p className="text-sm text-texto-3 print:text-black/60">Ningún juez la calificó ni la marcó.</p>;
  const borde = imprimir ? "border-black/20" : "border-white/10";
  return (
    <div className="flex flex-col gap-3">
      {rondas.map(({ ronda, jueces }) => {
        const prom = promedioGeneral(jueces);
        const ops = resumenOpciones(jueces);
        return (
          <div key={ronda} className="flex flex-col gap-1.5">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-texto-3 print:text-black/60">
              {nombreRonda(ronda)}{prom !== null ? ` · promedio ${uno(prom)}` : ""}{ops ? ` · ${ops}` : ""}
            </p>
            <div className="overflow-x-auto print:overflow-visible">
              <table className="w-full border-collapse text-xs">
                <thead className="text-left text-texto-3 print:text-black/60">
                  <tr>
                    <th className={`border-b ${borde} px-2 py-1 font-bold`}>Juez</th>
                    {criterios.map((c) => <th key={c.k} className={`border-b ${borde} px-2 py-1 font-bold`}>{c.l}</th>)}
                    <th className={`border-b ${borde} px-2 py-1 font-bold`}>Prom.</th>
                    <th className={`border-b ${borde} px-2 py-1 font-bold`}>Opciones</th>
                    <th className={`border-b ${borde} px-2 py-1 font-bold`}>Notas</th>
                  </tr>
                </thead>
                <tbody>
                  {jueces.map((e) => (
                    <tr key={e.juez} className="align-top">
                      <td className={`border-b ${borde} px-2 py-1 font-semibold`}>{e.juez}</td>
                      {criterios.map((c) => <td key={c.k} className={`border-b ${borde} px-2 py-1`}>{e.puntos?.[c.k] ?? "—"}</td>)}
                      <td className={`border-b ${borde} px-2 py-1 font-bold`}>{uno(promedioDe(e.puntos))}</td>
                      <td className={`border-b ${borde} px-2 py-1`}>{e.opciones?.length ? e.opciones.map((o, i) => `${i + 1}. ${o}`).join(" · ") : "—"}</td>
                      <td className={`border-b ${borde} px-2 py-1 [overflow-wrap:anywhere]`}>{e.notas ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
