"use client";

import { useState } from "react";
import { Card } from "@/components/panel/ui";
import { desglosePorZona, type FilaVentaZona } from "@/lib/ventas-zona-rules";
import { formatMoney } from "@/lib/tickets";

// Sin "MXN" en la tabla (ya lo dice el total de arriba) para que quepa en el celular.
const dinero = (n: number) => `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pill = (activo: boolean) => `shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${activo ? "border-texto bg-texto text-sala" : "border-white/20"}`;

// 0132: lo más importante de Ventas, hasta arriba. Cuántos boletos y cuánto dinero lleva cada zona, de todas las
// funciones o de una. Se cambia al instante (los números ya vienen todos en una sola consulta).
export function DesgloseZonas({ filas, zonas, funciones }: {
  filas: FilaVentaZona[]; zonas: { id: string; nombre: string; color: string | null }[]; funciones: { id: string; nombre: string }[];
}) {
  const [funcion, setFuncion] = useState("");
  const d = desglosePorZona(filas, zonas, funcion);
  const color = new Map(zonas.map((z) => [z.id, z.color]));
  const hayCortesias = d.total.cortesias > 0;
  const hayApartados = d.total.apartados > 0;
  // Cortesías y apartados van chiquitos bajo el número, para que la tabla quepa en el celular.
  const extra = (z: { cortesias: number; apartados: number }) => [
    z.cortesias ? `+${z.cortesias} ${z.cortesias === 1 ? "cortesía" : "cortesías"}` : "",
    z.apartados ? `${z.apartados} por aprobar` : "",
  ].filter(Boolean).join(" · ");
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="titular text-xl">Venta por zona</h2>
        <p className="text-sm text-texto-2"><b className="text-2xl font-black text-texto">{formatMoney(d.total.ingresos)}</b> · {d.total.vendidos} {d.total.vendidos === 1 ? "boleto" : "boletos"}</p>
      </div>
      <nav aria-label="Función" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        <button type="button" onClick={() => setFuncion("")} aria-pressed={!funcion} className={pill(!funcion)}>Todas las funciones</button>
        {funciones.map((f) => (
          <button key={f.id} type="button" onClick={() => setFuncion(f.id)} aria-pressed={funcion === f.id} className={pill(funcion === f.id)}>{f.nombre}</button>
        ))}
      </nav>
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-[0.12em] text-texto-3">
          <tr>
            <th className="py-2 pr-2 font-bold">Zona</th>
            <th className="px-2 py-2 text-right font-bold">Boletos</th>
            <th className="py-2 pl-2 text-right font-bold">Dinero</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {d.zonas.map((z) => (
            <tr key={z.id ?? "sin"} className="align-top">
              <td className="py-2.5 pr-2 font-semibold">
                <span className="mr-2 inline-block h-3 w-3 rounded-full align-middle" style={{ background: (z.id && color.get(z.id)) || "#6b6475" }} />{z.nombre}
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums">
                <b>{z.vendidos}</b>
                {extra(z) && <span className="block text-[11px] text-texto-3">{extra(z)}</span>}
              </td>
              <td className="whitespace-nowrap py-2.5 pl-2 text-right font-bold tabular-nums">{dinero(z.ingresos)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-white/20">
          <tr className="align-top text-base">
            <td className="py-2.5 pr-2 font-black">Total</td>
            <td className="px-2 py-2.5 text-right tabular-nums">
              <b className="font-black">{d.total.vendidos}</b>
              {extra(d.total) && <span className="block text-[11px] font-normal text-texto-3">{extra(d.total)}</span>}
            </td>
            <td className="whitespace-nowrap py-2.5 pl-2 text-right font-black tabular-nums">{dinero(d.total.ingresos)}</td>
          </tr>
        </tfoot>
      </table>
      <p className="text-xs text-texto-3">Solo órdenes aprobadas{hayApartados ? "; “por aprobar” son boletos apartados que aún no pagan" : ""}. El dinero es lo que se cobró (con descuentos){hayCortesias ? "; las cortesías no suman" : ""}.</p>
    </Card>
  );
}
