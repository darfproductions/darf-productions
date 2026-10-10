"use client";

import { useActionState } from "react";
import { sendContact, type ContactState } from "./actions";

const field = "rounded-lg bg-sala px-3 py-3 font-normal";

export function ContactForm() {
  const [state, action, pending] = useActionState<ContactState, FormData>(sendContact, null);
  if (state?.ok) {
    return <p role="status" className="rounded-2xl bg-telon p-6 text-lg">{state.message}</p>;
  }
  return (
    <form action={action} className="grid gap-4 rounded-2xl bg-telon p-6 sm:grid-cols-2">
      <label className="flex flex-col gap-1.5 text-sm font-semibold">Nombre *
        <input className={field} name="nombre" required autoComplete="name" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">Correo *
        <input className={field} name="correo" type="email" required autoComplete="email" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">Teléfono
        <input className={field} name="telefono" type="tel" autoComplete="tel" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">Asunto
        <input className={field} name="asunto" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold sm:col-span-2">Mensaje *
        <textarea className={`${field} min-h-36`} name="mensaje" required maxLength={4000} />
      </label>
      {state && !state.ok && <p role="alert" className="text-[#ff8fa3] sm:col-span-2">{state.message}</p>}
      <button disabled={pending} className="boton-compra rounded-full px-6 py-4 text-sm font-bold uppercase tracking-[0.1em] disabled:opacity-60 sm:col-span-2">
        {pending ? "Enviando…" : "Enviar mensaje"}
      </button>
    </form>
  );
}
