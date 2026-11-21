import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/panel/ActionForm";
import { Icono } from "@/components/Icono";
import { Card, PanelTitle, input } from "@/components/panel/ui";
import { datosPagoDe, getCierre } from "@/lib/honorarios";
import { lineaParte, type CierreResultado, type PagoPersona } from "@/lib/honorarios-rules";
import { requireCabeza } from "@/lib/permissions";
import { agregarPartida, cerrarCierre, guardarCierre, quitarPartida } from "../../actions";
import { DatoPagoPersona } from "../../DatoPagoPersona";
import { Comprobante } from "../../mes/Comprobante";

export const metadata: Metadata = { title: "Cierre de temporada" };

const pesos = (n: number) => `$${Number(n).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pesosRed = (n: number) => `$${Number(n).toLocaleString("es-MX")}`;
const chico = "rounded-full border border-white/25 px-3 py-1 text-xs font-bold hover:border-white/50";

// Un cierre de temporada (0152): captura (boletos, patrocinios, costos, préstamos), ganancia, reparto por parte y por
// persona, cerrar y pagar a cada quien (comprobante opcional). Cerrado ya no se recalcula.
export default async function Cierre({ params }: PageProps<"/panel/honorarios/cierres/[id]">) {
  const { id } = await params;
  await requireCabeza(`/panel/honorarios/cierres/${id}`);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const d = await getCierre(id);
  if (!d) notFound();
  const { cierre: c } = d;
  const cerrado = c.estado === "cerrado";
  const r = (cerrado ? c.resultado : d.calculo) as (CierreResultado & { entrada?: { boletos: number; patrocinios: number; costos: number; prestamos: number } }) | null;
  const personas: (PagoPersona & { pagadoAt?: string | null; url?: string | null; recibidoAt?: string | null; folio?: string | null })[] = cerrado
    ? d.personas.map((p) => ({ persona: p.person_id, nombre: p.nombre, pago: Number(p.pago), bruto: Number(p.bruto), partes: p.partes, pagadoAt: p.pagado_at, url: p.comprobanteUrl, recibidoAt: p.recibido_at, folio: p.folio }))
    : r?.personas ?? [];
  // 0161: cómo quiere cobrar cada persona (CLABE o efectivo).
  const pagoDe = await datosPagoDe(personas.map((p) => p.persona));
  const entrada = cerrado && r?.entrada ? r.entrada : { boletos: d.boletos, patrocinios: d.patrocinios, costos: d.costos, prestamos: Number(c.prestamos) };
  const bloquea = !cerrado && (r?.errores ?? []).some((e) => e.includes("suman") || e.includes("suma ") || e.includes("no pertenece"));

  return (
    <div className="flex flex-col gap-6">
      <Link href="/panel/honorarios/cierres" className="text-sm font-bold text-violeta-claro"><Icono nombre="flecha-izq" /> Cierres de temporada</Link>
      <PanelTitle eyebrow={`Honorarios · ${d.obra?.nombre ?? c.production_id}`} title={c.nombre}>
        {cerrado ? `Cerrado el ${new Date(c.cerrado_at!).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "long" })}: ya no se recalcula.` : "En captura: revisa los números y el reparto, y ciérralo cuando Patricio presente el reporte final."}
      </PanelTitle>

      <Card className="flex flex-col gap-3">
        <h2 className="titular text-xl">Ganancia</h2>
        <dl className="grid max-w-xl grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
          <dt>Boletos{!cerrado && c.boletos == null ? " (lo vendido en la página)" : ""}</dt><dd className="text-right">{pesos(entrada.boletos)}</dd>
          <dt>+ Patrocinios</dt><dd className="text-right">{pesos(entrada.patrocinios)}</dd>
          <dt className="text-texto-3">− Costos de producción</dt><dd className="text-right text-texto-3">{pesos(entrada.costos)}</dd>
          <dt className="text-texto-3">− Préstamos de la reserva a devolver</dt><dd className="text-right text-texto-3">{pesos(entrada.prestamos)}</dd>
          <dt className="border-t border-white/10 pt-1 font-bold">Ganancia</dt><dd className={`border-t border-white/10 pt-1 text-right font-bold ${r && r.ganancia <= 0 ? "text-[#ff8fa3]" : ""}`}>{r ? pesos(r.ganancia) : "—"}</dd>
        </dl>
        {!cerrado && (
          <details>
            <summary className="cursor-pointer text-sm font-bold text-violeta-claro">Cambiar boletos o préstamos</summary>
            <ActionForm action={guardarCierre} hidden={{ id }} submit="Guardar">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm font-semibold">Boletos ($)<input className={input} type="number" min={0} step="0.01" name="boletos" defaultValue={c.boletos ?? ""} placeholder={`Vacío = lo de la página (${pesosRed(d.boletosAuto)})`} /></label>
                <label className="flex flex-col gap-1 text-sm font-semibold">Préstamos a devolver ($)<input className={input} type="number" min={0} step="0.01" name="prestamos" defaultValue={c.prestamos} /></label>
              </div>
            </ActionForm>
          </details>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="titular text-xl">Patrocinios y costos</h2>
        {d.partidas.length === 0 && <p className="text-sm text-texto-3">Todavía no hay.</p>}
        <ul className="flex flex-col text-sm">
          {d.partidas.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 py-1.5">
              <span>{p.tipo === "patrocinio" ? "Patrocinio" : "Costo"} · {p.concepto}</span>
              <span className="flex items-center gap-2"><b>{p.tipo === "patrocinio" ? "+" : "−"} {pesos(p.monto)}</b>
                {!cerrado && <ActionForm inline action={quitarPartida} hidden={{ id: p.id, cierre_id: id }} submit="Quitar" submitClass={chico} />}</span>
            </li>
          ))}
        </ul>
        {!cerrado && (
          <ActionForm action={agregarPartida} hidden={{ cierre_id: id }} submit="Agregar">
            <div className="grid gap-2 sm:grid-cols-4">
              <select className={input} name="tipo" defaultValue="costo" aria-label="Tipo"><option value="costo">Costo</option><option value="patrocinio">Patrocinio</option></select>
              <input className={`${input} sm:col-span-2`} name="concepto" required placeholder="Renta del teatro, vestuario, patrocinio de…" aria-label="Concepto" />
              <input className={input} type="number" min={0} step="0.01" name="monto" required placeholder="Monto" aria-label="Monto" />
            </div>
          </ActionForm>
        )}
      </Card>

      {r && (
        <>
          {(r.errores ?? []).length > 0 && (
            <div role="alert" className="flex flex-col gap-1 rounded-2xl border border-aviso/50 bg-aviso/10 px-5 py-4 text-sm">{r.errores.map((e, i) => <p key={i}>{e}</p>)}</div>
          )}
          <Card className="flex flex-col gap-2">
            <h2 className="titular text-xl">Reparto</h2>
            <p className="text-sm">Empresa <b>{pesos(r.partes.empresa)}</b> · Creativos / equipo <b>{pesos(r.partes.creativos)}</b> · Compartida <b>{pesos(r.partes.compartida)}</b> · Casa DARF <b>{pesos(r.partes.casa)}</b> (cabezas {pesos(r.partes.casaCabezas)}, integrantes {pesos(r.partes.casaOtros)})</p>
          </Card>
          <Card className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="titular text-xl">Pagos por persona</h2>
              <p className="text-sm">Total: <b>{pesosRed(r.totalPagado)}</b>{cerrado ? ` · pagados ${personas.filter((p) => p.pagadoAt).length} de ${personas.filter((p) => p.pago > 0).length}` : ""}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead><tr className="text-left text-xs uppercase tracking-[0.1em] text-texto-3"><th className="py-2">Persona</th><th>De dónde sale</th><th className="text-right">Pago</th></tr></thead>
                <tbody>
                  {personas.map((p) => (
                    <tr key={p.persona} className="border-t border-white/10 align-top">
                      <td className="py-2 font-semibold">{p.nombre}{p.folio && <span className="block font-mono text-[11px] font-normal text-texto-3">{p.folio}</span>}{p.pago > 0 && <DatoPagoPersona d={pagoDe.get(p.persona)} />}</td>
                      <td className="py-2 text-texto-2">{p.partes.map((x, i) => <span key={i} className="block">{lineaParte(x, d.nombres)}</span>)}</td>
                      <td className="py-2 text-right text-base font-black">{pesosRed(p.pago)}<span className="block text-[11px] font-normal text-texto-3">de {pesos(p.bruto)}</span>
                        {cerrado && p.pago > 0 && (
                          <span className="mt-2 flex flex-col items-end gap-1 text-xs font-normal">
                            {p.pagadoAt && <span className="rounded-full bg-[#14532d] px-2 py-0.5 font-bold text-[#bbf7d0]">Pagado el {new Date(p.pagadoAt).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "short" })}</span>}
                            {p.url && <a href={p.url} target="_blank" rel="noreferrer" className="font-bold text-violeta-claro underline">Ver comprobante</a>}
                            {p.recibidoAt && <span className="text-exito">Le llegó (confirmado)</span>}
                            <Comprobante cierre={id} persona={p.persona} pagado={!!p.pagadoAt} conFoto={!!p.url} />
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-texto-3">Cada pago se redondea hacia abajo; lo que sobra va a la reserva. Casa DARF se reparte con quienes estén en Casa DARF al cerrar.</p>
          </Card>
          {!cerrado && (
            <Card className="flex flex-col gap-2">
              <h2 className="titular text-xl">Cerrar la temporada</h2>
              <p className="text-sm text-texto-2">Se guardan estos pagos (a cada quien le aparecen en Mi cuenta), los préstamos se devuelven a la reserva y el sobrante del redondeo entra a ella. Ya no se recalcula.</p>
              {bloquea ? <p className="text-sm text-[#ff8fa3]">Corrige los errores del reparto antes de cerrar.</p> : (
                <ActionForm action={cerrarCierre} hidden={{ id }} confirm={`¿Cerrar ${c.nombre}? Ganancia ${pesos(r.ganancia)}; se pagarán ${pesosRed(r.totalPagado)} y ya no se recalcula.`} submit="Cerrar la temporada" />
              )}
            </Card>
          )}
        </>
      )}
      {!r && <Card className="text-sm text-texto-2">Faltan las reglas de la obra o la configuración (Honorarios, Obras y reglas).</Card>}
    </div>
  );
}
