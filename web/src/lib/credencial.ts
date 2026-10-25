import QRCode from "qrcode";
import { cache } from "react";
import { getSession } from "@/lib/auth";
import { avatarUrl } from "@/lib/avatar";
import type { CredencialMia } from "@/lib/credencial-rules";
import { origen } from "@/lib/gafete";
import { ligaGafete } from "@/lib/gafete-rules";
import { createClient } from "@/lib/supabase/server";

// Credencial única (0083): lecturas del servidor.

export type MiCredencialVista = CredencialMia & { nombre: string; fotoUrl: string | null; qr: string; liga: string };

/** Mi credencial (cualquier cuenta; la base la crea la primera vez) con foto y QR listos. */
// Una vez por página (Fan Zone la pide dos veces); la sesión, el perfil y la foto son los mismos del encabezado.
export const getMiCredencial = cache(async function getMiCredencial(): Promise<MiCredencialVista | null> {
  const supabase = await createClient();
  const [{ data }, session] = await Promise.all([supabase.rpc("credencial_mia"), getSession()]);
  if (!data) return null;
  const c = data as CredencialMia;
  const fotoUrl = await avatarUrl(session?.profile?.foto_path);
  const liga = ligaGafete(await origen(), c.token);
  const qr = await QRCode.toDataURL(liga, { margin: 1, width: 480, errorCorrectionLevel: "M" });
  return { ...c, nombre: session?.profile?.nombre ?? "", fotoUrl, qr, liga };
});

/** ¿Cuenta como socio del Club Fan? (socios, y también el equipo y los elencos). */
export const esSocio = cache(async function esSocio(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_fan_member");
  return data === true;
});

/** ¿Es la cuenta de la empresa (0111)? No tiene Club Fan, credencial ni Wallet. */
export async function esCuentaEmpresa(): Promise<boolean> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return false;
  const { data } = await supabase.rpc("es_cuenta_empresa", { uid: auth.user.id });
  return data === true;
}
