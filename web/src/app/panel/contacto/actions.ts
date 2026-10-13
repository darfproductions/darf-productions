"use server";

import { revalidatePath } from "next/cache";
import { mensajeError } from "@/lib/errores";
import { createClient } from "@/lib/supabase/server";

type State = { ok: boolean; message: string } | null;

export async function markContactRead(_p: State, f: FormData): Promise<State> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_contact_message_read", { target_id: String(f.get("id")) });
  if (error) return { ok: false, message: mensajeError(error) };
  revalidatePath("/panel/contacto");
  return { ok: true, message: "Leído." };
}

// 0096: asignar a alguien del equipo (le llega aviso), marcar respondido y reabrir.
export async function asignarContacto(_p: State, f: FormData): Promise<State> {
  const supabase = await createClient();
  const uid = String(f.get("uid") ?? "");
  const { error } = await supabase.rpc("contact_asignar", { p_id: String(f.get("id")), p_uid: uid || null });
  if (error) return { ok: false, message: mensajeError(error) };
  revalidatePath("/panel/contacto");
  return { ok: true, message: uid ? "Asignado. Le llegó un aviso." : "Sin asignar." };
}

export async function responderContacto(_p: State, f: FormData): Promise<State> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("contact_responder", { p_id: String(f.get("id")), p_canal: String(f.get("canal") ?? ""), p_nota: String(f.get("nota") ?? "") });
  if (error) return { ok: false, message: mensajeError(error) };
  revalidatePath("/panel/contacto");
  return { ok: true, message: "Marcado como respondido." };
}

export async function reabrirContacto(_p: State, f: FormData): Promise<State> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("contact_reabrir", { p_id: String(f.get("id")) });
  if (error) return { ok: false, message: mensajeError(error) };
  revalidatePath("/panel/contacto");
  return { ok: true, message: "Reabierto." };
}
