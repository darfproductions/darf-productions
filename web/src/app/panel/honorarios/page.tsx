import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/panel/ActionForm";
import { Icono } from "@/components/Icono";
import { Card, PanelTitle, input } from "@/components/panel/ui";
import { isoMx } from "@/lib/dates";
import { configEn, getHonorarios, reglasEn, vigente, vigentesEn } from "@/lib/honorarios";
import { bolsaCreativa } from "@/lib/honorarios-rules";
import { requireCabeza } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { guardarConfig, guardarObra } from "./actions";

export const metadata: Metadata = { title: "Honorarios" };

const pesos = (n: number | null) => (n == null ? "—" : `$${Number(n).toLocaleString("es-MX")}`);
const fecha = (d: string) => d.split("-").reverse().join("/");
const mesTxt = (d: string) => new Date(`${d.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString("es-MX", { month: "short", year: "numeric", timeZone: "UTC" });

// Lo de toda la empresa (sección 2 del documento que no depende de cada obra).
const PARAMS: { k: string; label: string; unidad: "%" | "$" | ""; ayuda: string }[] = [
  { k: "recargo", label: "Recargo por pago tardío", unidad: "$", ayuda: "Por mensualidad pagada después del 2.º sábado. Va a la reserva." },
  { k: "redondeo", label: "Redondeo de pagos (hacia abajo)", unidad: "$", ayuda: "Lo que sobra va a la reserva." },
  { k: "umbral_alumnos", label: "Diferencia de alumnos para alerta", unidad: "", ayuda: "Entre las obras del fondo común. Solo avisa." },
  { k: "fondo_pct", label: "Fondo creativo común", unidad: "%", ayuda: "De cada bolsa creativa de las obras que participan." },
  { k: "casa_cabezas_pct", label: "Casa DARF: a las cabezas", unidad: "%", ayuda: "Al cierre; el resto, al resto de Casa DARF (partes iguales)." },
  { k: "reserva_meta", label: "Meta de la reserva", unidad: "$", ayuda: "Solo informativo." },
];

// Honorarios · Obras y reglas (0151): lo de toda la empresa y cada obra activa con lo que se hace con su dinero.
// Solo las cabezas (lo configura Pato).
export default async function HonorariosInicio() {
  await requireCabeza("/panel/honorarios");
  const h = await getHonorarios();
  const hoy = isoMx();
  const actual = configEn(h.versiones, hoy) ?? h.versiones.at(-1) ?? null;
  const supabase = await createClient();
  const { data: prods } = await supabase.from("productions").select("id, nombre, estado").neq("estado", "archivada").order("nombre");
  const fuera = ((prods ?? []) as { id: string; nombre: string }[]).filter((p) => !h.obras.some((o) => o.production_id === p.id));
  const v = (k: string) => (actual ? String((actual as unknown as Record<string, number>)[k]) : "");
  const vig = vigentesEn(h.asignaciones, hoy);

  return (
    <div className="flex flex-col gap-6">
      <PanelTitle eyebrow="Honorarios · solo las cabezas de DARF" title="Obras y reglas">
        Qué se hace con el dinero de cada obra y cómo se relacionan entre sí. Cada cambio aplica desde la fecha que elijas y lo anterior queda en el historial: los meses ya pagados no cambian.
      </PanelTitle>

      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="titular text-xl">Obras</h2>
          <Link href="/panel/honorarios/compartidos" className="text-sm font-bold text-violeta-claro">Bolsas y gastos compartidos <Icono nombre="flecha-der" /></Link>
        </div>
        {h.obras.length === 0 && <p className="text-sm text-texto-3">Todavía no hay obras en honorarios.</p>}
        <ul className="grid gap-3 md:grid-cols-2">
          {h.obras.map((o) => {
            const r = reglasEn(h.reglas, h.compartidas, o.production_id, hoy);
            const comp = h.compartidas.find((c) => c.id === r?.compartida);
            const gastos = h.gastos.filter((g) => vigente(g.versiones, hoy)?.obras.includes(o.production_id)).map((g) => g.nombre);
            const suma = vig.filter((a) => a.bolsa === bolsaCreativa(o.production_id)).reduce((s, a) => s + a.pct, 0);
            const bolsaOk = Math.abs(suma - 100) < 0.005;
            return (
              <li key={o.production_id}>
                <Link href={`/panel/honorarios/obras/${o.production_id}`} className={`flex h-full flex-col gap-1 rounded-xl border border-white/10 p-4 hover:border-white/30 ${o.activa ? "" : "opacity-60"}`}>
                  <span className="flex items-center justify-between gap-2"><b>{o.nombre}</b><Icono nombre="flecha-der" /></span>
                  <span className="text-xs text-texto-3">{o.mensual ? (o.cobra && o.cobroDesde ? `Mensualidad ${pesos(o.mensualidad)} de ${mesTxt(o.cobroDesde)} a ${o.cobroHasta ? mesTxt(o.cobroHasta) : "sin fin"} · y cierre` : "Con mensualidad (todavía no cobra) · y cierre") : "Solo al cierre de temporada"}{o.activa ? "" : " · cerrada"}</span>
                  {r ? (
                    <span className="text-sm text-texto-2">
                      {o.mensual ? `Reserva ${r.reservaPct} % · emergencia ${r.emergenciaPct} % · creativo ${r.creativoPct} % · compartido ${r.compartidaPct} %${r.enFondo ? " · fondo común" : ""}` : ""}
                      {o.mensual && <br />}Cierre {r.fila.cierre_empresa_pct}/{r.fila.cierre_creativos_pct}/{r.fila.cierre_compartida_pct}/{r.fila.cierre_casa_pct} (empresa/creativos/compartida/Casa DARF)
                    </span>
                  ) : <span className="text-sm text-aviso">Sin reglas: entra para configurarla.</span>}
                  {o.mensual && <span className="text-xs text-texto-3">{comp ? `Aporta a: ${comp.nombre}` : "No aporta a ninguna bolsa compartida"}{gastos.length ? ` · comparte: ${gastos.join(", ")}` : ""}</span>}
                  <span className={`text-xs font-bold ${bolsaOk ? "text-exito" : "text-[#ff8fa3]"}`}>Bolsa {o.mensual ? "creativa" : "del equipo"}: {Number(suma.toFixed(2))} %{bolsaOk ? "" : " (debe sumar 100 %)"}</span>
                  {o.mensual && !o.venceSabado && <span className="text-xs text-aviso">Cobra con día fijo, no el 1.er sábado.</span>}
                </Link>
              </li>
            );
          })}
        </ul>
        {fuera.length > 0 && (
          <details>
            <summary className="cursor-pointer text-sm font-bold">+ Agregar una obra</summary>
            <ActionForm action={guardarObra} submit="Agregar">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm font-semibold">Obra
                  <select className={input} name="production_id" required defaultValue="">
                    <option value="" disabled>Elige…</option>
                    {fuera.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm font-semibold">Tipo
                  <select className={input} name="mensual" defaultValue="1">
                    <option value="1">Con mensualidad (cada mes y al cierre)</option>
                    <option value="0">Solo al cierre de temporada</option>
                  </select>
                </label>
              </div>
              <p className="text-xs text-texto-3">Arranca con las reglas sugeridas (10 % reserva, 5 % emergencia, 60/40, cierre 40/25/20/15). Después entra a la obra para ajustarlas y a Compartidos para decir con quién comparte.</p>
            </ActionForm>
          </details>
        )}
      </Card>

      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="titular text-xl">De toda la empresa</h2>
          <p className="text-sm text-texto-3">{actual ? `Vigente desde el ${fecha(actual.vigente_desde)}` : "Todavía no hay configuración."}</p>
        </div>
        <ActionForm action={guardarConfig} submit="Guardar como nueva versión">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PARAMS.map((p) => (
              <label key={p.k} className="flex flex-col gap-1 text-sm font-semibold">
                <span>{p.label}{p.unidad ? ` (${p.unidad})` : ""}</span>
                <input className={input} type="number" min={0} step="0.01" name={p.k} required defaultValue={v(p.k)} />
                <span className="text-xs font-normal text-texto-3">{p.ayuda}</span>
              </label>
            ))}
          </div>
          <label className="mt-2 flex max-w-xs flex-col gap-1 text-sm font-semibold">Aplica desde
            <input className={input} type="date" name="vigente_desde" required defaultValue={hoy} />
          </label>
        </ActionForm>
        {h.versiones.length > 1 && (
          <details>
            <summary className="cursor-pointer text-sm font-bold">Historial ({h.versiones.length} versiones)</summary>
            <ul className="mt-2 flex flex-col gap-1 text-sm text-texto-2">
              {h.versiones.map((x) => <li key={x.id}>Desde el <b>{fecha(x.vigente_desde)}</b>: recargo {pesos(x.recargo)}, redondeo {x.redondeo}, umbral {x.umbral_alumnos}, fondo {x.fondo_pct} %, Casa DARF {x.casa_cabezas_pct}/{100 - Number(x.casa_cabezas_pct)}</li>)}
            </ul>
          </details>
        )}
      </Card>
    </div>
  );
}
