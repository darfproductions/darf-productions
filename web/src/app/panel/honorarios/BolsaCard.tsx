import { ActionForm } from "@/components/panel/ActionForm";
import { Card, input } from "@/components/panel/ui";
import type { HonAsignacion } from "@/lib/honorarios";
import { vigentesEn } from "@/lib/honorarios";
import { guardarAsignacion } from "./actions";

const fecha = (d: string) => d.split("-").reverse().join("/");
const pct = (n: number) => `${Number(n.toFixed(4)).toLocaleString("es-MX", { maximumFractionDigits: 4 })} %`;
const chico = "rounded-full border border-white/25 px-3 py-1 text-xs font-bold hover:border-white/50";

/** La lista de nombres para escoger persona (una sola vez por página). */
export function ListaPersonas({ nombres }: { nombres: string[] }) {
  return <datalist id="hon-personas">{nombres.map((n, i) => <option key={i} value={n} />)}</datalist>;
}

// Una bolsa (creativa de una obra o compartida): quién cobra de ella y con qué %, cambiar, quitar, agregar e historial.
// Debe sumar 100 % (si no, el mes no se puede calcular). Cambiar un % aplica desde una fecha.
export function BolsaCard({ clave, nombre, ayuda, asignaciones, hoy }: { clave: string; nombre: string; ayuda?: string; asignaciones: HonAsignacion[]; hoy: string }) {
  const filas = vigentesEn(asignaciones, hoy).filter((a) => a.bolsa === clave).sort((x, y) => y.pct - x.pct);
  const suma = filas.reduce((s, a) => s + a.pct, 0);
  const ok = Math.abs(suma - 100) < 0.005;
  const pasadas = asignaciones.filter((a) => a.bolsa === clave && a.hasta && a.hasta <= hoy);
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="titular text-xl">{nombre}</h2>
          {ayuda && <p className="text-sm text-texto-3">{ayuda}</p>}
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-bold ${ok ? "bg-[#14532d] text-[#bbf7d0]" : "bg-[#5a1a22] text-[#fecdd3]"}`}>Suma {pct(suma)}{ok ? "" : " · debe ser 100 %"}</span>
      </div>
      {filas.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-[0.1em] text-texto-3"><th className="py-2">Persona</th><th>Puesto</th><th className="text-right">%</th><th>Desde</th><th></th></tr></thead>
            <tbody>
              {filas.map((a) => (
                <tr key={a.id} className="border-t border-white/10 align-top">
                  <td className="py-2 font-semibold">{a.nombre}</td>
                  <td className="py-2 text-texto-2">{a.puesto ?? "—"}</td>
                  <td className="py-2 text-right font-bold">{pct(a.pct)}</td>
                  <td className="py-2 text-texto-3">{fecha(a.desde)}</td>
                  <td className="py-2">
                    <details>
                      <summary className={`${chico} cursor-pointer list-none`}>Cambiar</summary>
                      <div className="mt-2 flex flex-col gap-2">
                        <ActionForm action={guardarAsignacion} hidden={{ bolsa: clave, person_id: a.person_id }} submit="Guardar" submitClass={chico}>
                          <div className="flex flex-wrap gap-2">
                            <input className={`${input} w-24 py-1.5`} type="number" step="0.0001" min={0.0001} max={100} name="pct" defaultValue={a.pct} aria-label="Nuevo %" required />
                            <input className={`${input} py-1.5`} name="puesto" defaultValue={a.puesto ?? ""} placeholder="Puesto" aria-label="Puesto" />
                            <input className={`${input} py-1.5`} type="date" name="desde" defaultValue={hoy} aria-label="Desde" required />
                          </div>
                        </ActionForm>
                        <ActionForm action={guardarAsignacion} hidden={{ bolsa: clave, person_id: a.person_id, quitar: "1" }} confirm={`¿Quitar a ${a.nombre} de esta bolsa desde la fecha elegida?`} submit="Quitar de la bolsa" submitClass={chico}>
                          <input className={`${input} py-1.5`} type="date" name="desde" defaultValue={hoy} aria-label="Desde cuándo" required />
                        </ActionForm>
                      </div>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <details>
        <summary className="cursor-pointer text-sm font-bold text-violeta-claro">+ Agregar persona</summary>
        <ActionForm action={guardarAsignacion} hidden={{ bolsa: clave }} submit="Agregar">
          <div className="grid gap-2 sm:grid-cols-4">
            <input className={input} name="persona" list="hon-personas" required placeholder="Nombre (como en su ficha)" aria-label="Persona" />
            <input className={input} name="puesto" placeholder="Puesto" aria-label="Puesto" />
            <input className={input} type="number" step="0.0001" min={0.0001} max={100} name="pct" required placeholder="%" aria-label="Porcentaje" />
            <input className={input} type="date" name="desde" defaultValue={hoy} required aria-label="Desde" />
          </div>
        </ActionForm>
      </details>
      {pasadas.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm text-texto-3">Historial ({pasadas.length})</summary>
          <ul className="mt-1 text-sm text-texto-3">{pasadas.map((a) => <li key={a.id}>{a.nombre} · {pct(a.pct)} · del {fecha(a.desde)} al {fecha(a.hasta!)}</li>)}</ul>
        </details>
      )}
    </Card>
  );
}
