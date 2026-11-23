import QRCode from "qrcode";
import type { CredencialMia } from "@/lib/credencial-rules";
import { ligaGafete } from "@/lib/gafete-rules";
import type { ComisionRow } from "@/lib/comision-rules";
import type { MySale } from "@/lib/seller-rules";
import { env } from "~/lib/env";
import { supabase } from "~/lib/supabase";

// Datos de "Mi cuenta": las mismas lecturas que la web (web/src/lib/auth.ts, credencial.ts, app/cuenta/page.tsx),
// directo a la base con la sesión de la persona; RLS y las funciones de la base deciden qué ve cada quien.

export type Perfil = {
  id: string; nombre: string | null; telefono: string | null; rol: string | null;
  nombres: string | null; apellidos: string | null; fecha_nacimiento: string | null; foto_path: string | null;
};

export async function leerPerfil(uid: string): Promise<Perfil | null> {
  const { data } = await supabase.from("profiles").select("id, nombre, telefono, rol, nombres, apellidos, fecha_nacimiento, foto_path").eq("id", uid).maybeSingle();
  return (data as Perfil | null) ?? null;
}

/** Foto de perfil (bucket privado "avatares") como liga firmada por 1 h. */
export async function fotoPerfil(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from("avatares").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export type Credencial = CredencialMia & { qr: string; liga: string };

/** Mi credencial (la base la crea la primera vez) con su QR listo. null si es la cuenta de la empresa. */
export async function leerCredencial(): Promise<Credencial | null> {
  const { data } = await supabase.rpc("credencial_mia");
  if (!data) return null;
  const c = data as CredencialMia;
  const liga = ligaGafete(env.siteUrl, c.token);
  const qr = await QRCode.toDataURL(liga, { margin: 1, width: 480, errorCorrectionLevel: "M" });
  return { ...c, qr, liga };
}

export type ResumenCuenta = {
  perfil: Perfil | null;
  foto: string | null;
  credencial: Credencial | null;
  socio: boolean;
  ventas: MySale[];
  comisiones: (ComisionRow & { production_id: string })[];
  honorarios: boolean;
};

export async function leerResumen(uid: string): Promise<ResumenCuenta> {
  const [perfil, credencial, socio, ventas, comisiones, hon] = await Promise.all([
    leerPerfil(uid),
    leerCredencial().catch(() => null),
    supabase.rpc("is_fan_member"),
    supabase.rpc("my_seller"),
    supabase.rpc("mi_comision"),
    supabase.rpc("mis_honorarios_aplica"),
  ]);
  return {
    perfil,
    foto: await fotoPerfil(perfil?.foto_path),
    credencial,
    socio: socio.data === true,
    ventas: (ventas.data ?? []) as MySale[],
    comisiones: (comisiones.data ?? []) as (ComisionRow & { production_id: string })[],
    honorarios: hon.data === true,
  };
}

/** Imagen de la web: las medallas se generan en el servidor de la web (/medalla/12); el resto viene en la app. */
export function srcMarca(src: string): string {
  return src.startsWith("/medalla/") ? env.siteUrl + src : src;
}
