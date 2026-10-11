"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type MemberState = { ok: boolean; message: string } | null;

// La base decide (panel_add_member exige permisos.gestionar en ESTA obra).
export async function addMember(_prev: MemberState, form: FormData): Promise<MemberState> {
  const pid = String(form.get("pid") ?? "");
  const email = String(form.get("email") ?? "").trim();
  const role = String(form.get("role") ?? "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, message: "Escribe un correo válido." };
  if (!role) return { ok: false, message: "Elige un rol." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("panel_add_member", { pid, p_email: email, p_role: role });
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/panel/producciones/${pid}`, "layout");
  return data
    ? { ok: true, message: `Listo: ${email} ya tiene el rol.` }
    : { ok: true, message: `${email} ya tenía ese rol.` };
}

export async function removeMember(form: FormData): Promise<void> {
  const pid = String(form.get("pid") ?? "");
  const id = String(form.get("id") ?? "");
  const supabase = await createClient();
  // La regla RLS solo deja borrar con permisos.gestionar en la obra.
  await supabase.from("production_members").delete().eq("id", id).eq("production_id", pid);
  revalidatePath(`/panel/producciones/${pid}`, "layout");
}
