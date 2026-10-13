"use client";

import { useActionState } from "react";
import { Turnstile } from "@/components/Turnstile";
import { requestReset, type AuthState } from "../actions";

export function ResetForm({ captcha }: { captcha: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(requestReset, null);
  if (state?.ok) return <p role="status" className="text-lg">{state.message}</p>;
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm font-semibold">Correo
        <input className="rounded-lg bg-sala px-3 py-3 font-normal" name="email" type="email" required autoComplete="email" />
      </label>
      <Turnstile siteKey={captcha} reinicio={state} />
      {state && <p role="alert" className="text-[#ff8fa3]">{state.message}</p>}
      <button disabled={pending} className="boton-compra rounded-full py-4 text-sm font-bold uppercase tracking-[0.1em] disabled:opacity-60">
        {pending ? "Enviando…" : "Mandar enlace"}
      </button>
    </form>
  );
}
