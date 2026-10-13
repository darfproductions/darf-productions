"use server";

import { revalidatePath } from "next/cache";
import { roleDiff } from "@/lib/panel-nav";
import { mensajeError } from "@/lib/errores";
import { createClient } from "@/lib/supabase/server";

export type MemberState = { ok: boolean; message: string } | null;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Una persona puede tener varios roles en la obra; suma los permisos de todos.
// La base decide: panel_add_member y el borrado exigen permisos.gestionar en ESTA obra.
export async function addMember(_prev: MemberState, form: FormData): Promise<MemberState> {
  const pid = String(form.get("pid") ?? "");
  const email = String(form.get("email") ?? "").trim();
  const roles = form.getAll("role").map(String);
  if (!EMAIL.test(email)) return { ok: false, message: "Escribe un correo válido." };
  if (!roles.length) return { ok: false, message: "Marca al menos un rol." };
  const supabase = await createClient();
  const nuevos: string[] = [];
  const yaTenia: string[] = [];
  for (const role of roles) {
    const { data, error } = await supabase.rpc("panel_add_member", { pid, p_email: email, p_role: role });
    if (error) {
      revalidatePath(`/panel/producciones/${pid}`, "layout");
      return { ok: false, message: mensajeError(error) };
    }
    (data ? nuevos : yaTenia).push(role);
  }
  revalidatePath(`/panel/producciones/${pid}`, "layout");
  const nombres = await roleNames([...nuevos, ...yaTenia]);
  const partes = [
    nuevos.length ? `ahora tiene ${nuevos.map((r) => nombres.get(r) ?? r).join(", ")}` : "",
    yaTenia.length ? `ya tenía ${yaTenia.map((r) => nombres.get(r) ?? r).join(", ")}` : "",
  ].filter(Boolean);
  return { ok: true, message: `Listo: ${email} ${partes.join("; ")}.` };
}

/** Deja a la persona exactamente con los roles marcados (agrega los nuevos, quita los desmarcados). */
export async function setMemberRoles(_prev: MemberState, form: FormData): Promise<MemberState> {
  const pid = String(form.get("pid") ?? "");
  const userId = String(form.get("user_id") ?? "");
  const email = String(form.get("email") ?? "");
  const deseados = form.getAll("role").map(String);
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("production_members")
    .select("id, role_id")
    .eq("production_id", pid)
    .eq("user_id", userId);
  if (error) return { ok: false, message: mensajeError(error) };
  const { agregar, quitar } = roleDiff((rows ?? []).map((r) => r.role_id as string), deseados);
  for (const role of agregar) {
    const { error: e } = await supabase.rpc("panel_add_member", { pid, p_email: email, p_role: role });
    if (e) return { ok: false, message: mensajeError(e) };
  }
  if (quitar.length) {
    const ids = (rows ?? []).filter((r) => quitar.includes(r.role_id as string)).map((r) => r.id as string);
    const { error: e, count } = await supabase.from("production_members").delete({ count: "exact" }).in("id", ids).eq("production_id", pid);
    if (e) return { ok: false, message: mensajeError(e) };
    if (count !== ids.length) {
      revalidatePath(`/panel/producciones/${pid}`, "layout");
      return { ok: false, message: "No se pudieron quitar todos los roles: revisa tus permisos en esta obra." };
    }
  }
  revalidatePath(`/panel/producciones/${pid}`, "layout");
  if (!agregar.length && !quitar.length) return { ok: true, message: "Sin cambios." };
  return { ok: true, message: deseados.length ? "Roles actualizados." : "Se quitó a la persona de esta obra." };
}

export async function removeMember(_prev: MemberState, form: FormData): Promise<MemberState> {
  const pid = String(form.get("pid") ?? "");
  const id = String(form.get("id") ?? "");
  const supabase = await createClient();
  // La regla RLS solo deja borrar con permisos.gestionar en la obra: sin permiso borra 0 filas.
  const { error, count } = await supabase.from("production_members").delete({ count: "exact" }).eq("id", id).eq("production_id", pid);
  if (error) return { ok: false, message: mensajeError(error) };
  if (!count) return { ok: false, message: "No tienes permiso para quitar roles en esta obra." };
  revalidatePath(`/panel/producciones/${pid}`, "layout");
  return { ok: true, message: "Rol quitado." };
}

async function roleNames(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const supabase = await createClient();
  const { data } = await supabase.from("panel_roles").select("id, nombre").in("id", ids);
  return new Map((data ?? []).map((r) => [r.id as string, r.nombre as string]));
}
