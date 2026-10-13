"use server";

import { revalidatePath } from "next/cache";
import { parseAudience } from "@/lib/audience";
import { createClient } from "@/lib/supabase/server";

// Materiales (0046). La base revisa materiales.gestionar en la obra.

export type MatState = { ok: boolean; message: string } | null;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** Guarda un material: archivo ya subido al almacenamiento privado, o un enlace. */
export async function saveMaterial(_p: MatState, f: FormData): Promise<MatState> {
  const pid = str(f, "pid");
  const aud = parseAudience(f);
  if ("error" in aud) return { ok: false, message: aud.error };
  const archivo = str(f, "archivo_path");
  const url = str(f, "url");
  if (!archivo && !url) return { ok: false, message: "Sube un archivo o pega un enlace." };
  if (!archivo && !/^https:\/\/\S+$/i.test(url)) return { ok: false, message: "El enlace debe empezar con https://" };
  const supabase = await createClient();
  const { error } = await supabase.from("materials").insert({
    production_id: pid, titulo: str(f, "titulo"), descripcion: str(f, "descripcion") || null, tipo: str(f, "tipo") || "otro",
    carpeta: str(f, "carpeta") || null, archivo_path: archivo || null, url: archivo ? null : url, ...aud,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/panel/producciones/${pid}/materiales`);
  return { ok: true, message: "Material agregado. Ya lo ven a quienes va dirigido." };
}

export async function removeMaterial(_p: MatState, f: FormData): Promise<MatState> {
  const pid = str(f, "pid");
  const supabase = await createClient();
  const { data: m } = await supabase.from("materials").select("archivo_path").eq("id", str(f, "id")).eq("production_id", pid).maybeSingle();
  const { error, count } = await supabase.from("materials").delete({ count: "exact" }).eq("id", str(f, "id")).eq("production_id", pid);
  if (error) return { ok: false, message: error.message };
  if (!count) return { ok: false, message: "No tienes permiso." };
  if (m?.archivo_path) await supabase.storage.from("materiales").remove([m.archivo_path as string]);
  revalidatePath(`/panel/producciones/${pid}/materiales`);
  return { ok: true, message: "Material quitado." };
}
