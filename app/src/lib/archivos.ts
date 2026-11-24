import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { env } from "~/lib/env";
import { DarfApple } from "~/lib/nativo";
import { supabase } from "~/lib/supabase";

// Archivos y Wallet desde la app: guardar o compartir un PDF, y agregar un pase a Apple Wallet / Google Wallet.
// Los pases los arma y firma la web (las llaves de Wallet nunca están en la app): la app los pide con su sesión.

export function aBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Guarda un PDF: en el teléfono abre la hoja de compartir (Guardar en Archivos, AirDrop, WhatsApp…). */
export async function guardarPdf(bytes: Uint8Array, nombre: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { uri } = await Filesystem.writeFile({ path: nombre, data: aBase64(bytes), directory: Directory.Cache });
    await Share.share({ title: nombre, files: [uri] });
    return;
  }
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url; a.download = nombre; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export type Wallet = "apple" | "google" | null;
/** Qué Wallet ofrece este teléfono: Apple en iPhone, Google en Android. */
export const walletDelTelefono = (): Wallet => (Capacitor.getPlatform() === "ios" ? "apple" : Capacitor.getPlatform() === "android" ? "google" : null);

async function token(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Entra a tu cuenta para agregar tu pase.");
  return data.session.access_token;
}

async function mensajeDe(data: unknown, status: number): Promise<string> {
  const e = typeof data === "object" && data && "error" in data ? String((data as { error: unknown }).error) : null;
  return e ?? (status === 401 ? "Tu sesión expiró. Vuelve a entrar." : "No se pudo preparar tu pase. Intenta de nuevo.");
}

/** Agrega a Wallet la credencial ("credencial") o un boleto ("boleto/<id>"). Devuelve un texto para mostrar. */
export async function agregarAWallet(ruta: string): Promise<string> {
  const w = walletDelTelefono();
  const t = await token();
  if (w === "apple") {
    const r = await CapacitorHttp.get({ url: `${env.siteUrl}/cuenta/wallet/apple/${ruta}`, headers: { Authorization: `Bearer ${t}` }, responseType: "blob" });
    if (r.status !== 200) {
      let data: unknown = null;
      try { data = JSON.parse(atob(String(r.data))); } catch { data = r.data; }
      throw new Error(await mensajeDe(data, r.status));
    }
    const { estado } = await DarfApple.agregarPase({ datos: String(r.data) });
    return estado === "agregado" ? "Listo: ya está en tu Wallet." : estado === "ya_estaba" ? "Ya estaba en tu Wallet." : "";
  }
  if (w === "google") {
    const r = await CapacitorHttp.get({ url: `${env.siteUrl}/cuenta/wallet/google/${ruta}`, headers: { Authorization: `Bearer ${t}`, Accept: "application/json" }, responseType: "json" });
    const url = (r.data as { url?: string } | null)?.url;
    if (r.status !== 200 || !url) throw new Error(await mensajeDe(r.data, r.status));
    await Browser.open({ url });
    return "";
  }
  window.open(`${env.siteUrl}/cuenta/wallet/apple/${ruta}`, "_blank", "noopener");
  return "";
}
