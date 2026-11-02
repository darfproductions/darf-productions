"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/panel/ui";
import { Icono } from "@/components/Icono";
import { csv } from "@/lib/pago-rules";
import { filasExcel, filtrarTabla, resumenZonas, totalesTabla, type FilaTabla } from "@/lib/ventas-tabla-rules";
import { METODOS_PAGO, metodoLabel } from "@/lib/ventas-rules";
import { cambiarMetodoPago } from "./actions";

export type FilaVista = FilaTabla & { fechaTexto: string; funcionTexto: string };

const pill = (activo: boolean) => `shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${activo ? "border-texto bg-texto text-sala" : "border-white/20"}`;
// Mismo texto en el servidor y en el navegador (sin depender del idioma del equipo).
const dinero = (n: number) => `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
const METODOS_EDITABLES = METODOS_PAGO.filter(([v]) => v !== "cortesia");

// 0132 + 2026-11-02: lo más importante de Ventas, hasta arriba. Cuánto lleva cada zona (de todas las funciones o de
// una); al tocar una zona se despliegan sus órdenes, con el método de pago editable. Abajo, cuánto entró por cada
// método (para cuadrar efectivo contra banco) y el botón para bajarlo a Excel. Todo cambia al instante.
export function DesgloseZonas({ pid, filas, zonas, funciones, editar }: {
  pid: string; filas: FilaVista[]; zonas: { id: string; nombre: string; color: string | null }[]; funciones: { id: string; nombre: string }[]; editar: boolean;
}) {
  const [funcion, setFuncion] = useState("");
  const [pendientes, setPendientes] = useState(false);
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  const vistas = useMemo(() => filtrarTabla(filas, { funcion, pendientes }) as FilaVista[], [filas, funcion, pendientes]);
  const porZona = useMemo(() => resumenZonas(vistas, zonas), [vistas, zonas]);
  const t = useMemo(() => totalesTabla(vistas), [vistas]);
  const color = new Map(zonas.map((z) => [z.id, z.color]));
  const total = porZona.reduce((s, z) => ({ boletos: s.boletos + z.boletos, cortesias: s.cortesias + z.cortesias, porAprobar: s.porAprobar + z.porAprobar }), { boletos: 0, cortesias: 0, porAprobar: 0 });
  const hayPendientes = filas.some((f) => f.estado === "pendiente" && (!funcion || f.funcionId === funcion));
  const extra = (z: { cortesias: number; porAprobar: number }) => [
    z.cortesias ? `+${z.cortesias} ${z.cortesias === 1 ? "cortesía" : "cortesías"}` : "",
    z.porAprobar ? `${z.porAprobar} por aprobar` : "",
  ].filter(Boolean).join(" · ");
  const alternar = (k: string) => setAbiertas((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const descargar = () => {
    const texto = csv(filasExcel(vistas, metodoLabel));
    const url = URL.createObjectURL(new Blob([texto], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `ventas-${pid}${funcion ? "-funcion" : ""}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="titular text-xl">Venta por zona</h2>
        <p className="text-sm text-texto-2"><b className="text-2xl font-black text-texto">{dinero(t.neto)} MXN</b> · {total.boletos} {total.boletos === 1 ? "boleto" : "boletos"}</p>
      </div>
      <nav aria-label="Función" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        <button type="button" onClick={() => setFuncion("")} aria-pressed={!funcion} className={pill(!funcion)}>Todas las funciones</button>
        {funciones.map((f) => (
          <button key={f.id} type="button" onClick={() => setFuncion(f.id)} aria-pressed={funcion === f.id} className={pill(funcion === f.id)}>{f.nombre}</button>
        ))}
      </nav>
      {(hayPendientes || pendientes) && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={pendientes} onChange={(e) => setPendientes(e.target.checked)} className="h-4 w-4" />
          Incluir órdenes por aprobar <span className="text-texto-3">(apartadas que aún no se marcan como pagadas)</span>
        </label>
      )}
      {/* Columnas de ancho fijo: al desplegar una zona, sus órdenes no ensanchan la tabla en el celular. */}
      <table className="w-full table-fixed text-sm">
        <thead className="text-left text-xs uppercase tracking-[0.12em] text-texto-3">
          <tr>
            <th className="py-2 pr-2 font-bold">Zona</th>
            <th className="w-[5.5rem] px-2 py-2 text-right font-bold">Boletos</th>
            <th className="w-[7.5rem] py-2 pl-2 text-right font-bold">Dinero</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {porZona.map((z) => {
            const k = z.id ?? "sin";
            const abierta = abiertas.has(k);
            return (
              <Fragment key={k}>
                <tr className="align-top">
                  <td className="py-2.5 pr-2 font-semibold">
                    <button type="button" onClick={() => alternar(k)} disabled={!z.filas.length} aria-expanded={abierta}
                      className="flex items-center gap-2 text-left disabled:cursor-default">
                      <Icono nombre={abierta ? "flecha-abajo" : "flecha-der"} />
                      <span className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: (z.id && color.get(z.id)) || "#6b6475" }} />
                      <span>{z.nombre}</span>
                    </button>
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">
                    <b>{z.boletos}</b>
                    {extra(z) && <span className="block text-[11px] text-texto-3">{extra(z)}</span>}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pl-2 text-right font-bold tabular-nums">{dinero(z.dinero)}</td>
                </tr>
                {abierta && (
                  <tr>
                    <td colSpan={3} className="pb-3">
                      <OrdenesZona pid={pid} filas={z.filas as FilaVista[]} editar={editar} conFuncion={!funcion && funciones.length > 1} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
        <tfoot className="border-t-2 border-white/20">
          <tr className="align-top text-base">
            <td className="py-2.5 pr-2 font-black">Total</td>
            <td className="px-2 py-2.5 text-right tabular-nums">
              <b className="font-black">{total.boletos}</b>
              {extra(total) && <span className="block text-[11px] font-normal text-texto-3">{extra(total)}</span>}
            </td>
            <td className="whitespace-nowrap py-2.5 pl-2 text-right font-black tabular-nums">{dinero(t.neto)}</td>
          </tr>
        </tfoot>
      </table>
      {t.porMetodo.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-xl bg-sala p-3 text-sm">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-texto-3">Por método de pago</p>
          {t.porMetodo.map((m) => (
            <p key={m.metodo ?? "sin"} className="flex justify-between gap-3">
              <span>{metodoLabel(m.metodo) ?? "Sin método"} <span className="text-texto-3">· {m.boletos} {m.boletos === 1 ? "boleto" : "boletos"}</span></span>
              <b className="tabular-nums">{dinero(m.neto)}</b>
            </p>
          ))}
          {t.descuentos > 0 && <p className="flex justify-between gap-3 text-texto-3"><span>Descuentos aplicados</span><span className="tabular-nums">−{dinero(t.descuentos)}</span></p>}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-texto-3">Toca una zona para ver sus órdenes. El dinero es lo que se cobró (con descuentos); las cortesías no suman.</p>
        <button type="button" onClick={descargar} disabled={!vistas.length} className="rounded-full border border-white/25 px-4 py-2 text-xs font-bold hover:border-white/50 disabled:opacity-50">
          Descargar en Excel <Icono nombre="flecha-abajo" />
        </button>
      </div>
    </Card>
  );
}

/** Las órdenes de una zona: fecha, orden, comprador, vendedor, cantidad, cobrado y método de pago (editable). */
function OrdenesZona({ pid, filas, editar, conFuncion }: { pid: string; filas: FilaVista[]; editar: boolean; conFuncion: boolean }) {
  return (
    <ul className="flex flex-col gap-2 rounded-xl bg-sala p-2">
      {filas.map((f) => (
        <li key={f.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-2 text-xs [overflow-wrap:anywhere] odd:bg-white/[0.03]">
          <span className="min-w-0 flex-1 basis-40">
            <b className="font-mono text-sm">{f.codigo}</b>
            {f.estado === "pendiente" && <span className="ml-2 rounded-full bg-aviso/20 px-2 py-0.5 text-[10px] font-bold text-aviso">Por aprobar</span>}
            <span className="block text-texto-2">{f.comprador}{f.telefono ? ` · ${f.telefono}` : ""}</span>
            <span className="block text-texto-3">{f.fechaTexto}{conFuncion ? ` · ${f.funcionTexto}` : ""}{f.vendedor ? ` · Vendió: ${f.vendedor}` : ""}</span>
          </span>
          <span className="text-right tabular-nums">
            <b className="text-sm">{f.cantidad} × {dinero(f.precio)}</b>
            <span className="block font-bold">{dinero(f.neto)}{f.neto !== f.bruto ? <span className="font-normal text-texto-3"> (de {dinero(f.bruto)})</span> : null}</span>
          </span>
          <MetodoOrden pid={pid} fila={f} editar={editar} />
        </li>
      ))}
    </ul>
  );
}

function MetodoOrden({ pid, fila, editar }: { pid: string; fila: FilaVista; editar: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [valor, setValor] = useState(fila.metodo ?? "");
  const [error, setError] = useState<string | null>(null);
  if (!editar || fila.metodo === "cortesia") {
    return <span className="w-full rounded-full bg-white/10 px-3 py-1 text-center font-semibold sm:w-auto">{metodoLabel(fila.metodo) ?? "Sin método"}</span>;
  }
  return (
    <span className="flex w-full flex-col gap-1 sm:w-auto">
      <select aria-label={`Método de pago de ${fila.codigo}`} value={valor} disabled={pending}
        onChange={(e) => {
          const nuevo = e.target.value;
          const antes = valor;
          setValor(nuevo); setError(null);
          start(async () => {
            const r = await cambiarMetodoPago(pid, fila.orderId, nuevo, fila.referencia);
            if (!r.ok) { setValor(antes); setError(r.message ?? "No se pudo guardar."); return; }
            router.refresh();
          });
        }}
        className="rounded-lg border border-white/15 bg-telon px-2 py-1.5 text-xs font-semibold disabled:opacity-60">
        {!valor && <option value="">Sin método</option>}
        {METODOS_EDITABLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      {error && <span role="alert" className="text-[11px] text-aviso">{error}</span>}
    </span>
  );
}
