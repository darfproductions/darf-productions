"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Galería pública de la obra (tabla gallery_photos + bucket gallery, 0028).
// La base exige fanzone.editar en ESTA obra (0032).

export async function addGalleryPhoto(pid: string, path: string): Promise<{ ok: boolean; message: string }> {
  if (!path.startsWith(`${pid}/galeria/`)) return { ok: false, message: "Ruta de archivo no válida." };
  const supabase = await createClient();
  const { data: last } = await supabase.from("gallery_photos").select("sort_order").eq("production_id", pid).eq("kind", "galeria").order("sort_order", { ascending: false }).limit(1);
  const { error } = await supabase.from("gallery_photos").insert({ production_id: pid, kind: "galeria", path, sort_order: ((last?.[0]?.sort_order as number) ?? 0) + 1 });
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/panel/producciones/${pid}/fanzone`);
  revalidatePath(`/producciones/${pid}`);
  return { ok: true, message: "Foto agregada a la galería." };
}

export async function removeGalleryPhoto(f: FormData): Promise<void> {
  const pid = String(f.get("pid"));
  const id = String(f.get("id"));
  const supabase = await createClient();
  const { data } = await supabase.from("gallery_photos").select("path").eq("id", id).eq("production_id", pid).maybeSingle();
  if (!data) return;
  const { error } = await supabase.from("gallery_photos").delete().eq("id", id).eq("production_id", pid);
  if (!error) await supabase.storage.from("gallery").remove([data.path as string]);
  revalidatePath(`/panel/producciones/${pid}/fanzone`);
  revalidatePath(`/producciones/${pid}`);
}
