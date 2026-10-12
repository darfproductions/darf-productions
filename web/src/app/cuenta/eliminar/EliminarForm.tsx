"use client";

import { useActionState, useState } from "react";
import { eliminarCuenta } from "@/lib/cuenta-eliminar";

export function EliminarForm() {
  const [state, run, pending] = useActionState(eliminarCuenta, null);
  const [txt, setTxt] = useState("");
  return (
    <form action={run} onSubmit={(e) => { if (!window.confirm("¿Eliminar tu cuenta para siempre? No se puede deshacer.")) e.preventDefault(); }} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm font-semibold">Escribe ELIMINAR para confirmar
        <input name="confirmar" value={txt} onChange={(e) => setTxt(e.target.value)} autoComplete="off" className="rounded-lg bg-sala px-3 py-3 font-normal" />
      </label>
      {state && !state.ok && <p role="alert" className="rounded-xl border border-[#ff8fa3]/40 bg-[#3a1220] px-4 py-3 text-sm">{state.message}</p>}
      <button disabled={pending || txt.trim().toUpperCase() !== "ELIMINAR"} className="self-start rounded-full bg-[#be123c] px-6 py-3.5 text-sm font-bold text-white disabled:opacity-50">
        {pending ? "Eliminando…" : "Eliminar mi cuenta"}
      </button>
    </form>
  );
}
