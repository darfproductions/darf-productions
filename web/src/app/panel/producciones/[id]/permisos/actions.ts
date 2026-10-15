"use server";

import { correoDeCampo } from "@/lib/cuentas";
import { revalidatePath } from "next/cache";
import { roleDiff } from "@/lib/panel-nav";
import { mensajeError } from "@/lib/errores";
import { createClient } from "@/lib/supabase/server";

export type MemberState = { ok: boolean; message: string; /** 0094: invitación creada (la persona aún no tiene cuenta). */ invitacion?: { token: string; obra: string; roles: string[] } } | null;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Una persona puede tener varios roles en la obra; suma los permisos de todos.
// La base decide: panel_add_member y el borrado exigen permisos.gestionar en ESTA obra.
export async function addMember(_prev: MemberState, form: FormData): Promise<MemberState> {
  const pid = String(form.get("pid") ?? "");
  const roles = form.getAll("role").map(String);
  const supabase = await createClient();
  // 0105: viene del buscador ("cuenta:<id>") o es un correo escrito a mano.
  const email = await correoDeCampo(supabase, String(form.get("email") ?? ""));
  if (!EMAIL.test(email)) return { ok: false, message: "Elige a la persona de la lista o escribe un correo válido." };
  if (!roles.length) return { ok: false, message: "Marca al menos un rol." };
  // 0094: con cuenta se agrega directo; sin cuenta queda una invitación con liga (y correo si está activado).
  const { data, error } = await supabase.rpc("panel_invite_member", { pid, p_email: email, p_roles: roles });
  revalidatePath(`/panel/producciones/${pid}`, "layout");
  if (error) return { ok: false, message: mensajeError(error) };
  const r = data as { tipo: "agregado"; nuevos: number } | { tipo: "invitacion"; token: string };
  const nombres = await roleNames(roles);
  const lista = roles.map((x) => nombres.get(x) ?? x);
  if (r.tipo === "agregado") {
    return { ok: true, message: r.nuevos ? `Listo: ${email} ya tiene acceso como ${lista.join(", ")}. Le llegó un aviso con su guía.` : `${email} ya tenía esos roles.` };
  }
  const { data: obra } = await supabase.from("productions").select("nombre").eq("id", pid).maybeSingle();
  return {
    ok: true,
    message: `${email} aún no tiene cuenta: quedó invitado. Mándale la liga; al crear su cuenta con ese correo entra solo al equipo.`,
    invitacion: { token: r.token, obra: (obra?.nombre as string) ?? "la obra", roles: lista },
  };
}

/** Reenviar (renueva 30 días y vuelve a mandar el correo) o cancelar una invitación (0094). */
export async function invitacionAccion(_prev: MemberState, form: FormData): Promise<MemberState> {
  const pid = String(form.get("pid") ?? "");
  const accion = String(form.get("accion") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("panel_invite_update", { p_id: String(form.get("id") ?? ""), p_accion: accion });
  revalidatePath(`/panel/producciones/${pid}/permisos`);
  if (error) return { ok: false, message: mensajeError(error) };
  return { ok: true, message: accion === "cancelar" ? "Invitación cancelada." : "Invitación renovada." };
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
  // Dirección general de DARF (0111) no se toca desde aquí.
  const { agregar, quitar } = roleDiff((rows ?? []).map((r) => r.role_id as string).filter((r) => r !== "direccion_general_darf"), deseados);
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
