"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type NewState = { ok: boolean; message: string } | null;
const ID = /^[a-z0-9][a-z0-9_-]{1,39}$/;

// Solo el Director crea o duplica obras (la base lo exige). Nacen en borrador.
export async function createProduction(_p: NewState, f: FormData): Promise<NewState> {
  const nombre = String(f.get("nombre") ?? "").trim();
  const id = String(f.get("id") ?? "").trim();
  const temporada = String(f.get("temporada") ?? "").trim() || null;
  if (!nombre) return { ok: false, message: "Escribe el nombre de la obra." };
  if (!ID.test(id)) return { ok: false, message: "La dirección web solo puede tener minúsculas, números y guiones." };
  const supabase = await createClient();
  const { error } = await supabase.from("productions").insert({ id, nombre, temporada });
  if (error) return { ok: false, message: error.code === "23505" ? "Ya existe una obra con esa dirección web." : error.message };
  revalidatePath("/panel", "layout");
  redirect(`/panel/producciones/${id}/pagina`);
}

export async function duplicateProduction(_p: NewState, f: FormData): Promise<NewState> {
  const src = String(f.get("src") ?? "");
  const nombre = String(f.get("nombre") ?? "").trim();
  const id = String(f.get("id") ?? "").trim();
  const temporada = String(f.get("temporada") ?? "").trim() || null;
  if (!src) return { ok: false, message: "Elige la obra que quieres duplicar." };
  if (!nombre) return { ok: false, message: "Escribe el nombre de la nueva obra." };
  if (!ID.test(id)) return { ok: false, message: "La dirección web solo puede tener minúsculas, números y guiones." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("panel_duplicate_production", {
    src,
    p_id: id,
    p_nombre: nombre,
    p_temporada: temporada,
    copiar_canciones: f.get("canciones") === "on",
    copiar_equipos: f.get("equipos") === "on",
    copiar_permisos: f.get("permisos") === "on",
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/panel", "layout");
  redirect(`/panel/producciones/${id}/pagina`);
}
