import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, EstadoChip, PanelTitle } from "@/components/panel/ui";
import { Icono } from "@/components/Icono";
import { listPanelProductions, pendingOrdersByProduction, performanceSummary } from "@/lib/panel-data";
import { can, canAny, casa, hasVentasAccess, myProductionIds } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { formatPerformanceDate } from "@/lib/productions";

export const metadata: Metadata = { title: "Ventas" };

const VENTAS = ["ventas.ver", "ventas.operar", "reportes.ver"];

// Ventas (esqueleto nuevo, 0138): todas las obras juntas. Por obra, lo que urge (órdenes por aprobar), la próxima
// función y un botón por tarea: Órdenes, Taquilla, Corte, Reporte. Cada uno lleva a la página de siempre dentro de
// la obra; aquí solo se junta para no entrar obra por obra.
export default async function VentasPage() {
  const access = await requirePanel("/panel/ventas");
  if (!hasVentasAccess(access)) redirect("/panel");
  const obras = (await listPanelProductions(access.isDirector ? undefined : myProductionIds(access)))
    .filter((p) => canAny(access, p.id, VENTAS) && !["archivada", "cancelada"].includes(p.estado));
  const [pendientes, funciones] = await Promise.all([
    pendingOrdersByProduction(),
    Promise.all(obras.map((p) => performanceSummary(p.id))),
  ]);
  const boton = "rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold hover:border-white/60";
  const totalPendientes = obras.reduce((s, p) => s + (pendientes.get(p.id) ?? 0), 0);
  // Primero lo que vende o tiene algo que atender; las obras sin funciones van abajo, en una línea.
  const conMovimiento = obras.map((p, k) => ({ p, f: funciones[k], n: pendientes.get(p.id) ?? 0 }))
    .filter((x) => x.f.total > 0 || x.p.on_sale || x.n > 0)
    .sort((a, b) => b.n - a.n || Number(b.p.on_sale) - Number(a.p.on_sale) || (a.f.proxima ?? "9").localeCompare(b.f.proxima ?? "9"));
  const sinFunciones = obras.filter((p) => !conMovimiento.some((x) => x.p.id === p.id));

  return (
    <>
      <PanelTitle eyebrow="Ventas" title="Ventas">
        Todas las obras en venta, juntas. Lo que urge primero; cada botón abre la página de esa obra.
      </PanelTitle>
      {casa(access, "casa.reportes") && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-texto-2"><b className="text-texto">Reporte general:</b> boletos, dinero, vendedores y asistencia de todas las obras.</p>
          <Link href="/panel/reportes" className="rounded-full bg-texto px-4 py-2 text-sm font-bold text-sala">Abrir reporte general <Icono nombre="flecha-der" /></Link>
        </Card>
      )}
      {obras.length === 0 && <Card className="text-texto-2">No tienes obras en venta.</Card>}
      {obras.length > 0 && conMovimiento.length === 0 && <Card className="text-texto-2">Ninguna obra tiene funciones todavía.</Card>}
      {totalPendientes > 0 && (
        <p role="status" className="rounded-xl border border-aviso/40 bg-telon px-4 py-3 text-sm">
          <b className="text-aviso">{totalPendientes} {totalPendientes === 1 ? "orden por aprobar" : "órdenes por aprobar"}</b> en total.
        </p>
      )}
      <ul className="grid gap-3 md:grid-cols-2">
        {conMovimiento.map(({ p, f, n }) => {
          const base = `/panel/producciones/${p.id}`;
          return (
            <li key={p.id}>
              <Card className={`flex h-full flex-col gap-3 ${n ? "border-aviso/40" : ""}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={base} className="font-bold hover:text-violeta-claro">{p.nombre}</Link>
                  <span className="flex items-center gap-2"><EstadoChip estado={p.estado} />{p.on_sale && <span className="text-xs font-bold uppercase tracking-[0.12em] text-exito">En venta</span>}</span>
                </div>
                <p className="text-sm text-texto-2">
                  {f.total} {f.total === 1 ? "función" : "funciones"} · {f.enVenta} en venta · {f.proxima ? `próxima: ${formatPerformanceDate(f.proxima).toLowerCase()}` : "sin próxima fecha"}
                </p>
                {n > 0 && can(access, p.id, "ventas.ver") && (
                  <Link href={`${base}/boletos?estado=pendiente`} className="flex items-center justify-between gap-3 rounded-lg bg-sala px-4 py-2.5 hover:bg-telon-2">
                    <span><b className="text-aviso">{n} {n === 1 ? "orden por aprobar" : "órdenes por aprobar"}</b></span>
                    <span className="text-violeta-claro"><Icono nombre="flecha-der" /></span>
                  </Link>
                )}
                <div className="mt-auto flex flex-wrap gap-1.5">
                  {can(access, p.id, "ventas.ver") && <Link href={`${base}/boletos`} className={boton}>Órdenes</Link>}
                  {can(access, p.id, "ventas.operar") && <Link href={`${base}/boletos/taquilla`} className={boton}>Taquilla</Link>}
                  {(can(access, p.id, "ventas.ver") || can(access, p.id, "reportes.ver")) && <Link href={`${base}/boletos/corte`} className={boton}>Corte de caja</Link>}
                  {can(access, p.id, "funciones.gestionar") && <Link href={`${base}/boletos/funciones`} className={boton}>Funciones</Link>}
                  {can(access, p.id, "reportes.ver") && <Link href={`${base}/reportes`} className={boton}>Reporte</Link>}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
      {sinFunciones.length > 0 && (
        <p className="text-sm text-texto-3">
          Sin funciones todavía: {sinFunciones.map((p, i) => <span key={p.id}>{i > 0 && " · "}<Link href={`/panel/producciones/${p.id}/boletos/funciones`} className="font-semibold text-texto-2 hover:text-texto">{p.nombre}</Link></span>)}.
        </p>
      )}
    </>
  );
}
