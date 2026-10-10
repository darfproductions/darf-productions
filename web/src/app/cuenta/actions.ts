"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type ProfileState = { ok: boolean; message: string } | null;

// Actualiza solo nombre y teléfono de la propia fila (RLS de dueño; el rol no se
// puede cambiar desde aquí: lo impide la base).
export async function saveProfile(_prev: ProfileState, form: FormData): Promise<ProfileState> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Tu sesión expiró. Vuelve a entrar." };
  const nombre = String(form.get("nombre") ?? "").trim();
  const telefono = String(form.get("telefono") ?? "").trim();
  if (!nombre) return { ok: false, message: "Escribe tu nombre." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ nombre, telefono: telefono || null })
    .eq("id", session.userId);
  if (error) return { ok: false, message: "No se pudo guardar. Intenta de nuevo." };
  revalidatePath("/cuenta");
  return { ok: true, message: "Perfil guardado." };
}
