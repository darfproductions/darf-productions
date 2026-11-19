import type { Metadata } from "next";
import { ActionForm } from "@/components/panel/ActionForm";
import { Card, PanelTitle, input } from "@/components/panel/ui";
import { isoMx } from "@/lib/dates";
import { COMPARTIDA, bolsaCreativa } from "@/lib/honorarios-rules";
import { bolsasDe, configEn, getHonorarios, vigentesEn } from "@/lib/honorarios";
import { requireCabeza } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { guardarAsignacion } from "../actions";

export const metadata: Metadata = { title: "Bolsas y porcentajes" };

const fecha = (d: string) => d.split("-").reverse().join("/");
const pct = (n: number) => `${Number(n.toFixed(4)).toLocaleString("es-MX", { maximumFractionDigits: 4 })} %`;
const chico = "rounded-full border border-white/25 px-3 py-1 text-xs font-bold hover:border-white/50";

// Honorarios · Bolsas (0149): quién cobra de cada bolsa y con qué %. Cada bolsa debe sumar 100 % (si no, no se calcula).
// Cambiar un % aplica desde una fecha y lo anterior queda en el historial.
export default async function Bolsas() {
  await requireCabeza("/panel/honorarios/bolsas");
  const { obras, asignaciones, casa, versiones } = await getHonorarios();
  const hoy = isoMx();
  const vig = vigentesEn(asignaciones, hoy);
  const bolsas = bolsasDe(obras);
  const cfg = configEn(versiones, hoy);
  const supabase = await createClient();
  const { data: gente } = await supabase.from("people").select("nombre").order("nombre").limit(3000);
  const cabezas = casa.filter((c) => c.cabeza), otros = casa.filter((c) => !c.cabeza);
  const mensuales = obras.filter((o) => o.mensual && o.activa);
  // Equivalencia al % del neto de cada obra (sección 6 del documento): creativo × su % creativo + compartido × su % compartido.
  const personasNeto = [...new Set(vig.filter((a) => a.bolsa === COMPARTIDA || mensuales.some((o) => a.bolsa === bolsaCreativa(o.production_id))).map((a) => a.person_id))];
  const enBolsa = (pid: string, bolsa: string) => vig.find((a) => a.person_id === pid && a.bolsa === bolsa)?.pct ?? 0;
  const nombreDe = (pid: string) => vig.find((a) => a.person_id === pid)?.nombre ?? "—";

  return (
    <div className="flex flex-col gap-6">
      <PanelTitle eyebrow="Honorarios · solo las cabezas de DARF" title="Bolsas y porcentajes">
        Quién cobra de cada bolsa y con qué porcentaje. Cada bolsa debe sumar exactamente 100 %; si no, el mes no se puede calcular. Una persona puede estar en varias bolsas y cobra de cada una.
      </PanelTitle>
      <datalist id="hon-personas">{((gente ?? []) as { nombre: string }[]).map((g, i) => <option key={i} value={g.nombre} />)}</datalist>

      {obras.length === 0 && <Card className="text-texto-2">Primero agrega las obras en Configuración.</Card>}
      {bolsas.map((b) => {
        const filas = vig.filter((a) => a.bolsa === b.clave).sort((x, y) => y.pct - x.pct);
        const suma = filas.reduce((s, a) => s + a.pct, 0);
        const ok = Math.abs(suma - 100) < 0.005;
        const pasadas = asignaciones.filter((a) => a.bolsa === b.clave && a.hasta && a.hasta <= hoy);
        return (
          <Card key={b.clave} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 className="titular text-xl">{b.nombre}</h2>
                <p className="text-sm text-texto-3">{b.ayuda}</p>
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
                              <ActionForm action={guardarAsignacion} hidden={{ bolsa: b.clave, person_id: a.person_id }} submit="Guardar" submitClass={chico}>
                                <div className="flex flex-wrap gap-2">
                                  <input className={`${input} w-24 py-1.5`} type="number" step="0.0001" min={0.0001} max={100} name="pct" defaultValue={a.pct} aria-label="Nuevo %" required />
                                  <input className={`${input} py-1.5`} name="puesto" defaultValue={a.puesto ?? ""} placeholder="Puesto" aria-label="Puesto" />
                                  <input className={`${input} py-1.5`} type="date" name="desde" defaultValue={hoy} aria-label="Desde" required />
                                </div>
                              </ActionForm>
                              <ActionForm action={guardarAsignacion} hidden={{ bolsa: b.clave, person_id: a.person_id, quitar: "1" }} confirm={`¿Quitar a ${a.nombre} de esta bolsa desde la fecha elegida?`} submit="Quitar de la bolsa" submitClass={chico}>
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
              <ActionForm action={guardarAsignacion} hidden={{ bolsa: b.clave }} submit="Agregar">
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
      })}

      <Card className="flex flex-col gap-3">
        <h2 className="titular text-xl">Casa DARF (al cierre de temporada)</h2>
        <p className="text-sm text-texto-2">
          Sale de quién está en Casa DARF ese día: {cfg ? `${cfg.casa_cabezas_pct} % del reparto de Casa DARF` : "la parte de las cabezas"} en partes iguales entre las cabezas y el resto en partes iguales entre los demás integrantes. Quién es cabeza se marca en Ajustes, Casa DARF.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><p className="text-sm font-bold">Cabezas ({cabezas.length})</p><ul className="text-sm text-texto-2">{cabezas.map((c) => <li key={c.user_id}>{c.nombre}{!c.person_id && <span className="text-aviso"> · sin ficha de persona</span>}</li>)}</ul></div>
          <div><p className="text-sm font-bold">Demás integrantes ({otros.length})</p><ul className="text-sm text-texto-2">{otros.map((c) => <li key={c.user_id}>{c.nombre}{!c.person_id && <span className="text-aviso"> · sin ficha de persona</span>}</li>)}</ul></div>
        </div>
      </Card>

      {mensuales.length > 0 && personasNeto.length > 0 && cfg && (
        <Card className="flex flex-col gap-3">
          <h2 className="titular text-xl">Para validar: % del neto de cada obra</h2>
          <p className="text-sm text-texto-2">Lo que le toca a cada quien del neto mensual de cada obra cuando no se aplica el fondo común ({cfg.creativo_pct} % creativo + {100 - Number(cfg.creativo_pct)} % compartido). Debe coincidir con la tabla del documento.</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead><tr className="text-left text-xs uppercase tracking-[0.1em] text-texto-3"><th className="py-2">Persona</th>{mensuales.map((o) => <th key={o.production_id} className="text-right">{o.nombre}</th>)}</tr></thead>
              <tbody>
                {personasNeto.map((p) => (
                  <tr key={p} className="border-t border-white/10">
                    <td className="py-1.5">{nombreDe(p)}</td>
                    {mensuales.map((o) => {
                      const v = (Number(cfg.creativo_pct) * enBolsa(p, bolsaCreativa(o.production_id)) + (100 - Number(cfg.creativo_pct)) * enBolsa(p, COMPARTIDA)) / 100;
                      return <td key={o.production_id} className="py-1.5 text-right">{v ? `${v.toFixed(2)} %` : "—"}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
