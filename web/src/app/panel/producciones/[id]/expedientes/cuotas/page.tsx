import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/panel/ActionForm";
import { Card, input } from "@/components/panel/ui";
import { Icono } from "@/components/Icono";
import { getPagosFicha } from "@/lib/adeudos";
import { mayus } from "@/lib/dates";
import { mesNombre, pesos, recaudacion, type Fee } from "@/lib/member-rules";
import { can } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { todasLasFilas } from "@/lib/supabase/paginar";
import { saveFee } from "../actions";
import { ExpTabs } from "../ExpTabs";

export const metadata: Metadata = { title: "Cuotas" };

// Cuotas del taller (0112: antes estaba escondido al final de Expedientes): inscripción, mensualidad,
// vencimiento y la recaudación por mes (también lo pagado por quien aún no tiene cuenta).
export default async function Cuotas({ params }: PageProps<"/panel/producciones/[id]/expedientes/cuotas">) {
  const { id } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/expedientes/cuotas`);
  if (!can(access, id, "mensualidades.gestionar")) redirect(`/panel/producciones/${id}/expedientes`);
  const verCuotas = true;
  const supabase = await createClient();
  const [fee, pagos, ficha] = await Promise.all([
    supabase.from("production_fees").select("monto, desde, hasta, dia_limite, cobrar, inscripcion, vence_sabado").eq("production_id", id).maybeSingle(),
    todasLasFilas((a, b) => supabase.from("member_payments").select("monto, concepto, registrado_at, anulado_at").eq("production_id", id).order("id").range(a, b)),
    getPagosFicha(id),
  ]);
  const cuota = fee.data as Fee | null;
  type Pago = { monto: number; concepto: "mensualidad" | "inscripcion"; registrado_at: string; anulado_at: string | null };
  const rec = recaudacion([...((pagos.data ?? []) as Pago[]), ...ficha.pagos.map((p) => ({ ...p, registrado_at: p.pagado_at }))]);
  const h = { pid: id };

  return (
    <div className="flex flex-col gap-4">
      <ExpTabs pid={id} actual="cuotas" pagos cobra={!!cuota && cuota.cobrar !== false} />
      {verCuotas && (
        <Card>
          <h2 className="titular mb-1 text-xl">Pagos del taller</h2>
          <p className="mb-3 text-sm text-texto-2">Inscripción (un solo pago, completo aunque entren tarde) y mensualidad (de qué mes a qué mes). Quien entra tarde paga desde su mes de ingreso. La beca, un monto especial o “sin inscripción” se ponen en el expediente de cada persona.</p>
          <ActionForm action={saveFee} hidden={h} submit="Guardar pagos">
            <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="cobrar" defaultChecked={cuota ? cuota.cobrar !== false : true} /> Este taller tiene pagos (si lo apagas, no se cobra nada a nadie)</label>
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

      {verCuotas && rec.meses.length > 0 && (
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
