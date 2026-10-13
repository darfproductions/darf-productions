"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CATEGORIAS_ROL } from "@/lib/gafete-rules";
import { roleIdFromName } from "@/lib/panel-nav";

/** Categoría del gafete (0087): Producción, Dirección, Crew o Staff. */
const categoriaDe = (form: FormData) => {
  const c = String(form.get("categoria") ?? "");
  return CATEGORIAS_ROL.some((x) => x.id === c) ? c : null;
};
import { createClient } from "@/lib/supabase/server";

const back = (msg: string, ok = false) => redirect(`/panel/roles?${ok ? "ok" : "error"}=${encodeURIComponent(msg)}`);

// Roles personalizados (solo Director; la base protege los de sistema).
export async function createRole(form: FormData): Promise<void> {
  const nombre = String(form.get("nombre") ?? "").trim();
  const descripcion = String(form.get("descripcion") ?? "").trim() || null;
  const perms = form.getAll("perm").map(String);
  const id = roleIdFromName(nombre);
  if (id.length < 2) back("Escribe un nombre para el rol.");
  const categoria = categoriaDe(form);
  if (!categoria) back("Elige en qué categoría del gafete va el rol.");
  const supabase = await createClient();
  const { error } = await supabase.from("panel_roles").insert({ id, nombre, descripcion, categoria });
  if (error) back(error.code === "23505" ? "Ya existe un rol con ese nombre." : error.message);
  if (perms.length) {
    const { error: e2 } = await supabase.from("role_permissions").insert(perms.map((p) => ({ role_id: id, permission_id: p })));
    if (e2) {
      await supabase.from("panel_roles").delete().eq("id", id);
      back(`No se pudo crear el rol: ${e2.message}`);
    }
  }
  revalidatePath("/panel/roles");
  back(`Rol "${nombre}" creado.`, true);
}

export async function updateRolePermissions(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "");
  const wanted = new Set(form.getAll("perm").map(String));
  const supabase = await createClient();
  const { data: current, error: e0 } = await supabase.from("role_permissions").select("permission_id").eq("role_id", id);
  if (e0) back(e0.message);
  const have = new Set((current ?? []).map((r) => r.permission_id as string));
  const add = [...wanted].filter((p) => !have.has(p));
  const remove = [...have].filter((p) => !wanted.has(p));
  if (add.length) {
    const { error } = await supabase.from("role_permissions").insert(add.map((p) => ({ role_id: id, permission_id: p })));
    if (error) back(error.message);
  }
  if (remove.length) {
    const { error, count } = await supabase.from("role_permissions").delete({ count: "exact" }).eq("role_id", id).in("permission_id", remove);
    if (error) back(error.message);
    if (count !== remove.length) back("No se pudieron quitar todos los permisos (los roles de sistema no se cambian).");
  }
  revalidatePath("/panel/roles");
  back("Permisos guardados.", true);
}

export async function deleteRole(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "");
  const supabase = await createClient();
  const { error, count } = await supabase.from("panel_roles").delete({ count: "exact" }).eq("id", id).eq("es_sistema", false);
  revalidatePath("/panel/roles");
  if (error) back(error.code === "23503" ? "Quita primero a las personas que tienen este rol en alguna obra." : error.message);
  if (!count) back("No se pudo eliminar el rol.");
  back("Rol eliminado.", true);
}

/** Cambiar la categoría del gafete de un rol personalizado (los de sistema están fijos). */
export async function updateRoleCategoria(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "");
  const categoria = categoriaDe(form);
  if (!categoria) back("Elige una categoría.");
  const supabase = await createClient();
  const { error, count } = await supabase.from("panel_roles").update({ categoria }, { count: "exact" }).eq("id", id).eq("es_sistema", false);
  if (error) back(error.message);
  if (!count) back("Ese rol no se puede cambiar.");
  revalidatePath("/panel/roles");
  back("Categoría guardada. Los gafetes se actualizan solos.", true);
}
