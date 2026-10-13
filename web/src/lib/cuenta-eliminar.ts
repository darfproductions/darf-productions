"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/errores";

// Eliminar mi cuenta (0077). La base revisa que se pueda; aquí se borra antes la foto de perfil.
export async function eliminarCuenta(_p: { ok: boolean; message: string } | null, f: FormData): Promise<{ ok: boolean; message: string } | null> {
  const confirmacion = String(f.get("confirmar") ?? "").trim().toUpperCase();
  if (confirmacion !== "ELIMINAR") return { ok: false, message: "Escribe ELIMINAR para confirmar." };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/entrar?next=/cuenta/eliminar");
  const { data: perfil } = await supabase.from("profiles").select("foto_path").eq("id", auth.user.id).maybeSingle();
  const { error } = await supabase.rpc("account_delete", { p_confirm: confirmacion });
  if (error) return { ok: false, message: mensajeError(error) };
  if (perfil?.foto_path) await supabase.storage.from("avatares").remove([perfil.foto_path as string]);
  await supabase.auth.signOut();
  redirect("/?cuenta=eliminada");
}
