"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Marcar leídas y borrar (solo las propias: RLS y permiso solo sobre read_at).
type State = { ok: boolean; message: string } | null;

// Las mismas notificaciones se ven en el panel y en Mi cuenta.
const refresh = () => { revalidatePath("/panel", "layout"); revalidatePath("/cuenta", "layout"); };

export async function markNotification(_p: State, f: FormData): Promise<State> {
  const supabase = await createClient();
  const leer = f.get("leer") !== "0";
  const { error } = await supabase.from("notifications").update({ read_at: leer ? new Date().toISOString() : null }).eq("id", Number(f.get("id")));
  if (error) return { ok: false, message: error.message };
  refresh();
  return { ok: true, message: leer ? "Leída." : "Sin leer." };
}

export async function markAllNotifications(): Promise<State> {
  const supabase = await createClient();
  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  if (error) return { ok: false, message: error.message };
  refresh();
  return { ok: true, message: "Todas leídas." };
}

export async function deleteNotification(_p: State, f: FormData): Promise<State> {
  const supabase = await createClient();
  const { error } = await supabase.from("notifications").delete().eq("id", Number(f.get("id")));
  if (error) return { ok: false, message: error.message };
  refresh();
  return { ok: true, message: "Borrada." };
}

export async function deleteReadNotifications(): Promise<State> {
  const supabase = await createClient();
  const { error } = await supabase.from("notifications").delete().not("read_at", "is", null);
  if (error) return { ok: false, message: error.message };
  refresh();
  return { ok: true, message: "Se borraron las leídas." };
}
