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
  if (String(form.get("sitio") ?? "")) return { ok: true, message: "Revisa tu correo para confirmar tu cuenta." }; // campo trampa para robots
  if (!nombre || !email) return { ok: false, message: "Escribe tu nombre y correo." };
  if (!passwordOk(password)) return { ok: false, message: "La contraseña necesita al menos 8 caracteres, con letras y números." };

  const origin = (await headers()).get("origin") ?? "";
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { nombre }, emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(safeNext(String(form.get("next") ?? "")))}` },
  });
  if (error) return { ok: false, message: "No se pudo crear la cuenta. Revisa tus datos e intenta de nuevo." };
  // Correo ya registrado: Supabase responde sin identidades para no revelar cuentas.
  if (data.user && data.user.identities?.length === 0) {
    return { ok: false, message: "Ese correo ya tiene cuenta. Entra con tu contraseña." };
  }
  if (data.session) redirect(safeNext(String(form.get("next") ?? "")));
  return { ok: true, message: `Te enviamos un enlace a ${email}. Ábrelo para confirmar tu cuenta y luego entra.` };
}

/** Entrar con Google (como en la 1.0). Supabase regresa a /auth/callback, que abre la sesión. */
export async function loginGoogle(form: FormData) {
  const origin = (await headers()).get("origin") ?? "";
  const next = safeNext(String(form.get("next") ?? ""));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) redirect("/entrar?error=google");
  redirect(data.url);
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

/** "Olvidé mi contraseña": manda el enlace para poner una nueva. No dice si el correo tiene cuenta. */
export async function requestReset(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim();
  if (!email) return { ok: false, message: "Escribe tu correo." };
  const origin = (await headers()).get("origin") ?? "";
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/callback?next=/cuenta/contrasena` });
  return { ok: true, message: `Si ${email} tiene cuenta, te llegará un enlace para poner una contraseña nueva. Revisa también tu correo no deseado.` };
}
