"use client";

import { useState } from "react";
import { ActionForm } from "@/components/panel/ActionForm";
import { input } from "@/components/panel/ui";
import { comisionDe, leerTramos, textoTramo, validarTramos, type Tramo } from "@/lib/comision-rules";
import { formatMoney } from "@/lib/tickets";
import { guardarTramos } from "./actions";

type Fila = { desde: string; hasta: string; porcentaje: string };
const fila = (t?: Tramo): Fila => ({ desde: t ? String(t.desde) : "", hasta: t?.hasta != null ? String(t.hasta) : "", porcentaje: t ? String(t.porcentaje) : "" });
const chico = "rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold hover:border-white/50";

// Editor de la tabla de comisiones (0129): de la obra o la propia de un vendedor.
export function TramosComision({ pid, sid, tramos, precio, submit }: { pid: string; sid?: string; tramos: Tramo[]; precio: number; submit: string }) {
  const [filas, setFilas] = useState<Fila[]>(tramos.length ? tramos.map(fila) : [fila()]);
  const leidos = leerTramos(filas);
  const error = validarTramos(leidos);
  const poner = (i: number, k: keyof Fila, v: string) => setFilas(filas.map((f, j) => (j === i ? { ...f, [k]: v } : f)));
  // Vista previa: hasta donde llega la tabla (o 50 boletos si termina abierta), al precio de ejemplo.
  const ultimo = leidos.at(-1);
  const n = ultimo ? (ultimo.hasta ?? Math.max(ultimo.desde + 9, 50)) : 0;

  return (
    <ActionForm action={guardarTramos} hidden={{ pid, sid: sid ?? "", tramos: JSON.stringify(leidos) }} submit={submit}>
      <div className="flex flex-col gap-2">
        {filas.map((f, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2 text-sm">
            <label className="flex flex-col gap-1 text-xs font-semibold">Del boleto
              <input className={`${input} w-24`} inputMode="numeric" value={f.desde} onChange={(e) => poner(i, "desde", e.target.value)} aria-label={`Tramo ${i + 1}: desde el boleto`} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold">al boleto
              <input className={`${input} w-24`} inputMode="numeric" value={f.hasta} placeholder="en adelante" onChange={(e) => poner(i, "hasta", e.target.value)} aria-label={`Tramo ${i + 1}: hasta el boleto`} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold">Comisión %
              <input className={`${input} w-24`} inputMode="decimal" value={f.porcentaje} onChange={(e) => poner(i, "porcentaje", e.target.value)} aria-label={`Tramo ${i + 1}: porcentaje`} />
            </label>
            {filas.length > 1 && <button type="button" className={chico} onClick={() => setFilas(filas.filter((_, j) => j !== i))}>Quitar</button>}
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={chico} onClick={() => setFilas([...filas, fila()])}>+ Agregar tramo</button>
          <button type="button" className={chico} onClick={() => setFilas([{ desde: "1", hasta: "", porcentaje: filas[0]?.porcentaje ?? "" }])}>Mismo % para todos los boletos</button>
          <button type="button" className={chico} onClick={() => setFilas([{ desde: "26", hasta: "", porcentaje: filas[0]?.porcentaje ?? "" }])}>Un % a partir del boleto…</button>
          <button type="button" className={chico} onClick={() => setFilas([fila()])}>Vaciar</button>
        </div>
        <p className="text-xs text-texto-3">
          Cada % se aplica solo a los boletos de su tramo. Ejemplo: del 26 al 35 al 10 % y del 36 al 45 al 20 %. Deja &quot;al boleto&quot; vacío para &quot;en adelante&quot;.
        </p>
        {error ? (
          <p role="alert" className="text-sm text-[#ff8fa3]">{error}</p>
        ) : leidos.length > 0 ? (
          <div className="rounded-xl bg-white/5 px-3 py-2 text-sm">
            <ul className="text-texto-2">{leidos.map((t) => <li key={t.desde}>{textoTramo(t)}</li>)}</ul>
            {precio > 0 && n > 0 && <p className="mt-1">Con {n} boletos de {formatMoney(precio)} se lleva <b>{formatMoney(comisionDe(Array(n).fill(precio), leidos))}</b>.</p>}
          </div>
        ) : (
          <p className="text-sm text-texto-3">{sid ? "Sin tabla propia: usa la de la obra." : "Sin tramos: nadie lleva comisión en esta obra."}</p>
        )}
      </div>
    </ActionForm>
  );
}
