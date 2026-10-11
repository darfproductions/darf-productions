"use client";

import { useActionState } from "react";
import { replyOffer, type OfferReply } from "./actions";

// Aceptar o declinar una oferta, con confirmación.
export function OfferReplyForm({ id, label }: { id: string; label: string }) {
  const [state, run, pending] = useActionState<OfferReply, FormData>(replyOffer, null);
  return (
    <form
      action={run}
      onSubmit={(e) => {
        const btn = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const texto = btn?.value === "aceptar" ? `¿Aceptar ${label}?` : `¿Declinar ${label}? Ya no podrás aceptarla después.`;
        if (!window.confirm(texto)) e.preventDefault();
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="id" value={id} />
      <button name="respuesta" value="aceptar" disabled={pending} className="boton-compra rounded-full px-5 py-2.5 text-sm font-bold disabled:opacity-60">Aceptar</button>
      <button name="respuesta" value="declinar" disabled={pending} className="rounded-full border border-white/30 px-5 py-2.5 text-sm font-bold disabled:opacity-60">Declinar</button>
      {state && <span role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-[#7ee2a8]" : "text-[#ff8fa3]"}`}>{state.message}</span>}
    </form>
  );
}
