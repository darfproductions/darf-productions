"use client";

import { PasswordInput } from "@/components/PasswordInput";
import Link from "next/link";
import { useActionState, useState } from "react";
import { login, loginGoogle, register, type AuthState } from "./actions";

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

      <form action={loginGoogle}>
        <input type="hidden" name="next" value={next} />
        <button className="flex w-full items-center justify-center gap-3 rounded-full border border-linea-2 bg-white py-3.5 text-sm font-bold text-[#1f1f1f] hover:bg-white/90">
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
          </svg>
          Continuar con Google
        </button>
      </form>
      <p className="flex items-center gap-3 text-xs text-texto-3 before:h-px before:flex-1 before:bg-linea-2 after:h-px after:flex-1 after:bg-linea-2">o con tu correo</p>

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
