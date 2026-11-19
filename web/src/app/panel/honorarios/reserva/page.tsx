import type { Metadata } from "next";
import { ActionForm } from "@/components/panel/ActionForm";
import { Card, PanelTitle, input } from "@/components/panel/ui";
import { isoMx, mayus } from "@/lib/dates";
import { configEn, getHonorarios, getReserva } from "@/lib/honorarios";
import { requireCabeza } from "@/lib/permissions";
import { movimientoReserva } from "../actions";

export const metadata: Metadata = { title: "Reserva" };

const pesos = (n: number) => `$${Number(n).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fecha = (d: string) => d.split("-").reverse().join("/");
const nombreMes = (p: string) => mayus(new Date(`${p.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString("es-MX", { month: "long", year: "numeric", timeZone: "UTC" }));
const TIPO = { prestamo: "Préstamo", devolucion: "Devolución", ajuste: "Ajuste" } as const;

// Honorarios · Reserva (0152): saldo y barra hacia la meta; lo que entra cada mes (reserva de cada obra, recargos y
// sobrante del redondeo), préstamos a las obras (se devuelven al cerrar su temporada) y ajustes. La reserva nunca se usa
// para completar sueldos.
export default async function Reserva() {
  await requireCabeza("/panel/honorarios/reserva");
  const [h, r] = await Promise.all([getHonorarios(), getReserva()]);
  const hoy = isoMx();
  const meta = Number(configEn(h.versiones, hoy)?.reserva_meta ?? 0);
  const avance = meta > 0 ? Math.max(0, Math.min(100, (r.saldo / meta) * 100)) : 0;
  const nombre = new Map(h.obras.map((o) => [o.production_id, o.nombre]));
  const historial = [
    ...r.entradas.map((e) => ({ fecha: e.periodo, texto: `Entrada del mes · ${nombreMes(e.periodo)}`, monto: e.monto })),
    ...r.movs.map((m) => ({ fecha: m.fecha, texto: `${TIPO[m.tipo]}${m.production_id ? ` · ${nombre.get(m.production_id) ?? m.production_id}` : ""}${m.concepto ? ` · ${m.concepto}` : ""}`, monto: m.tipo === "prestamo" ? -m.monto : m.monto })),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha));
  const pendientes = [...r.pendientes.entries()].filter(([, v]) => v > 0.005);

  return (
    <div className="flex flex-col gap-6">
      <PanelTitle eyebrow="Honorarios · solo las cabezas de DARF" title="Reserva">
        Cada mes entra la reserva de cada obra, los recargos y el sobrante del redondeo. Se le puede prestar a una obra (se devuelve al cerrar su temporada). Nunca se usa para completar sueldos.
      </PanelTitle>

      <Card className="flex flex-col gap-3">
        <p className="text-sm text-texto-3">Saldo</p>
        <p className="text-4xl font-black">{pesos(r.saldo)}</p>
        {meta > 0 && (
          <>
            <div className="h-3 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={Math.round(avance)} aria-valuemin={0} aria-valuemax={100} aria-label="Avance hacia la meta">
              <div className="h-full rounded-full bg-exito" style={{ width: `${avance}%` }} />
            </div>
            <p className="text-sm text-texto-2">{Math.round(avance)} % de la meta de {pesos(meta)} (la meta es informativa: la reserva sigue creciendo).</p>
          </>
        )}
        {pendientes.length > 0 && (
          <p className="text-sm">Prestado y por devolver: {pendientes.map(([pid, v]) => <span key={pid} className="mr-3"><b>{nombre.get(pid) ?? pid}</b> {pesos(v)}</span>)}</p>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="titular text-xl">Registrar un movimiento</h2>
        <ActionForm action={movimientoReserva} submit="Registrar">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="flex flex-col gap-1 text-sm font-semibold">Tipo
              <select className={input} name="tipo" defaultValue="prestamo"><option value="prestamo">Préstamo a una obra</option><option value="ajuste">Ajuste (+ entra, − sale)</option></select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold">Obra
              <select className={input} name="production_id" defaultValue=""><option value="">—</option>{h.obras.map((o) => <option key={o.production_id} value={o.production_id}>{o.nombre}</option>)}</select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold">Monto ($)<input className={input} type="number" step="0.01" name="monto" required /></label>
            <label className="flex flex-col gap-1 text-sm font-semibold">Fecha<input className={input} type="date" name="fecha" required defaultValue={hoy} /></label>
            <label className="flex flex-col gap-1 text-sm font-semibold">Concepto<input className={input} name="concepto" placeholder="Para qué" /></label>
          </div>
          <p className="text-xs text-texto-3">Los préstamos se proponen solos como «préstamos a devolver» al crear el cierre de temporada de la obra, y al cerrarlo regresan a la reserva.</p>
        </ActionForm>
      </Card>

      <Card className="flex flex-col gap-2">
        <h2 className="titular text-xl">Movimientos</h2>
        {historial.length === 0 ? <p className="text-sm text-texto-3">Todavía no hay movimientos (la reserva crece al cerrar cada mes).</p> : (
          <ul className="flex flex-col text-sm">
            {historial.map((x, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2 border-b border-white/5 py-1.5">
                <span><span className="text-texto-3">{fecha(x.fecha)}</span> · {x.texto}</span>
                <b className={x.monto < 0 ? "text-[#ff8fa3]" : "text-exito"}>{x.monto < 0 ? "−" : "+"} {pesos(Math.abs(x.monto))}</b>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
