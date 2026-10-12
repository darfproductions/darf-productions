"use client";

import Link from "next/link";
import { useActionState } from "react";
import { setNewPassword, type NewPassState } from "./actions";

const field = "rounded-lg bg-sala px-3 py-3 font-normal";

export function NewPasswordForm() {
  const [state, action, pending] = useActionState<NewPassState, FormData>(setNewPassword, null);
  if (state?.ok) return <p role="status" className="text-lg">{state.message} <Link href="/cuenta" className="underline">Ir a Mi cuenta</Link></p>;
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm font-semibold">Contraseña nueva
        <input className={field} name="nueva" type="password" required minLength={8} autoComplete="new-password" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">Repítela
        <input className={field} name="confirmar" type="password" required minLength={8} autoComplete="new-password" />
      </label>
      <p className="text-xs text-texto-3">Al menos 8 caracteres, con letras y números.</p>
      {state && <p role="alert" className="text-[#ff8fa3]">{state.message}</p>}
      <button disabled={pending} className="boton-compra rounded-full py-4 text-sm font-bold uppercase tracking-[0.1em] disabled:opacity-60">
        {pending ? "Guardando…" : "Guardar contraseña"}
      </button>
    </form>
  );
}
