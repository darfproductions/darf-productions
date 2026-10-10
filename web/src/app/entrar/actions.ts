"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { ok: boolean; message: string } | null;

const passwordOk = (p: string) => p.length >= 8 && /[A-Za-z]/.test(p) && /[0-9]/.test(p);

export async function login(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { ok: false, message: "Escribe tu correo y contraseña." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const msg = /confirm/i.test(error.message)
      ? "Confirma tu correo con el enlace que te enviamos antes de entrar."
      : "Correo o contraseña incorrectos.";
    return { ok: false, message: msg };
  }
  redirect(safeNext(String(form.get("next") ?? "")));
}

export async function register(_prev: AuthState, form: FormData): Promise<AuthState> {
  const nombre = String(form.get("nombre") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!nombre || !email) return { ok: false, message: "Escribe tu nombre y correo." };
  if (!passwordOk(password)) return { ok: false, message: "La contraseña necesita al menos 8 caracteres, con letras y números." };

  const origin = (await headers()).get("origin") ?? "";
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { nombre }, emailRedirectTo: `${origin}/auth/callback?next=/cuenta` },
  });
  if (error) return { ok: false, message: "No se pudo crear la cuenta. Revisa tus datos e intenta de nuevo." };
  // Correo ya registrado: Supabase responde sin identidades para no revelar cuentas.
  if (data.user && data.user.identities?.length === 0) {
    return { ok: false, message: "Ese correo ya tiene cuenta. Entra con tu contraseña." };
  }
  if (data.session) redirect("/cuenta");
  return { ok: true, message: `Te enviamos un enlace a ${email}. Ábrelo para confirmar tu cuenta y luego entra.` };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
