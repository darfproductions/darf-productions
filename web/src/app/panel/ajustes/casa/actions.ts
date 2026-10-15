"use server";

import { correoDeCampo } from "@/lib/cuentas";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { roleIdFromName } from "@/lib/panel-nav";
import { createClient } from "@/lib/supabase/server";

// Casa DARF (0102): quién es de la empresa y qué puede cada rol. Solo el Director (la base lo exige).

const back = (msg: string, ok = false) => redirect(`/panel/ajustes/casa?${ok ? "ok" : "error"}=${encodeURIComponent(msg)}`);
const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** Agregar a alguien (por el correo de su cuenta) o cambiar sus roles y desde cuándo. */
export async function guardarMiembro(f: FormData): Promise<void> {
  const roles = f.getAll("rol").map(String).filter(Boolean);
  const supabase = await createClient();
  const email = await correoDeCampo(supabase, s(f, "email"));
  const { error } = await supabase.rpc("casa_agregar", { p_email: email, p_roles: roles, p_desde: s(f, "desde") || null });
  if (error) back(error.message);
  revalidatePath("/panel/ajustes/casa");
  back("Listo: Casa DARF actualizada. Su gafete se actualiza solo.", true);
}

/** "Conoce al equipo" (0105): mostrar u ocultar a la persona en Nosotros. */
export async function nosotrosMiembro(f: FormData): Promise<void> {
  const supabase = await createClient();
  const mostrar = s(f, "mostrar") === "1";
  const { error, count } = await supabase.from("casa_members").update({ en_nosotros: mostrar }, { count: "exact" }).eq("user_id", s(f, "uid"));
  if (error) back(error.message);
  if (!count) back("No se pudo cambiar.");
  revalidatePath("/panel/ajustes/casa");
  revalidatePath("/nosotros");
  back(mostrar ? "Ahora sale en Conoce al equipo." : "Ya no sale en Conoce al equipo.", true);
}

export async function quitarMiembro(f: FormData): Promise<void> {
  const supabase = await createClient();
  const { error, count } = await supabase.from("casa_members").delete({ count: "exact" }).eq("user_id", s(f, "uid"));
  if (error) back(error.message);
  if (!count) back("No se pudo quitar.");
  revalidatePath("/panel/ajustes/casa");
  back("Ya no es parte de Casa DARF.", true);
}

export async function crearRolCasa(f: FormData): Promise<void> {
  const nombre = s(f, "nombre");
  const id = `casa_${roleIdFromName(nombre)}`.slice(0, 40);
  if (id.length < 7) back("Escribe el nombre del puesto.");
  const perms = f.getAll("perm").map(String);
  const supabase = await createClient();
  const { error } = await supabase.from("panel_roles").insert({ id, nombre, descripcion: s(f, "descripcion") || null, categoria: "casa", alcance: "casa", orden: 50 });
  if (error) back(error.code === "23505" ? "Ya existe un puesto con ese nombre." : error.message);
  if (perms.length) {
    const { error: e2 } = await supabase.from("role_permissions").insert(perms.map((p) => ({ role_id: id, permission_id: p })));
    if (e2) {
      await supabase.from("panel_roles").delete().eq("id", id);
      back(`No se pudo crear el puesto: ${e2.message}`);
    }
  }
  revalidatePath("/panel/ajustes/casa");
  back(`Puesto "${nombre}" creado. Ahora asígnalo a la persona.`, true);
}

export async function guardarPermisosCasa(f: FormData): Promise<void> {
  const id = s(f, "id");
  const wanted = new Set(f.getAll("perm").map(String));
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
    const { error } = await supabase.from("role_permissions").delete().eq("role_id", id).in("permission_id", remove);
    if (error) back(error.message);
  }
  revalidatePath("/panel/ajustes/casa");
  back("Permisos guardados.", true);
}

export async function borrarRolCasa(f: FormData): Promise<void> {
  const supabase = await createClient();
  const { error, count } = await supabase.from("panel_roles").delete({ count: "exact" }).eq("id", s(f, "id")).eq("alcance", "casa");
  if (error) back(error.code === "23503" ? "Quita primero a las personas que tienen este puesto." : error.message);
  if (!count) back("No se pudo eliminar el puesto.");
  revalidatePath("/panel/ajustes/casa");
  back("Puesto eliminado.", true);
}
