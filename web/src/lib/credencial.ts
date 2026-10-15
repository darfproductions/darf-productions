import QRCode from "qrcode";
import type { CredencialMia } from "@/lib/credencial-rules";
import { origen } from "@/lib/gafete";
import { ligaGafete } from "@/lib/gafete-rules";
import { createClient } from "@/lib/supabase/server";

// Credencial única (0083): lecturas del servidor.

export type MiCredencialVista = CredencialMia & { nombre: string; fotoUrl: string | null; qr: string; liga: string };

/** Mi credencial (cualquier cuenta; la base la crea la primera vez) con foto y QR listos. */
export async function getMiCredencial(): Promise<MiCredencialVista | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("credencial_mia");
  if (!data) return null;
  const c = data as CredencialMia;
  const { data: auth } = await supabase.auth.getUser();
  const { data: perfil } = await supabase.from("profiles").select("nombre, foto_path").eq("id", auth.user?.id ?? "").maybeSingle();
  const fotoUrl = perfil?.foto_path ? (await supabase.storage.from("avatares").createSignedUrl(perfil.foto_path as string, 3600)).data?.signedUrl ?? null : null;
  const liga = ligaGafete(await origen(), c.token);
  const qr = await QRCode.toDataURL(liga, { margin: 1, width: 480, errorCorrectionLevel: "M" });
  return { ...c, nombre: (perfil?.nombre as string | null) ?? "", fotoUrl, qr, liga };
}

/** ¿Cuenta como socio del Club Fan? (socios, y también el equipo y los elencos). */
export async function esSocio(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_fan_member");
  return data === true;
}

/** ¿Es la cuenta de la empresa (0111)? No tiene Club Fan, credencial ni Wallet. */
export async function esCuentaEmpresa(): Promise<boolean> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return false;
  const { data } = await supabase.rpc("es_cuenta_empresa", { uid: auth.user.id });
  return data === true;
}
