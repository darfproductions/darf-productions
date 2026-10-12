"use client";

import { PasswordInput } from "@/components/PasswordInput";
import { useActionState } from "react";
import { changeEmail, changePassword, saveProfile, type ProfileState } from "./actions";

const field = "rounded-lg bg-sala px-3 py-3 font-normal";
const btn = "self-start rounded-full bg-texto px-6 py-3 text-sm font-bold text-sala disabled:opacity-60";
const ghost = "self-start rounded-full border border-white/30 px-5 py-2.5 text-sm font-bold disabled:opacity-60";

function Msg({ s }: { s: ProfileState }) {
  if (!s) return null;
  return <p role={s.ok ? "status" : "alert"} className={`text-sm ${s.ok ? "text-[#7ee2a8]" : "text-[#ff8fa3]"}`}>{s.message}</p>;
}

export function ProfileForm(p: { nombres: string; apellidos: string; telefono: string; fecha: string }) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(saveProfile, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
        <label className="flex flex-col gap-1.5 text-sm font-semibold">Nombre(s)
          <input className={field} name="nombres" defaultValue={p.nombres} required maxLength={80} autoComplete="given-name" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">Apellidos
          <input className={field} name="apellidos" defaultValue={p.apellidos} maxLength={80} autoComplete="family-name" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">Teléfono
          <input className={field} name="telefono" type="tel" defaultValue={p.telefono} autoComplete="tel" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">Fecha de nacimiento
          <input className={field} name="fecha_nacimiento" type="date" defaultValue={p.fecha} min="1900-01-01" max={new Date().toISOString().slice(0, 10)} autoComplete="bday" />
        </label>
      </div>
      <p className="text-xs text-texto-3">Tu fecha de nacimiento es la misma de tu expediente si estás en un elenco. Tu producción solo ve el día y el mes.</p>
      <Msg s={state} />
      <button disabled={pending} className={btn}>{pending ? "Guardando…" : "Guardar"}</button>
    </form>
  );
}

export function EmailForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(changeEmail, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <p className="text-sm text-texto-2">Correo actual: <b className="text-texto">{email}</b></p>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">Correo nuevo
        <input className={field} name="email" type="email" required autoComplete="email" />
      </label>
      <Msg s={state} />
      <button disabled={pending} className={ghost}>{pending ? "Enviando…" : "Cambiar correo"}</button>
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState<ProfileState, FormData>(changePassword, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm font-semibold">Contraseña actual
        <PasswordInput className={field} name="actual" required autoComplete="current-password" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">Contraseña nueva
        <PasswordInput className={field} name="nueva" required minLength={8} autoComplete="new-password" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">Repite la nueva
        <PasswordInput className={field} name="confirmar" required minLength={8} autoComplete="new-password" />
      </label>
      <p className="text-xs text-texto-3">Al menos 8 caracteres, con letras y números.</p>
      <Msg s={state} />
      <button disabled={pending} className={ghost}>{pending ? "Cambiando…" : "Cambiar contraseña"}</button>
    </form>
  );
}
