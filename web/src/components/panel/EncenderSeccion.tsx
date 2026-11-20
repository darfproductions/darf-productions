"use client";

import { useState, useTransition } from "react";
import { encenderSeccion } from "@/app/panel/producciones/obra-actions";

// 0155: en una página que el tipo de obra manda a "No aplica", un aviso con "Sí aplica a esta obra".
export function EncenderSeccion({ pid, seccion, nombre, tipo }: { pid: string; seccion: string; nombre: string; tipo: string }) {
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div role="note" className="mb-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-aviso/40 bg-aviso/10 px-4 py-3 text-sm">
      <p className="min-w-0 flex-1">
        <b>{nombre}</b> normalmente no aplica a obras tipo {tipo}, por eso está en «No aplica a este tipo». ¿Esta obra sí lo usa? Enciéndelo y vuelve a su lugar.
        {msg && <span role="status" className={`ml-1 font-bold ${msg.ok ? "text-exito" : "text-[#ff8fa3]"}`}>{msg.t}</span>}
      </p>
      <button type="button" disabled={pending} onClick={() => start(async () => {
        const r = await encenderSeccion(pid, seccion).catch(() => ({ ok: false, message: "No se pudo. Intenta de nuevo." }));
        setMsg({ ok: r.ok, t: r.message });
      })} className="shrink-0 rounded-full bg-texto px-4 py-2 text-xs font-bold text-sala disabled:opacity-60">
        {pending ? "Encendiendo…" : "Sí aplica a esta obra"}
      </button>
    </div>
  );
}
