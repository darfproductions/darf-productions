import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PrintButton } from "@/components/PrintButton";
import { Card, input } from "@/components/panel/ui";
import { listPerformances } from "@/lib/boleteria";
import { isoMx } from "@/lib/dates";
import { canAny, salidaBoletos } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { formatPerformanceDate } from "@/lib/productions";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/tickets";
import { metodoLabel } from "@/lib/ventas-rules";

export const metadata: Metadata = { title: "Corte de caja" };

type Venta = { cajero: string; metodo: string; ordenes: number; boletos: number; total: number };
type Cancelado = { cajero: string; boletos: number; monto: number };
const fechaOk = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

// Corte de caja (Bloque 4A, 0091): lo cobrado por cajero y por método de pago en un rango de fechas
// (hora de México) y, si se elige, en una sola función. Lo cancelado va aparte (devoluciones).
export default async function Corte({ params, searchParams }: PageProps<"/panel/producciones/[id]/boletos/corte">) {
  const { id } = await params;
  const sp = await searchParams;
  const access = await requirePanel(`/panel/producciones/${id}/boletos/corte`);
  if (!canAny(access, id, ["ventas.ver", "reportes.ver"])) redirect(salidaBoletos(access, id, "boletos/corte"));
  const hoy = isoMx();
  const desde = fechaOk(sp.desde) ?? hoy;
  const hasta = fechaOk(sp.hasta) ?? desde;
  const funcion = typeof sp.funcion === "string" ? sp.funcion : "";
  const [funciones, { data, error }] = await Promise.all([
    listPerformances(id),
    (await createClient()).rpc("corte_caja", { pid: id, p_desde: desde, p_hasta: hasta, p_funcion: funcion || null }),
  ]);
  const ventas = ((data as { ventas?: Venta[] } | null)?.ventas ?? []).map((v) => ({ ...v, total: Number(v.total) }));
  const cancelados = ((data as { cancelados?: Cancelado[] } | null)?.cancelados ?? []).map((c) => ({ ...c, monto: Number(c.monto) }));
  const porMetodo = new Map<string, number>();
  for (const v of ventas) porMetodo.set(v.metodo, (porMetodo.get(v.metodo) ?? 0) + v.total);
  const total = ventas.reduce((n, v) => n + v.total, 0);
  const devuelto = cancelados.reduce((n, c) => n + c.monto, 0);
  const cajeros = [...new Set(ventas.map((v) => v.cajero))];

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 print:hidden">
        <h2 className="titular text-xl">Corte de caja</h2>
        <form className="grid gap-3 sm:grid-cols-4">
          <label className="flex flex-col gap-1.5 text-sm font-semibold">Desde<input className={input} type="date" name="desde" defaultValue={desde} /></label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">Hasta<input className={input} type="date" name="hasta" defaultValue={hasta} /></label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">Función
            <select className={input} name="funcion" defaultValue={funcion}>
              <option value="">Todas</option>
              {funciones.map((f) => <option key={f.id} value={f.id}>{formatPerformanceDate(f.starts_at)}</option>)}
            </select>
          </label>
          <div className="flex items-end gap-2"><button className="rounded-full bg-texto px-5 py-2.5 text-sm font-bold text-sala">Ver corte</button><PrintButton label="Imprimir" /></div>
        </form>
      </Card>
      {error ? <Card>{error.message}</Card> : (
        <>
          <Card className="flex flex-col gap-2">
            <p className="text-sm text-texto-3">{desde === hasta ? `Día ${desde}` : `Del ${desde} al ${hasta}`}{funcion ? ` · ${formatPerformanceDate(funciones.find((f) => f.id === funcion)?.starts_at ?? null)}` : ""}</p>
            <p className="text-3xl font-black">{formatMoney(total)}</p>
            <ul className="flex flex-wrap gap-2 text-sm">
              {[...porMetodo.entries()].map(([m, t]) => <li key={m} className="rounded-full bg-telon-2 px-3 py-1">{metodoLabel(m) ?? "Sin registrar"}: <b>{formatMoney(t)}</b></li>)}
            </ul>
            {devuelto > 0 && <p className="text-sm text-aviso">Boletos cancelados en el periodo: {formatMoney(devuelto)} (por devolver o ya devuelto).</p>}
          </Card>
          {cajeros.map((c) => {
            const filas = ventas.filter((v) => v.cajero === c);
            return (
              <Card key={c} className="flex flex-col gap-2">
                <h3 className="font-bold">{c} · {formatMoney(filas.reduce((n, v) => n + v.total, 0))}</h3>
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-texto-3"><th className="py-1">Método</th><th>Órdenes</th><th>Boletos</th><th className="text-right">Total</th></tr></thead>
                  <tbody>
                    {filas.map((v) => (
                      <tr key={v.metodo} className="border-t border-white/10"><td className="py-1.5">{metodoLabel(v.metodo) ?? "Sin registrar"}</td><td>{v.ordenes}</td><td>{v.boletos}</td><td className="text-right font-semibold">{formatMoney(v.total)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            );
          })}
          {cancelados.length > 0 && (
            <Card className="flex flex-col gap-2">
              <h3 className="font-bold">Cancelados</h3>
              <ul className="text-sm">{cancelados.map((c) => <li key={c.cajero}>{c.cajero}: {c.boletos} {c.boletos === 1 ? "boleto" : "boletos"} · {formatMoney(c.monto)}</li>)}</ul>
            </Card>
          )}
          {!ventas.length && !cancelados.length && <Card className="text-texto-2">No hubo ventas ni cancelaciones en este periodo.</Card>}
        </>
      )}
    </div>
  );
}
