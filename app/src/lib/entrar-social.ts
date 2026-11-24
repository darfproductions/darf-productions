import { Capacitor } from "@capacitor/core";
import { DarfApple } from "~/lib/nativo";
import { Browser } from "@capacitor/browser";
import { supabase } from "~/lib/supabase";

// Entrar con Google y con Apple.
//
// Página del proveedor (Google en todos lados; Apple en Android y en el navegador): el flujo OAuth con PKCE de
// Supabase. En el teléfono se abre la página en el navegador del sistema y Supabase regresa a la app con el enlace
// REGRESO (com.darfproductions.app://…); `completarRegreso` cambia el código por la sesión. Son los mismos
// proveedores que usa la web (Apple: Services ID com.darfproductions.web).
//
// Apple en iPhone: la ventana nativa (complemento propio en plugins/darf-apple) entrega un token que Supabase
// acepta con signInWithIdToken (Client ID com.darfproductions.app).

export const ESQUEMA = "com.darfproductions.app";
export const REGRESO = `${ESQUEMA}://auth/callback`;



/** En iPhone, Apple usa la ventana nativa (y la base pide captcha); en lo demás, la página de Apple. */
export const appleNativo = () => Capacitor.getPlatform() === "ios";

/** Abre la página de Google o de Apple. La sesión se completa al regresar (completarRegreso). */
export async function entrarConPagina(provider: "google" | "apple"): Promise<void> {
  const nativo = Capacitor.isNativePlatform();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: nativo ? REGRESO : `${window.location.origin}/acceso`,
      skipBrowserRedirect: nativo,
      queryParams: provider === "google" ? { prompt: "select_account" } : undefined,
    },
  });
  if (error) throw error;
  if (nativo && data.url) await Browser.open({ url: data.url, presentationStyle: "popover" });
}

/** Cambia el código del enlace de regreso por la sesión. true si había algo que completar. */
export async function completarRegreso(url: string): Promise<boolean> {
  const u = new URL(url);
  const code = u.searchParams.get("code");
  const error = u.searchParams.get("error_description") ?? u.searchParams.get("error");
  if (!code && !error) return false;
  if (Capacitor.isNativePlatform()) await Browser.close().catch(() => {});
  if (error) throw new Error(error);
  const r = await supabase.auth.exchangeCodeForSession(code!);
  if (r.error) throw r.error;
  return true;
}

/** Ventana nativa de Apple (iPhone) → sesión de Supabase. `captcha`: la base pide Turnstile para entrar con token. */
export async function entrarConAppleNativo(captcha: string | undefined): Promise<void> {
  const nonce = aleatorio();
  const apple = await DarfApple.entrar({ nonce: await sha256(nonce) });
  const { error } = await supabase.auth.signInWithIdToken({ provider: "apple", token: apple.identityToken, nonce, options: { captchaToken: captcha } });
  if (error) throw error;
  // Apple solo da el nombre la primera vez: se guarda en la cuenta, igual que al registrarse en la web.
  const nombre = [apple.nombre, apple.apellido].filter(Boolean).join(" ").trim();
  if (nombre) await supabase.auth.updateUser({ data: { nombre } });
}

export function cancelado(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code?: string }).code === "CANCELADO";
}

function aleatorio(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

async function sha256(texto: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(h), (x) => x.toString(16).padStart(2, "0")).join("");
}
