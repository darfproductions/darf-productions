"use client";

import { useActionState } from "react";
import { saveProfile, type ProfileState } from "./actions";

const field = "rounded-lg bg-sala px-3 py-3 font-normal";

export function ProfileForm({ nombre, telefono, email }: { nombre: string; telefono: string; email: string }) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(saveProfile, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm font-semibold">Nombre
        <input className={field} name="nombre" defaultValue={nombre} required autoComplete="name" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">Teléfono
        <input className={field} name="telefono" type="tel" defaultValue={telefono} autoComplete="tel" />
      </label>
      <p className="text-sm text-texto-3">Correo: {email}</p>
      {state && <p role={state.ok ? "status" : "alert"} className={state.ok ? "text-[#7ee2a8]" : "text-[#ff8fa3]"}>{state.message}</p>}
      <button disabled={pending} className="self-start rounded-full bg-texto px-6 py-3 text-sm font-bold text-sala disabled:opacity-60">
        {pending ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}
