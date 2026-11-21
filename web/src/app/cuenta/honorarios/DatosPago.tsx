"use client";

import { useActionState, useState } from "react";
import { bancoDeClabe, clabeValida, formatearClabe, limpiarClabe } from "@/lib/clabe-rules";
import { guardarDatosPago, type DatosPagoState } from "./actions";

export type DatosPagoFila = { metodo: "transferencia" | "efectivo"; titular: string | null; banco: string | null; clabe: string | null } | null;
const campo = "rounded-lg border border-white/10 bg-sala px-3 py-2.5 font-normal text-texto";

// 0161: cómo quiero cobrar mis honorarios. La CLABE se revisa al escribirla y el banco se adivina por sus dígitos.
export function DatosPago({ inicial }: { inicial: DatosPagoFila }) {
  const [state, run, pending] = useActionState<DatosPagoState, FormData>(guardarDatosPago, null);
  const [metodo, setMetodo] = useState<"transferencia" | "efectivo">(inicial?.metodo ?? "transferencia");
  const [clabe, setClabe] = useState(inicial?.clabe ? formatearClabe(inicial.clabe) : "");
  const [banco, setBanco] = useState(inicial?.banco ?? "");
  const d = limpiarClabe(clabe);
  const aviso = d.length === 0 ? null : d.length < 18 ? `${d.length} de 18 dígitos` : clabeValida(d) ? null : "Esta CLABE no es válida: revisa los dígitos.";
  return (
    <form action={run} className="flex flex-col gap-4">
      <fieldset className="flex flex-wrap gap-2">
        <legend className="mb-2 text-sm font-semibold">¿Cómo prefieres que te paguen?</legend>
        {(["transferencia", "efectivo"] as const).map((m) => (
          <label key={m} className="flex cursor-pointer items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm font-bold has-[:checked]:border-texto has-[:checked]:bg-telon-2">
            <input type="radio" name="metodo" value={m} checked={metodo === m} onChange={() => setMetodo(m)} /> {m === "transferencia" ? "Transferencia" : "Efectivo"}
          </label>
        ))}
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-semibold sm:col-span-2">CLABE {metodo === "transferencia" ? "*" : "(opcional)"}
          <input className={`${campo} font-mono tracking-wider`} name="clabe" inputMode="numeric" autoComplete="off" value={clabe} placeholder="18 dígitos"
            onChange={(e) => { setClabe(e.target.value); const b = bancoDeClabe(e.target.value); if (b && !banco) setBanco(b); }} />
          {aviso && <span className="text-xs font-normal text-aviso">{aviso}</span>}
          {d.length === 18 && !aviso && <span className="text-xs font-normal text-exito">CLABE válida{bancoDeClabe(d) ? ` · ${bancoDeClabe(d)}` : ""}</span>}
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">Titular de la cuenta<input className={campo} name="titular" defaultValue={inicial?.titular ?? ""} placeholder="Como aparece en el banco" /></label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">Banco<input className={campo} name="banco" value={banco} onChange={(e) => setBanco(e.target.value)} /></label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending || (metodo === "transferencia" && (d.length !== 18 || !!aviso))} className="rounded-full bg-texto px-5 py-2.5 text-sm font-bold text-sala disabled:opacity-60">
          {pending ? "Guardando…" : "Guardar"}
        </button>
        {state && <span role="status" className={`text-sm font-semibold ${state.ok ? "text-exito" : "text-[#ff8fa3]"}`}>{state.message}</span>}
      </div>
      <p className="text-xs text-texto-3">Solo la ven las cabezas de DARF para hacerte los depósitos.</p>
    </form>
  );
}
