"use client";

import { PasswordInput } from "@/components/PasswordInput";
import Link from "next/link";
import { useActionState, useState } from "react";
import { login, register, type AuthState } from "./actions";

const field = "rounded-lg bg-sala px-3 py-3 font-normal";

export function AuthForms({ next }: { next: string }) {
  const [tab, setTab] = useState<"entrar" | "registro">("entrar");
  const [loginState, loginAction, loginPending] = useActionState<AuthState, FormData>(login, null);
  const [regState, regAction, regPending] = useActionState<AuthState, FormData>(register, null);

  return (
    <div className="flex flex-col gap-5 rounded-2xl bg-telon p-6">
      <div role="tablist" aria-label="Acceso" className="grid grid-cols-2 gap-1 rounded-full bg-sala p-1">
        {(["entrar", "registro"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-full py-3 text-sm font-bold ${tab === t ? "bg-texto text-sala" : "text-texto-2"}`}
          >
            {t === "entrar" ? "Entrar" : "Crear cuenta"}
          </button>
        ))}
      </div>

      {tab === "entrar" ? (
        <form action={loginAction} className="flex flex-col gap-4">
          <input type="hidden" name="next" value={next} />
          <label className="flex flex-col gap-1.5 text-sm font-semibold">Correo
            <input className={field} name="email" type="email" required autoComplete="email" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">Contraseña
            <PasswordInput className={field} name="password" required autoComplete="current-password" />
          </label>
          <Link href="/entrar/recuperar" className="-mt-2 self-end text-sm text-texto-2 underline">¿Olvidaste tu contraseña?</Link>
          {loginState && !loginState.ok && <p role="alert" className="text-[#ff8fa3]">{loginState.message}</p>}
          <button disabled={loginPending} className="boton-compra rounded-full py-4 text-sm font-bold uppercase tracking-[0.1em] disabled:opacity-60">
            {loginPending ? "Entrando…" : "Entrar"}
          </button>
        </form>
      ) : regState?.ok ? (
        <p role="status" className="text-lg">{regState.message}</p>
      ) : (
        <form action={regAction} className="flex flex-col gap-4">
          <input type="hidden" name="next" value={next} />
          <input type="text" name="sitio" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
          <label className="flex flex-col gap-1.5 text-sm font-semibold">Nombre
            <input className={field} name="nombre" required autoComplete="name" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">Correo
            <input className={field} name="email" type="email" required autoComplete="email" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">Contraseña
            <PasswordInput className={field} name="password" required minLength={8} autoComplete="new-password" aria-describedby="pw-help" />
            <span id="pw-help" className="text-xs font-normal text-texto-3">Mínimo 8 caracteres, con letras y números.</span>
          </label>
          <p className="text-xs text-texto-3">Al crear tu cuenta aceptas los <a href="/terminos" target="_blank" className="underline">términos</a> y el <a href="/privacidad" target="_blank" className="underline">aviso de privacidad</a>.</p>
          {regState && !regState.ok && <p role="alert" className="text-[#ff8fa3]">{regState.message}</p>}
          <button disabled={regPending} className="boton-compra rounded-full py-4 text-sm font-bold uppercase tracking-[0.1em] disabled:opacity-60">
            {regPending ? "Creando…" : "Crear cuenta"}
          </button>
        </form>
      )}
    </div>
  );
}
