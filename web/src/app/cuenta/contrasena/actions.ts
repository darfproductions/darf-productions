"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PASSWORD_AYUDA, passwordOk } from "@/lib/account-rules";
import { getSession, RECOVERY_COOKIE, RECOVERY_PATH } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type NewPassState = { ok: boolean; message: string } | null;

// Contraseña nueva tras el enlace de recuperación (no pide la actual: el enlace ya lo comprobó).
export async function setNewPassword(_p: NewPassState, form: FormData): Promise<NewPassState> {
  const jar = await cookies();
  const session = await getSession();
  if (!session) return { ok: false, message: "Tu sesión expiró. Pide otro enlace." };
  // La cookie del enlace es de UNA cuenta: si alguien más entra en ese navegador, no le sirve.
  if (jar.get(RECOVERY_COOKIE)?.value !== session.userId) return { ok: false, message: "El enlace ya caducó. Pide otro desde “¿Olvidaste tu contraseña?”." };
  const nueva = String(form.get("nueva") ?? "");
  if (nueva !== String(form.get("confirmar") ?? "")) return { ok: false, message: "Las contraseñas no coinciden." };
  if (!passwordOk(nueva, session.email)) return { ok: false, message: `Esa contraseña no sirve. ${PASSWORD_AYUDA}` };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: nueva });
  if (error) return { ok: false, message: "No se pudo cambiar. Usa una contraseña distinta a la anterior." };
  jar.delete({ name: RECOVERY_COOKIE, path: RECOVERY_PATH });
  // Si alguien más tenía tu sesión abierta en otro aparato, se cierra.
  await supabase.auth.signOut({ scope: "others" });
  // Al borrar el permiso del enlace la página cambia; se manda a la confirmación.
  redirect(`${RECOVERY_PATH}?listo=1`);
}
