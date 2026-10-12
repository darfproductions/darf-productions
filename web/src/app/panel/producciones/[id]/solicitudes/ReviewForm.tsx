"use client";

import { useActionState } from "react";
import { input } from "@/components/panel/ui";
import { reviewRequest, type ReviewState } from "./actions";

const QUE_PASA: Record<string, string> = {
  falta: "Al aprobar, los ensayos quedan como falta justificada.",
  pago: "Al aprobar, el pago se registra en sus mensualidades con este monto.",
  documento: "Al aprobar, el documento queda como recibido en su expediente.",
  otro: "",
};

// Aprobar o rechazar (con respuesta) una solicitud pendiente.
export function ReviewForm({ pid, id, tipo, monto, conDoc }: { pid: string; id: string; tipo: string; monto: number | null; conDoc: boolean }) {
  const [state, run, pending] = useActionState<ReviewState, FormData>(reviewRequest, null);
  if (state?.ok) return <p role="status" className="font-bold text-[#7ee2a8]">✓ {state.message}</p>;
  const nota = tipo === "documento" && !conDoc ? "Es un documento fuera de la lista: al aprobar solo queda registrado." : QUE_PASA[tipo];
  return (
    <form action={run} className="mt-1 flex flex-col gap-2 border-t border-white/10 pt-3">
      <input type="hidden" name="pid" value={pid} />
      <input type="hidden" name="id" value={id} />
      {tipo === "pago" && (
        <label className="flex flex-wrap items-center gap-2 text-sm font-semibold">Monto a registrar
          <input name="monto" defaultValue={monto ?? ""} inputMode="decimal" className={`${input} w-32 py-1.5`} />
        </label>
      )}
      <textarea name="respuesta" rows={2} maxLength={1000} className={`${input} text-sm`} placeholder="Respuesta para el integrante (obligatoria si rechazas)" aria-label="Respuesta" />
      {nota && <p className="text-xs text-texto-3">{nota}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button name="decision" value="aprobar" disabled={pending} className="rounded-full bg-[#22c55e] px-5 py-2 text-sm font-bold text-[#052e16] disabled:opacity-60">Aprobar</button>
        <button name="decision" value="rechazar" disabled={pending} className="rounded-full border border-[#ff8fa3]/60 px-5 py-2 text-sm font-bold text-[#ff8fa3] disabled:opacity-60">Rechazar</button>
        {pending && <span className="text-xs text-texto-3">Guardando…</span>}
        {state && !state.ok && <span role="alert" className="text-sm text-[#ff8fa3]">{state.message}</span>}
      </div>
    </form>
  );
}
