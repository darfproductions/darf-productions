"use server";

import { cookies } from "next/headers";
import { passwordOk } from "@/lib/account-rules";
import { getSession, RECOVERY_COOKIE, RECOVERY_PATH } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type NewPassState = { ok: boolean; message: string } | null;

// Contraseña nueva tras el enlace de recuperación (no pide la actual: el enlace ya lo comprobó).
export async function setNewPassword(_p: NewPassState, form: FormData): Promise<NewPassState> {
  const jar = await cookies();
  if (!jar.get(RECOVERY_COOKIE)) return { ok: false, message: "El enlace ya caducó. Pide otro desde “¿Olvidaste tu contraseña?”." };
  if (!(await getSession())) return { ok: false, message: "Tu sesión expiró. Pide otro enlace." };
  const nueva = String(form.get("nueva") ?? "");
  if (nueva !== String(form.get("confirmar") ?? "")) return { ok: false, message: "Las contraseñas no coinciden." };
  if (!passwordOk(nueva)) return { ok: false, message: "Necesita al menos 8 caracteres, con letras y números." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: nueva });
  if (error) return { ok: false, message: "No se pudo cambiar. Usa una contraseña distinta a la anterior." };
  jar.delete({ name: RECOVERY_COOKIE, path: RECOVERY_PATH });
  return { ok: true, message: "Listo, ya tienes contraseña nueva." };
}
