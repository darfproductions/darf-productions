"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PASSWORD_AYUDA, passwordOk } from "@/lib/account-rules";
import { RECOVERY_COOKIE, RECOVERY_PATH, safeNext } from "@/lib/auth";
import { errorAuthComun, tokenCaptcha } from "@/lib/captcha";
import { origenSitio } from "@/lib/site-origin";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { ok: boolean; message: string; sinConfirmar?: boolean } | null;

export async function login(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { ok: false, message: "Escribe tu correo y contraseña." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken: tokenCaptcha(form) } });
  if (error) {
    const msg = errorAuthComun(error.message)
      ?? (/confirm/i.test(error.message)
        ? "Confirma tu correo con el enlace que te enviamos antes de entrar. ¿No te llegó? Usa “Reenviar correo de confirmación”."
        : "Correo o contraseña incorrectos.");
    return { ok: false, message: msg, sinConfirmar: /confirm/i.test(error.message) };
  }
  redirect(safeNext(String(form.get("next") ?? "")));
}

export async function register(_prev: AuthState, form: FormData): Promise<AuthState> {
  const nombre = String(form.get("nombre") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (String(form.get("sitio") ?? "")) return { ok: true, message: "Revisa tu correo para confirmar tu cuenta." }; // campo trampa para robots
  if (!nombre || !email) return { ok: false, message: "Escribe tu nombre y correo." };
  if (!passwordOk(password, email)) return { ok: false, message: `Esa contraseña no sirve. ${PASSWORD_AYUDA}` };

  const origin = await origenSitio();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { nombre }, captchaToken: tokenCaptcha(form), emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(safeNext(String(form.get("next") ?? "")))}` },
  });
  if (error) return { ok: false, message: errorAuthComun(error.message) ?? "No se pudo crear la cuenta. Revisa tus datos e intenta de nuevo." };
  if (data.session) redirect(safeNext(String(form.get("next") ?? "")));
  // Mismo mensaje si el correo ya tenía cuenta (Supabase tampoco lo revela): así nadie puede averiguar
  // qué correos están registrados.
  return { ok: true, message: `Te enviamos un enlace a ${email} para confirmar tu cuenta. Si ese correo ya tenía cuenta, entra con tu contraseña o usa “¿Olvidaste tu contraseña?”.` };
}

/** Entrar con Google (como en la 1.0). Supabase regresa a /auth/callback, que abre la sesión. */
export async function loginGoogle(form: FormData) {
  const origin = await origenSitio();
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
  (await cookies()).delete({ name: RECOVERY_COOKIE, path: RECOVERY_PATH });
  // ?salio: la portada borra la credencial guardada para sin internet (components/pwa/SinConexion.tsx).
  redirect("/?salio=1");
}

/** "Olvidé mi contraseña": manda el enlace para poner una nueva. No dice si el correo tiene cuenta. */
export async function requestReset(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim();
  if (!email) return { ok: false, message: "Escribe tu correo." };
  const origin = await origenSitio();
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/callback?next=/cuenta/contrasena`, captchaToken: tokenCaptcha(form) });
  // Solo se avisa si fue el captcha o un límite; nunca si el correo existe.
  const comun = errorAuthComun(error?.message);
  if (comun) return { ok: false, message: comun };
  return { ok: true, message: `Si ${email} tiene cuenta, te llegará un enlace para poner una contraseña nueva. Revisa también tu correo no deseado.` };
}

/** Volver a mandar el correo de confirmación de la cuenta. No dice si el correo existe. */
export async function resendConfirmation(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim();
  if (!email) return { ok: false, message: "Escribe tu correo arriba." };
  const origin = await origenSitio();
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup", email,
    options: { captchaToken: tokenCaptcha(form), emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(safeNext(String(form.get("next") ?? "")))}` },
  });
  const comun = errorAuthComun(error?.message);
  if (comun) return { ok: false, message: comun };
  return { ok: true, message: `Si ${email} tiene una cuenta sin confirmar, te mandamos de nuevo el enlace. Revisa también tu correo no deseado.` };
}
