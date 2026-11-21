import { Capacitor, registerPlugin } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { supabase } from "~/lib/supabase";

// Entrar con Google y con Apple.
//
// Google (iPhone, Android y navegador): el flujo OAuth con PKCE de Supabase. En el teléfono se abre la pantalla de
// Google en el navegador del sistema y Supabase regresa a la app con el enlace REGRESO (com.darfproductions.app://…);
// `completarRegreso` cambia el código por la sesión. Usa el mismo proveedor de Google que ya usa la web.
//
// Apple (solo iPhone): la ventana nativa de Apple (complemento propio en plugins/darf-apple) entrega un token que
// Supabase acepta con signInWithIdToken. Apple solo exige su botón en iOS; en Android no se ofrece.

export const ESQUEMA = "com.darfproductions.app";
export const REGRESO = `${ESQUEMA}://auth/callback`;

type RespuestaApple = { identityToken: string; nombre: string; apellido: string; correo: string };
const DarfApple = registerPlugin<{ entrar(o: { nonce: string }): Promise<RespuestaApple> }>("DarfApple");

export const appleDisponible = () => Capacitor.getPlatform() === "ios";

/** Abre la pantalla de Google. La sesión se completa al regresar (completarRegreso). */
export async function entrarConGoogle(): Promise<void> {
  const nativo = Capacitor.isNativePlatform();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: nativo ? REGRESO : `${window.location.origin}/acceso`,
      skipBrowserRedirect: nativo,
      queryParams: { prompt: "select_account" },
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

/** Ventana nativa de Apple → sesión de Supabase. `captcha`: la base pide Turnstile para entrar con token. */
export async function entrarConApple(captcha: string | undefined): Promise<void> {
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
