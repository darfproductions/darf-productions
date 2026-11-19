import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/panel/ActionForm";
import { Icono } from "@/components/Icono";
import { Card, PanelTitle, input } from "@/components/panel/ui";
import { isoMx, mayus } from "@/lib/dates";
import { getMes, type PagoMes } from "@/lib/honorarios";
import { lineaParte, type MesResultado } from "@/lib/honorarios-rules";
import { requireCabeza } from "@/lib/permissions";
import { aprobarFondo, cerrarMes, guardarEmergencia } from "../actions";

export const metadata: Metadata = { title: "Honorarios del mes" };

const pesos = (n: number) => `$${Number(n).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pesosRed = (n: number) => `$${Number(n).toLocaleString("es-MX")}`;
const diaLargo = (d: string) => mayus(new Date(`${d}T12:00:00Z`).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }));
const nombreMes = (mes: string) => mayus(new Date(`${mes}-15T12:00:00Z`).toLocaleDateString("es-MX", { month: "long", year: "numeric", timeZone: "UTC" }));
const mover = (mes: string, n: number) => {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const chico = "rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold hover:border-white/50";


// Honorarios · El mes (0150, para Patricio y las cabezas): lo cobrado de cada obra, descuentos, neto, bolsas, la alerta
// del fondo común, la emergencia usada, el pago de cada persona con su desglose y el botón para cerrar el mes.
export default async function HonorariosMes({ searchParams }: PageProps<"/panel/honorarios/mes">) {
  const access = await requireCabeza("/panel/honorarios/mes");
  const sp = await searchParams;
  const hoy = isoMx();
  const mes = typeof sp.m === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.m) ? sp.m : hoy.slice(0, 7);
  const d = await getMes(mes);
  const cerrado = d.cerrado;
  const r: (MesResultado & { pagos?: { nombre: string; obra: string; fecha: string; monto: number; recargo: number }[] }) | null = cerrado ? cerrado.resultado : d.resultado;
  const obrasRef = d.obras.map((o) => ({ id: o.production_id, nombre: o.nombre }));
  const personas = cerrado
    ? d.personasCerrado.map((p) => ({ persona: p.person_id, nombre: p.nombre, pago: Number(p.pago), bruto: Number(p.bruto), partes: p.partes }))
    : r?.personas ?? [];
  const yaCorte = hoy >= d.corte;
  const yoCabeza = d.fondo.cabezas.some((c) => c.user_id === access.session.userId);
  const yoAprobe = d.fondo.aprobaciones.some((a) => a.user_id === access.session.userId);
  const avisos = cerrado ? ((cerrado.resultado as unknown as { avisos?: string[] }).avisos ?? []) : (r?.errores ?? []);
  const bloquea = !cerrado && (r?.errores ?? []).some((e) => e.includes("suman"));

  return (
    <div className="flex flex-col gap-6">
      <PanelTitle eyebrow="Honorarios · solo las cabezas de DARF" title={nombreMes(mes)}>
        Pago de la mensualidad: {diaLargo(d.primerSabado)} · corte: {diaLargo(d.corte)} (cuenta todo lo pagado hasta ese día) · pago al equipo: {diaLargo(d.diaPago)}.
      </PanelTitle>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/panel/honorarios/mes?m=${mover(mes, -1)}`} className={chico}><Icono nombre="flecha-izq" /> {nombreMes(mover(mes, -1))}</Link>
        <Link href={`/panel/honorarios/mes?m=${mover(mes, 1)}`} className={chico}>{nombreMes(mover(mes, 1))} <Icono nombre="flecha-der" /></Link>
        {cerrado
          ? <span className="rounded-full bg-[#14532d] px-3 py-1 text-xs font-bold text-[#bbf7d0]">Cerrado el {new Date(cerrado.cerrado_at).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "long" })}: ya no se recalcula</span>
          : <span className="rounded-full bg-aviso/20 px-3 py-1 text-xs font-bold text-aviso">{yaCorte ? "Abierto: listo para cerrar" : "Abierto: siguen entrando pagos hasta el corte"}</span>}
      </div>

      {!d.config && <Card className="text-texto-2">Falta la configuración (Honorarios, Configuración).</Card>}
      {d.obras.length === 0 && <Card className="text-texto-2">No hay obras con mensualidad en honorarios.</Card>}

      {r && (
        <>
          {avisos.length > 0 && (
            <div role="alert" className="flex flex-col gap-1 rounded-2xl border border-aviso/50 bg-aviso/10 px-5 py-4 text-sm">
              {avisos.map((a, i) => <p key={i}>{a}</p>)}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {r.obras.map((o) => (
              <Card key={o.id} className="flex flex-col gap-2">
                <h2 className="titular text-xl">{o.nombre}</h2>
                <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
                  <dt>Alumnos que pagaron</dt><dd className="text-right font-bold">{o.alumnos}</dd>
                  <dt>Cobrado (mensualidades)</dt><dd className="text-right font-bold">{pesos(o.cobrado)}</dd>
                  <dt className="text-texto-3">− Reserva</dt><dd className="text-right text-texto-3">{pesos(o.reserva)}</dd>
                  <dt className="text-texto-3">− Emergencia usada (tope {pesos(o.emergenciaMax)})</dt><dd className="text-right text-texto-3">{pesos(o.emergenciaUso)}</dd>
                  <dt className="text-texto-3">− Renta</dt><dd className="text-right text-texto-3">{pesos(o.renta)}</dd>
                  <dt className="text-texto-3">− Gastos varios</dt><dd className="text-right text-texto-3">{pesos(o.gastos)}</dd>
                  <dt className="border-t border-white/10 pt-1 font-bold">Neto</dt><dd className={`border-t border-white/10 pt-1 text-right font-bold ${o.sinReparto ? "text-[#ff8fa3]" : ""}`}>{pesos(o.neto)}</dd>
                  <dt>Bolsa creativa{r.fondoAplicado ? " (con fondo común)" : ""}</dt><dd className="text-right">{pesos(o.creativaFinal)}</dd>
                  <dt>A la compartida</dt><dd className="text-right">{pesos(o.aporteCompartida)}</dd>
                </dl>
                {!cerrado && (
                  <details>
                    <summary className="cursor-pointer text-sm font-bold text-violeta-claro">Emergencia usada este mes</summary>
                    <ActionForm action={guardarEmergencia} hidden={{ mes, production_id: o.id }} submit="Guardar" submitClass={chico}>
                      <div className="flex flex-wrap gap-2">
                        <input className={`${input} w-32 py-1.5`} type="number" min={0} step="0.01" name="monto" defaultValue={o.emergenciaUso} aria-label="Monto usado" />
                        <input className={`${input} flex-1 py-1.5`} name="nota" defaultValue={d.emergencia.get(o.id)?.nota ?? ""} placeholder="En qué se usó" aria-label="Nota" />
                      </div>
                      <p className="text-xs text-texto-3">Lo que no se use regresa al neto este mes (no se acumula). Nunca cuenta más del tope.</p>
                    </ActionForm>
                  </details>
                )}
              </Card>
            ))}
          </div>

          <Card className="flex flex-col gap-1">
            <p className="text-sm">Bolsa compartida (de todas las obras): <b>{pesos(r.compartida)}</b></p>
            <p className="text-sm">Recargos cobrados: <b>{pesos(d.recargos)}</b> · Sobrante del redondeo: <b>{pesos(r.sobranteRedondeo)}</b> · <b>A la reserva este mes: {pesos(r.reservaMes)}</b></p>
          </Card>

          {(r.alertaFondo || r.fondoAplicado) && (
            <Card className="flex flex-col gap-3">
              <h2 className="titular text-xl">Fondo creativo común</h2>
              <p className="text-sm text-texto-2">Hay {Math.max(...r.obras.map((o) => o.alumnos)) - Math.min(...r.obras.map((o) => o.alumnos))} alumnos de diferencia entre las obras. Se aplica solo si lo aprueban todas las cabezas: se junta el {d.config?.fondo_pct ?? 30} % de las bolsas creativas y se reparte en partes iguales entre ellas.</p>
              <ul className="flex flex-wrap gap-2 text-sm">
                {d.fondo.cabezas.map((c) => {
                  const si = d.fondo.aprobaciones.some((a) => a.user_id === c.user_id);
                  return <li key={c.user_id} className={`rounded-full px-3 py-1 font-semibold ${si ? "bg-[#14532d] text-[#bbf7d0]" : "bg-white/10 text-texto-3"}`}>{si ? <Icono nombre="check" /> : null} {c.nombre}</li>;
                })}
              </ul>
              <p className="text-sm font-bold">{r.fondoAplicado ? "Aplicado: lo aprobaron todas las cabezas." : "Todavía no se aplica."}</p>
              {!cerrado && yoCabeza && (
                <ActionForm action={aprobarFondo} hidden={{ mes, aprobar: yoAprobe ? "0" : "1" }} submit={yoAprobe ? "Retirar mi aprobación" : "Apruebo aplicar el fondo común"} submitClass={yoAprobe ? chico : undefined} />
              )}
            </Card>
          )}

          <Card className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="titular text-xl">Pagos por persona</h2>
              <p className="text-sm">Total a pagar: <b>{pesosRed(r.totalPagado)}</b></p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead><tr className="text-left text-xs uppercase tracking-[0.1em] text-texto-3"><th className="py-2">Persona</th><th>De dónde sale</th><th className="text-right">Pago</th></tr></thead>
                <tbody>
                  {personas.map((p) => (
                    <tr key={p.persona} className="border-t border-white/10 align-top">
                      <td className="py-2 font-semibold">{p.nombre}</td>
                      <td className="py-2 text-texto-2">{p.partes.map((x, i) => <span key={i} className="block">{lineaParte(x, obrasRef)}</span>)}</td>
                      <td className="py-2 text-right text-base font-black">{pesosRed(p.pago)}<span className="block text-[11px] font-normal text-texto-3">de {pesos(p.bruto)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-texto-3">Cada pago se redondea hacia abajo a {d.config?.redondeo ?? 10} pesos; lo que sobra va a la reserva.</p>
          </Card>

          <Card className="flex flex-col gap-2">
            <details>
              <summary className="cursor-pointer font-bold">Pagos de mensualidad que cuentan este mes ({cerrado ? r.pagos?.length ?? 0 : d.pagos.length})</summary>
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {(cerrado ? (r.pagos ?? []).map((p) => ({ nombre: p.nombre, obra: p.obra, fecha: p.fecha, monto: p.monto, recargo: p.recargo })) : d.pagos.map((p: PagoMes) => ({ nombre: p.nombre, obra: p.production_id, fecha: p.fecha_pago, monto: p.monto, recargo: p.perdonado ? 0 : p.recargo })))
                  .sort((a, b) => a.obra.localeCompare(b.obra) || a.fecha.localeCompare(b.fecha))
                  .map((p, i) => (
                    <li key={i} className="flex flex-wrap justify-between gap-2 border-b border-white/5 py-1">
                      <span>{p.nombre} <span className="text-texto-3">· {obrasRef.find((o) => o.id === p.obra)?.nombre ?? p.obra} · pagó el {p.fecha.split("-").reverse().join("/")}</span></span>
                      <span>{pesos(p.monto)}{p.recargo ? <span className="text-aviso"> + recargo {pesos(p.recargo)}</span> : null}</span>
                    </li>
                  ))}
              </ul>
            </details>
          </Card>

          {!cerrado && (
            <Card className="flex flex-col gap-2">
              <h2 className="titular text-xl">Cerrar el mes</h2>
              <p className="text-sm text-texto-2">Al cerrarlo se guardan estos pagos y a cada quien le aparece su desglose en Mi cuenta. Ya no se recalcula: los pagos que se registren después cuentan en el mes siguiente.</p>
              {!yaCorte && <p className="text-sm text-aviso">Se puede cerrar a partir del {diaLargo(d.corte).toLowerCase()}.</p>}
              {bloquea && <p className="text-sm text-[#ff8fa3]">Corrige las bolsas que no suman 100 % antes de cerrar.</p>}
              {yaCorte && !bloquea && (
                <ActionForm action={cerrarMes} hidden={{ mes }} confirm={`¿Cerrar ${nombreMes(mes).toLowerCase()}? Se pagarán ${pesosRed(r.totalPagado)} y ya no se recalcula.`} submit="Cerrar el mes" />
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
