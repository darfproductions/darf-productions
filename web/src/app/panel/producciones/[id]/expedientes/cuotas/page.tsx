/* La tabla de pagos imita la hoja de Excel de DARF: una fila por integrante y una columna por mes. */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/panel/ActionForm";
import { Card, input } from "@/components/panel/ui";
import { Icono } from "@/components/Icono";
import { getPagosFicha } from "@/lib/adeudos";
import { mayus } from "@/lib/dates";
import { mesNombre, pesos, recaudacion, type Enrollment, type Fee, type FeeTerms, type Payment } from "@/lib/member-rules";
import { columnas, fila, valorCasilla, type Celda } from "@/lib/pago-tabla";
import { METODOS } from "@/lib/pago-rules";
import { can } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { todasLasFilas } from "@/lib/supabase/paginar";
import { saveFee, savePagosTabla, toggleCobro } from "../actions";
import { ExpTabs } from "../ExpTabs";

export const metadata: Metadata = { title: "Cuotas" };

type Persona = { quien: string; nombre: string; href: string; sinCuenta: boolean; baja: boolean; celdas: Celda[] };
const corto = (p: string) => mayus(mesNombre(p)).split(" ")[0].slice(0, 3);

// Cuotas del taller (0112): pagos encendidos o apagados por obra, la tabla para registrar pagos de varios a la vez
// (como la hoja de DARF), los montos y fechas, y la recaudación por mes.
export default async function Cuotas({ params }: PageProps<"/panel/producciones/[id]/expedientes/cuotas">) {
  const { id } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/expedientes/cuotas`);
  if (!can(access, id, "mensualidades.gestionar")) redirect(`/panel/producciones/${id}/expedientes`);
  const supabase = await createClient();
  const [fee, pagos, ficha, roster, terms, altas] = await Promise.all([
    supabase.from("production_fees").select("monto, desde, hasta, dia_limite, cobrar, inscripcion, vence_sabado").eq("production_id", id).maybeSingle(),
    todasLasFilas((a, b) => supabase.from("member_payments").select("user_id, periodo, monto, concepto, registrado_at, anulado_at").eq("production_id", id).order("id").range(a, b)),
    getPagosFicha(id),
    supabase.rpc("cast_roster", { pid: id }),
    supabase.from("member_fee_terms").select("user_id, beca, cuota_especial, sin_inscripcion").eq("production_id", id),
    supabase.from("member_enrollment").select("user_id, ingreso, baja_at, baja_motivo").eq("production_id", id),
  ]);
  const cuota = fee.data as Fee | null;
  const cobra = !!cuota && cuota.cobrar !== false;
  type Pago = Payment & { user_id: string; registrado_at: string; anulado_at: string | null };
  const lista = (pagos.data ?? []) as Pago[];
  const rec = recaudacion([...lista, ...ficha.pagos.map((p) => ({ ...p, registrado_at: p.pagado_at }))]);
  const h = { pid: id };

  // Tabla: integrantes con cuenta y, luego, quienes aún no tienen cuenta (por ficha).
  const cols = cuota ? columnas(cuota) : [];
  const personas: Persona[] = [];
  if (cuota && cobra) {
    for (const g of (roster.data ?? []) as { user_id: string; nombre: string }[]) {
      const t = ((terms.data ?? []) as (FeeTerms & { user_id: string })[]).find((x) => x.user_id === g.user_id) ?? { beca: false, cuota_especial: null };
      const alta = ((altas.data ?? []) as (Enrollment & { user_id: string })[]).find((x) => x.user_id === g.user_id) ?? null;
      personas.push({ quien: `u:${g.user_id}`, nombre: g.nombre, href: `/panel/producciones/${id}/expedientes/${g.user_id}`, sinCuenta: false, baja: !!alta?.baja_at,
        celdas: fila(cuota, cols, t, lista.filter((p) => p.user_id === g.user_id), alta) });
    }
    for (const c of ficha.cuotas) {
      if (!c.people || c.people.profile_id) continue;
      personas.push({ quien: `f:${c.person_id}`, nombre: c.people.nombre, href: `/panel/talento/p/${c.person_id}`, sinCuenta: true, baja: !!c.baja_at,
        celdas: fila(cuota, cols, { beca: c.beca, cuota_especial: null, sin_inscripcion: c.sin_inscripcion },
          ficha.pagos.filter((p) => p.person_id === c.person_id), { ingreso: c.ingreso ?? cuota.desde, baja_at: c.baja_at }) });
    }
    personas.sort((a, b) => Number(a.baja) - Number(b.baja) || a.nombre.localeCompare(b.nombre, "es"));
  }

  return (
    <div className="flex flex-col gap-4">
      <ExpTabs pid={id} actual="cuotas" pagos cobra={cobra} />

      <Card className={`flex flex-wrap items-center justify-between gap-3 border ${cobra ? "border-[#14532d]" : "border-white/10"}`}>
        <div className="min-w-0 flex-1 basis-64">
          <p className="font-bold">Pagos de esta obra: <span className={cobra ? "text-[#bbf7d0]" : "text-texto-3"}>{cobra ? "encendidos" : "apagados"}</span></p>
          <p className="text-sm text-texto-2">{cobra
            ? "Se cobran inscripción y mensualidades: hay adeudos, recordatorios y recibos."
            : cuota ? "No se cobra nada a nadie: sin adeudos ni recordatorios. Lo ya registrado se conserva." : "Para cobrar, llena los montos y meses abajo y guarda."}</p>
        </div>
        {cuota && <ActionForm inline action={toggleCobro} hidden={{ ...h, on: cobra ? "0" : "1" }}
          confirm={cobra ? "¿Apagar los pagos de esta obra? Ya no se cobra nada ni salen adeudos." : "¿Encender los pagos de esta obra?"}
          submit={cobra ? "Apagar pagos" : "Encender pagos"} submitClass={cobra ? "rounded-full border border-white/25 px-4 py-2 text-sm font-bold" : "rounded-full bg-texto px-4 py-2 text-sm font-bold text-sala"} />}
      </Card>

      {cobra && personas.length > 0 && (
        <Card className="flex flex-col gap-3">
          <div>
            <h2 className="titular text-xl">Registrar pagos</h2>
            <p className="text-sm text-texto-2">Como tu hoja: palomea lo que cada quien pagó, elige el método y guarda. Cada pago genera su recibo (a quien tiene cuenta le llega el aviso). Para pagos parciales, montos distintos o anular, entra a su expediente.</p>
          </div>
          <ActionForm action={savePagosTabla} hidden={h} submit="Guardar pagos marcados">
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-sala text-left text-xs uppercase tracking-[0.1em] text-texto-3">
                  <tr>
                    <th className="sticky left-0 bg-sala px-3 py-2">Integrante</th>
                    {cols.map((c) => <th key={c.clave} className="px-2 py-2 text-center">{c.concepto === "inscripcion" ? "Insc." : corto(c.periodo)}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {personas.map((p) => (
                    <tr key={p.quien} className={p.baja ? "bg-white/5 text-texto-3" : ""}>
                      <td className="sticky left-0 bg-telon px-3 py-2">
                        <Link href={p.href} className="font-semibold hover:underline">{p.nombre}</Link>
                        {p.baja && <span className="ml-1 text-[10px] font-bold">· baja</span>}
                        {p.sinCuenta && <span className="ml-1 text-[10px] text-texto-3">· sin cuenta</span>}
                      </td>
                      {p.celdas.map((c, i) => (
                        <td key={cols[i].clave} className="px-2 py-2 text-center">
                          {c.tipo === "pagado" ? <span title="Pagado" className="font-black text-[#86efac]">✓</span>
                            : c.tipo === "pendiente" ? (
                              <label className="inline-flex flex-col items-center gap-0.5" title={`${pesos(c.monto)}${c.vencido ? " · vencido" : ""}`}>
                                <input type="checkbox" name="pago" value={valorCasilla(p.quien, cols[i], c.monto)} aria-label={`${p.nombre}: ${cols[i].concepto === "inscripcion" ? "inscripción" : mesNombre(cols[i].periodo)}`} className="h-5 w-5" />
                                {c.vencido && <span className="text-[9px] font-bold text-[#fecdd3]">debe</span>}
                              </label>
                            )
                            : c.tipo === "parcial" ? <span className="text-[11px] font-bold text-[#fde68a]" title={`Faltan ${pesos(c.falta)}`}>Parcial</span>
                            : c.tipo === "beca" ? <span className="text-[11px] text-[#dbeafe]">Beca</span>
                            : <span className="text-texto-3">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <label className="flex flex-wrap items-center gap-2 text-sm font-semibold">Método de pago
              <select name="metodo" defaultValue="efectivo" className={`${input} w-auto py-1.5`}>
                {Object.entries(METODOS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </label>
          </ActionForm>
          <p className="text-xs text-texto-3">✓ pagado · casilla = pendiente (“debe” si ya venció) · — no le toca (aún no entraba o ya era baja).</p>
        </Card>
      )}

      {(
        <Card>
          <h2 className="titular mb-1 text-xl">Montos y fechas</h2>
          <p className="mb-3 text-sm text-texto-2">Inscripción (un solo pago, completo aunque entren tarde) y mensualidad (de qué mes a qué mes). Quien entra tarde paga desde su mes de ingreso. La beca, un monto especial o “sin inscripción” se ponen en el expediente de cada persona.</p>
          <ActionForm action={saveFee} hidden={h} submit="Guardar pagos">
            <input type="hidden" name="cobrar" value={cobra || !cuota ? "on" : ""} />
            <div className="grid gap-2 sm:grid-cols-5">
              <label className="flex flex-col gap-1 text-xs font-semibold">Inscripción (MXN)<input className={input} type="number" min={0} step="1" name="inscripcion" defaultValue={cuota?.inscripcion ?? 0} /></label>
              <label className="flex flex-col gap-1 text-xs font-semibold">Mensualidad (MXN)<input className={input} type="number" min={0} step="1" name="monto" required defaultValue={cuota?.monto ?? ""} /></label>
              <label className="flex flex-col gap-1 text-xs font-semibold">Primer mes<input className={input} type="month" name="desde" required defaultValue={cuota?.desde.slice(0, 7) ?? ""} /></label>
              <label className="flex flex-col gap-1 text-xs font-semibold">Último mes<input className={input} type="month" name="hasta" required defaultValue={cuota?.hasta.slice(0, 7) ?? ""} /></label>
              <label className="flex flex-col gap-1 text-xs font-semibold">Pagar antes del día<input className={input} type="number" min={1} max={28} name="dia_limite" defaultValue={cuota?.dia_limite ?? 10} /></label>
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="vence_sabado" defaultChecked={!!cuota?.vence_sabado} /> Se paga el primer sábado del mes, con tolerancia hasta el segundo sábado (en lugar del día fijo)</label>
          </ActionForm>
        </Card>
      )}

      {rec.meses.length > 0 && (
        <Card className="overflow-x-auto p-0 md:p-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-4">
            <h2 className="titular text-xl">Recaudación</h2>
            <a href={`/panel/producciones/${id}/expedientes/exportar/pagos`} className="text-sm font-bold text-violeta-claro">Exportar pagos (CSV) <Icono nombre="flecha-abajo" /></a>
          </div>
          <div className="grid grid-cols-3 gap-3 px-5 py-3 text-center">
            <div><p className="text-xl font-black">{pesos(rec.inscripciones)}</p><p className="text-xs text-texto-3">Inscripciones</p></div>
            <div><p className="text-xl font-black">{pesos(rec.mensualidades)}</p><p className="text-xs text-texto-3">Mensualidades</p></div>
            <div><p className="text-xl font-black">{pesos(rec.total)}</p><p className="text-xs text-texto-3">Total cobrado</p></div>
          </div>
          <table className="w-full min-w-[480px] text-sm">
            <thead className="text-left text-xs uppercase tracking-[0.12em] text-texto-3">
              <tr>{["Mes en que se cobró", "Inscripciones", "Mensualidades", "Total"].map((t) => <th key={t} className="px-4 py-2">{t}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {rec.meses.map((m) => (
                <tr key={m.mes}><td className="px-4 py-2">{mayus(mesNombre(m.mes))}</td><td className="px-4 py-2">{pesos(m.inscripciones)}</td>
                  <td className="px-4 py-2">{pesos(m.mensualidades)}</td><td className="px-4 py-2 font-bold">{pesos(m.total)}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
