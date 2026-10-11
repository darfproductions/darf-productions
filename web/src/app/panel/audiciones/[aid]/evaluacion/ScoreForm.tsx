"use client";

import { useActionState } from "react";
import { saveScore, type AudState } from "../../actions";

const CRITERIOS = [["canto", "Canto"], ["baile", "Baile"], ["actuacion", "Actuación"], ["actitud", "Actitud"]] as const;

// Calificación de un juez para una persona (1–5 por criterio + notas privadas).
export function ScoreForm({ aid, app, ronda, initial }: { aid: string; app: string; ronda: number; initial: Record<string, number | string | null> }) {
  const [state, run, pending] = useActionState<AudState, FormData>(saveScore, null);
  return (
    <form action={run} className="flex flex-col gap-3">
      {Object.entries({ aid, app, ronda: String(ronda) }).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {CRITERIOS.map(([k, label]) => (
        <fieldset key={k} className="flex flex-wrap items-center gap-2">
          <legend className="sr-only">{label}</legend>
          <span className="w-24 text-sm font-semibold">{label}</span>
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="grid h-10 w-10 cursor-pointer place-items-center rounded-full border border-white/20 text-sm font-bold has-[:checked]:border-white has-[:checked]:bg-white has-[:checked]:text-sala">
              <input type="radio" name={k} value={n} defaultChecked={Number(initial[k]) === n} className="sr-only" />{n}
            </label>
          ))}
        </fieldset>
      ))}
      <textarea name="notas" defaultValue={(initial.notas as string) ?? ""} placeholder="Notas personales (solo las ven tú y la dirección)" className="min-h-20 rounded-lg border border-white/10 bg-sala px-3 py-2 text-sm" />
      <div className="flex items-center gap-3">
        <button disabled={pending} className="rounded-full bg-texto px-5 py-2 text-sm font-bold text-sala disabled:opacity-60">{pending ? "Guardando…" : "Guardar"}</button>
        {state && <span className={`text-sm font-semibold ${state.ok ? "text-[#bbf7d0]" : "text-[#ff8fa3]"}`}>{state.message}</span>}
      </div>
    </form>
  );
}
