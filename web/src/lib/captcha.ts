// Captcha (Turnstile) y mensajes de Supabase Auth en español (Bloque 2). Funciones puras: captcha.test.ts.

/** Token del captcha que deja el widget en el formulario; undefined si no hay (sin captcha activo). */
export function tokenCaptcha(form: FormData): string | undefined {
  const t = String(form.get("cf-turnstile-response") ?? "").trim();
  return t || undefined;
}

/** Errores de Auth que no son "datos incorrectos": captcha, límites de intentos o de correos. */
export function errorAuthComun(message: string | undefined | null): string | null {
  const m = (message ?? "").toLowerCase();
  if (m.includes("captcha")) return "No pudimos comprobar que eres una persona. Espera a que aparezca la palomita de verificación y vuelve a intentarlo.";
  if (m.includes("rate limit") || m.includes("too many") || m.includes("over_email_send_rate_limit") || m.includes("for security purposes")) {
    return "Hiciste demasiados intentos seguidos. Espera unos minutos y vuelve a intentarlo.";
  }
  return null;
}
