"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// "staff" ya no se asigna (2026-10-15): el acceso global va por Casa DARF y el de una obra por sus Permisos.
const ROLES = ["fan", "admin"];

// Cambia el rol general de una cuenta. La base solo lo permite al Director y
// nunca deja la plataforma sin Director (0031).
export async function changeGlobalRole(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "");
  const rol = String(form.get("rol") ?? "");
  const q = String(form.get("q") ?? "");
  const back = `/panel/personas${q ? `?q=${encodeURIComponent(q)}` : ""}`;
  const sep = q ? "&" : "?";
  if (!ROLES.includes(rol)) redirect(`${back}${sep}error=${encodeURIComponent("Rol no válido.")}`);
  const supabase = await createClient();
  const { error, count } = await supabase.from("profiles").update({ rol }, { count: "exact" }).eq("id", id);
  revalidatePath("/panel/personas");
  if (error || !count) redirect(`${back}${sep}error=${encodeURIComponent(error?.message ?? "No tienes permiso para cambiar este rol.")}`);
  redirect(`${back}${sep}ok=1`);
}
