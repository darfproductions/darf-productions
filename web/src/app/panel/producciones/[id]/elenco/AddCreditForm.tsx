"use client";

import { useActionState, useRef } from "react";
import { Notice, button, input } from "@/components/panel/ui";
import { addCredit, type CreditState } from "./actions";

// Agregar a alguien a un grupo. El nombre sugiere personas ya registradas para no duplicarlas.
export function AddCreditForm({ pid, tipo, papelLabel, listId }: { pid: string; tipo: string; papelLabel: string | null; listId: string }) {
  const form = useRef<HTMLFormElement>(null);
  const [state, run, pending] = useActionState<CreditState, FormData>(async (prev, f) => {
    const r = await addCredit(prev, f);
    if (r?.ok) form.current?.reset();
    return r;
  }, null);
  return (
    <form ref={form} action={run} className="flex flex-col gap-2">
      <input type="hidden" name="pid" value={pid} />
      <input type="hidden" name="tipo" value={tipo} />
      <div className={`grid gap-2 ${papelLabel ? "sm:grid-cols-[1fr_1fr_auto]" : "sm:grid-cols-[1fr_auto]"}`}>
        <input className={input} name="nombre" list={listId} placeholder="Nombre completo" autoComplete="off" required />
        {papelLabel && <input className={input} name="papel" placeholder={papelLabel} required />}
        <button disabled={pending} className={button}>{pending ? "…" : "Agregar"}</button>
      </div>
      {state && <Notice ok={state.ok}>{state.message}</Notice>}
    </form>
  );
}
