import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/panel/ActionForm";
import { Icono } from "@/components/Icono";
import { Card, PanelTitle, input } from "@/components/panel/ui";
import { isoMx } from "@/lib/dates";
import { configEn, getHonorarios } from "@/lib/honorarios";
import { requireCabeza } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { guardarConfig, guardarObra, usarSabados } from "./actions";

export const metadata: Metadata = { title: "Honorarios" };

const pesos = (n: number | null) => (n == null ? "—" : `$${Number(n).toLocaleString("es-MX")}`);
const fecha = (d: string) => d.split("-").reverse().join("/");

// Los parámetros del documento de Patricio (sección 2), con su explicación. Ninguno va fijo en el código.
const PARAMS: { k: string; label: string; unidad: "%" | "$" | ""; ayuda: string }[] = [
  { k: "reserva_pct", label: "Fondo de reserva", unidad: "%", ayuda: "De lo cobrado de cada obra, siempre (aunque se llegue a la meta)." },
  { k: "reserva_meta", label: "Meta de la reserva", unidad: "$", ayuda: "Solo informativo (barra de avance)." },
  { k: "emergencia_pct", label: "Personal de emergencia (tope)", unidad: "%", ayuda: "Se descuenta solo lo que se usó; el resto vuelve al neto ese mes." },
  { k: "renta", label: "Renta del salón al mes", unidad: "$", ayuda: "Se divide entre las obras con mensualidad." },
  { k: "gastos", label: "Gastos varios al mes", unidad: "$", ayuda: "Se divide entre las obras con mensualidad." },
  { k: "creativo_pct", label: "Neto a la bolsa creativa", unidad: "%", ayuda: "El resto va a la bolsa compartida." },
  { k: "recargo", label: "Recargo por pago tardío", unidad: "$", ayuda: "Por mensualidad pagada después del 2.º sábado. Va a la reserva." },
  { k: "redondeo", label: "Redondeo de pagos (hacia abajo)", unidad: "$", ayuda: "Lo que sobra va a la reserva." },
  { k: "umbral_alumnos", label: "Diferencia de alumnos para alerta", unidad: "", ayuda: "Solo avisa; el fondo común se aplica si lo aprueban las 4 cabezas." },
  { k: "fondo_pct", label: "Fondo creativo común", unidad: "%", ayuda: "De cada bolsa creativa; se junta y se reparte en partes iguales." },
];
const CIERRE: { k: string; label: string }[] = [
  { k: "cierre_empresa_pct", label: "Empresa" }, { k: "cierre_creativos_pct", label: "Creativos" },
  { k: "cierre_compartida_pct", label: "Compartida" }, { k: "cierre_casa_pct", label: "Casa DARF" },
];

// Honorarios · Configuración (0149): parámetros con vigencia e historial, y las obras del módulo. Solo las cabezas.
export default async function HonorariosConfig() {
  await requireCabeza("/panel/honorarios");
  const { versiones, obras } = await getHonorarios();
  const hoy = isoMx();
  const actual = configEn(versiones, hoy) ?? versiones.at(-1) ?? null;
  const supabase = await createClient();
  const { data: prods } = await supabase.from("productions").select("id, nombre").order("nombre");
  const fuera = ((prods ?? []) as { id: string; nombre: string }[]).filter((p) => !obras.some((o) => o.production_id === p.id));
  const v = (k: string) => (actual ? String((actual as unknown as Record<string, number>)[k]) : "");

  return (
    <div className="flex flex-col gap-6">
      <PanelTitle eyebrow="Honorarios · solo las cabezas de DARF" title="Configuración">
        Los montos y porcentajes con los que se calculan los honorarios. Cada cambio aplica desde la fecha que elijas y lo anterior queda en el historial: los meses ya pagados no cambian.
      </PanelTitle>

      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="titular text-xl">Parámetros</h2>
          <p className="text-sm text-texto-3">{actual ? `Vigentes desde el ${fecha(actual.vigente_desde)}` : "Todavía no hay configuración."}</p>
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
          <fieldset className="mt-2 flex flex-col gap-2">
            <legend className="text-sm font-semibold">Reparto de la ganancia al cierre de temporada (debe sumar 100 %)</legend>
            <div className="grid gap-3 sm:grid-cols-5">
              {CIERRE.map((c) => (
                <label key={c.k} className="flex flex-col gap-1 text-sm">{c.label} (%)
                  <input className={input} type="number" min={0} max={100} step="0.01" name={c.k} required defaultValue={v(c.k)} />
                </label>
              ))}
              <label className="flex flex-col gap-1 text-sm">De Casa DARF, a las cabezas (%)
                <input className={input} type="number" min={0} max={100} step="0.01" name="casa_cabezas_pct" required defaultValue={v("casa_cabezas_pct")} />
              </label>
            </div>
            <p className="text-xs text-texto-3">Casa DARF: lo de las cabezas se divide en partes iguales entre ellas y el resto en partes iguales entre los demás integrantes de Casa DARF (se calcula con quienes estén en ese momento).</p>
          </fieldset>
          <label className="mt-2 flex max-w-xs flex-col gap-1 text-sm font-semibold">Aplica desde
            <input className={input} type="date" name="vigente_desde" required defaultValue={hoy} />
          </label>
        </ActionForm>
        {versiones.length > 0 && (
          <details>
            <summary className="cursor-pointer text-sm font-bold">Historial ({versiones.length} {versiones.length === 1 ? "versión" : "versiones"})</summary>
            <ul className="mt-2 flex flex-col gap-1 text-sm text-texto-2">
              {versiones.map((x) => (
                <li key={x.id}>Desde el <b>{fecha(x.vigente_desde)}</b>: reserva {x.reserva_pct} %, emergencia {x.emergencia_pct} %, renta {pesos(x.renta)}, gastos {pesos(x.gastos)}, creativo {x.creativo_pct} %, recargo {pesos(x.recargo)}, cierre {x.cierre_empresa_pct}/{x.cierre_creativos_pct}/{x.cierre_compartida_pct}/{x.cierre_casa_pct}</li>
              ))}
            </ul>
          </details>
        )}
      </Card>

      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="titular text-xl">Obras</h2>
          <Link href="/panel/honorarios/bolsas" className="text-sm font-bold text-violeta-claro">Bolsas y porcentajes <Icono nombre="flecha-der" /></Link>
        </div>
        <p className="text-sm text-texto-2">Con mensualidad: reparto cada mes y al cierre. Solo temporada: solo al cierre (como Showman). La mensualidad sale de las cuotas de cada obra.</p>
        {obras.length === 0 && <p className="text-sm text-texto-3">Todavía no hay obras en honorarios.</p>}
        <ul className="flex flex-col gap-3">
          {obras.map((o) => (
            <li key={o.production_id} className={`rounded-xl border border-white/10 p-4 ${o.activa ? "" : "opacity-60"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold">{o.nombre} <span className="ml-1 text-sm font-normal text-texto-3">{o.mensual ? "Con mensualidad" : "Solo temporada"}{o.activa ? "" : " · cerrada"}</span></p>
                {o.mensual && <p className="text-sm text-texto-2">Mensualidad {pesos(o.mensualidad)} · inscripción {pesos(o.inscripcion)} (no entra al reparto)</p>}
              </div>
              {o.mensual && !o.venceSabado && (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-aviso/40 bg-aviso/10 px-3 py-2 text-sm">
                  <span>Esta obra cobra con día fijo, no el 1.er sábado con corte el 2.º.</span>
                  <ActionForm inline action={usarSabados} hidden={{ production_id: o.production_id }} submit="Usar sábados" submitClass="rounded-full border border-white/30 px-3 py-1 text-xs font-bold" />
                </div>
              )}
              <details className="mt-2">
                <summary className="cursor-pointer text-sm font-bold text-violeta-claro">Cambiar</summary>
                <ObraForm o={o} />
              </details>
            </li>
          ))}
        </ul>
        {fuera.length > 0 && (
          <details>
            <summary className="cursor-pointer text-sm font-bold">+ Agregar una obra</summary>
            <ObraForm opciones={fuera} />
          </details>
        )}
      </Card>
    </div>
  );
}

function ObraForm({ o, opciones = [] }: { o?: { production_id: string; mensual: boolean; activa: boolean; cierre_empresa_pct: number | null; cierre_creativos_pct: number | null; cierre_compartida_pct: number | null; cierre_casa_pct: number | null }; opciones?: { id: string; nombre: string }[] }) {
  const propio = o?.cierre_empresa_pct != null;
  return (
    <ActionForm action={guardarObra} hidden={o ? { production_id: o.production_id } : undefined} submit="Guardar obra">
      <div className="grid gap-3 sm:grid-cols-3">
        {!o && (
          <label className="flex flex-col gap-1 text-sm font-semibold">Obra
            <select className={input} name="production_id" required defaultValue="">
              <option value="" disabled>Elige…</option>
              {opciones.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm font-semibold">Tipo
          <select className={input} name="mensual" defaultValue={o && !o.mensual ? "0" : "1"}>
            <option value="1">Con mensualidad (mes y cierre)</option>
            <option value="0">Solo temporada (cierre)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">Estado
          <select className={input} name="activa" defaultValue={o && !o.activa ? "0" : "1"}>
            <option value="1">Activa</option>
            <option value="0">Cerrada (ya no reparte cada mes)</option>
          </select>
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="cierre_propio" defaultChecked={propio} /> Esta obra tiene su propio reparto del cierre (por ejemplo Showman: 40 empresa, 45 equipo, 0 compartida, 15 Casa DARF)</label>
      <div className="grid gap-3 sm:grid-cols-4">
        {[["cierre_empresa_pct", "Empresa", o?.cierre_empresa_pct], ["cierre_creativos_pct", "Equipo / creativos", o?.cierre_creativos_pct], ["cierre_compartida_pct", "Compartida", o?.cierre_compartida_pct], ["cierre_casa_pct", "Casa DARF", o?.cierre_casa_pct]].map(([k, l, d]) => (
          <label key={String(k)} className="flex flex-col gap-1 text-sm">{String(l)} (%)
            <input className={input} type="number" min={0} max={100} step="0.01" name={String(k)} defaultValue={d == null ? "" : String(d)} />
          </label>
        ))}
      </div>
    </ActionForm>
  );
}
