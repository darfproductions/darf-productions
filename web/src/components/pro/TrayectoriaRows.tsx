"use client";

import { useState } from "react";
import { input } from "@/components/panel/ui";
import type { Trayecto } from "@/lib/pro-rules";
import { Icono } from "@/components/Icono";

const vacia: Trayecto = { obra: "", papel: "", compania: "", anio: "" };

// Filas de trayectoria externa (las obras DARF salen solas de los créditos).
export function TrayectoriaRows({ initial }: { initial: Trayecto[] }) {
  const [rows, setRows] = useState<Trayecto[]>(initial.length ? initial : [vacia]);
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[2fr_2fr_2fr_1fr_auto]">
          <input className={input} name="t_obra" defaultValue={r.obra} placeholder="Obra" aria-label="Obra" />
          <input className={input} name="t_papel" defaultValue={r.papel} placeholder="Papel" aria-label="Papel" />
          <input className={input} name="t_compania" defaultValue={r.compania} placeholder="Compañía o teatro" aria-label="Compañía" />
          <input className={input} name="t_anio" defaultValue={r.anio} placeholder="Año" inputMode="numeric" maxLength={4} aria-label="Año" />
          <button type="button" onClick={() => setRows((x) => x.filter((_, j) => j !== i))} className="rounded-full border border-white/20 px-3 text-sm" aria-label="Quitar"><Icono nombre="x" /></button>
        </div>
      ))}
      <button type="button" onClick={() => setRows((x) => [...x, vacia])} className="self-start text-sm font-bold text-violeta-claro">+ Agregar obra</button>
    </div>
  );
}
