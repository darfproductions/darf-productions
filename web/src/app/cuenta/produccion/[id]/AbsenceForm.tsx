"use client";

import { useActionState } from "react";
import { sendAbsence, type AbsState } from "./actions";

// "No podré ir" a un ensayo, con motivo.
export function AbsenceForm({ pid, rid, previo }: { pid: string; rid: string; previo: string | null }) {
  const [state, run, pending] = useActionState<AbsState, FormData>(sendAbsence, null);
  return (
    <details className="text-sm" open={!!previo}>
      <summary className="cursor-pointer font-bold text-violeta-claro">{previo ? "Ya avisaste que no vas" : "No podré ir"}</summary>
      <form action={run} className="mt-2 flex flex-wrap items-center gap-2">
        <input type="hidden" name="pid" value={pid} />
        <input type="hidden" name="rid" value={rid} />
        <input name="motivo" required defaultValue={previo ?? ""} placeholder="Motivo" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-sala px-3 py-2" />
        <button disabled={pending} className="rounded-full bg-texto px-4 py-2 text-xs font-bold text-sala disabled:opacity-60">{previo ? "Actualizar" : "Avisar"}</button>
        {state && <span className={`text-xs ${state.ok ? "text-[#7ee2a8]" : "text-[#ff8fa3]"}`}>{state.message}</span>}
      </form>
    </details>
  );
}
