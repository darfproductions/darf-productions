"use server";

import { revalidatePath } from "next/cache";
import { localMxToIso } from "@/lib/dates";
import { FAN_CATEGORIAS, fanRow } from "@/lib/fanzone-rules";
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

// ──────── Contenidos de la Fan Zone (0052) ────────
type State = { ok: boolean; message: string } | null;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const refresh = (pid: string) => {
  revalidatePath(`/panel/producciones/${pid}/fanzone`);
  revalidatePath("/fan-zone", "layout");
};

/** Pestaña y fecha de desbloqueo (0075). */
function detalle(f: FormData): { ok: true; categoria: string; disponible_desde: string | null } | { ok: false; message: string } {
  const categoria = str(f, "categoria") || "otro";
  if (!(categoria in FAN_CATEGORIAS)) return { ok: false, message: "Elige la pestaña." };
  const txt = str(f, "disponible_desde");
  const disponible_desde = txt ? localMxToIso(txt) : null;
  if (txt && !disponible_desde) return { ok: false, message: "Revisa la fecha de desbloqueo." };
  return { ok: true, categoria, disponible_desde };
}

export async function addFanzoneItem(_p: State, f: FormData): Promise<State> {
  const pid = str(f, "pid");
  const r = fanRow(pid, { tipo: str(f, "tipo"), titulo: str(f, "titulo"), descripcion: String(f.get("descripcion") ?? ""), enlace: str(f, "enlace"), archivo: str(f, "archivo") || null });
  if (!r.ok) return r;
  const det = detalle(f);
  if (!det.ok) return det;
  const supabase = await createClient();
  const { data: last } = await supabase.from("fanzone_items").select("orden").eq("production_id", pid).order("orden", { ascending: false }).limit(1);
  const { error } = await supabase.from("fanzone_items").insert({
    production_id: pid, ...r.row, categoria: det.categoria, disponible_desde: det.disponible_desde, destacado: f.get("destacado") === "on", orden: ((last?.[0]?.orden as number) ?? 0) + 1,
  });
  if (error) return { ok: false, message: error.message };
  refresh(pid);
  return { ok: true, message: "Agregado a la Fan Zone." };
}

export async function setFanzoneFlag(_p: State, f: FormData): Promise<State> {
  const pid = str(f, "pid");
  const campo = str(f, "campo");
  if (campo !== "destacado" && campo !== "visible") return { ok: false, message: "Acción no válida." };
  const supabase = await createClient();
  const { error, count } = await supabase.from("fanzone_items").update({ [campo]: str(f, "valor") === "si" }, { count: "exact" }).eq("id", str(f, "id")).eq("production_id", pid);
  if (error) return { ok: false, message: error.message };
  if (!count) return { ok: false, message: "No tienes permiso." };
  refresh(pid);
  return { ok: true, message: "Listo." };
}

export async function moveFanzoneItem(_p: State, f: FormData): Promise<State> {
  const pid = str(f, "pid");
  const supabase = await createClient();
  const { error } = await supabase.rpc("fanzone_move", { iid: str(f, "id"), arriba: str(f, "dir") === "arriba" });
  if (error) return { ok: false, message: error.message };
  refresh(pid);
  return { ok: true, message: "Movido." };
}

export async function removeFanzoneItem(_p: State, f: FormData): Promise<State> {
  const pid = str(f, "pid");
  const supabase = await createClient();
  const { data } = await supabase.from("fanzone_items").select("archivo_path").eq("id", str(f, "id")).eq("production_id", pid).maybeSingle();
  const { error, count } = await supabase.from("fanzone_items").delete({ count: "exact" }).eq("id", str(f, "id")).eq("production_id", pid);
  if (error) return { ok: false, message: error.message };
  if (!count) return { ok: false, message: "No tienes permiso." };
  if (data?.archivo_path) await supabase.storage.from("gallery").remove([data.archivo_path as string]);
  refresh(pid);
  return { ok: true, message: "Quitado." };
}

export async function setFanzoneDetalle(_p: State, f: FormData): Promise<State> {
  const pid = str(f, "pid");
  const det = detalle(f);
  if (!det.ok) return det;
  const supabase = await createClient();
  const { error, count } = await supabase.from("fanzone_items").update({ categoria: det.categoria, disponible_desde: det.disponible_desde }, { count: "exact" }).eq("id", str(f, "id")).eq("production_id", pid);
  if (error) return { ok: false, message: error.message };
  if (!count) return { ok: false, message: "No tienes permiso." };
  refresh(pid);
  return { ok: true, message: "Guardado." };
}

// ──────── Foto con el elenco (0075) ────────
export async function addEncuentro(_p: State, f: FormData): Promise<State> {
  const pid = str(f, "pid");
  const cupo = Number(str(f, "cupo"));
  if (!str(f, "performance")) return { ok: false, message: "Elige la función." };
  if (!Number.isInteger(cupo) || cupo < 1 || cupo > 500) return { ok: false, message: "El cupo va de 1 a 500." };
  const supabase = await createClient();
  const { error } = await supabase.from("fan_encuentros").insert({ production_id: pid, performance_id: str(f, "performance"), cupo, notas: str(f, "notas").slice(0, 300) || null });
  if (error) return { ok: false, message: error.code === "23505" ? "Esa función ya tiene encuentro." : error.message };
  refresh(pid);
  return { ok: true, message: "Encuentro creado." };
}

export async function setEncuentro(_p: State, f: FormData): Promise<State> {
  const pid = str(f, "pid");
  const supabase = await createClient();
  const q = str(f, "accion") === "borrar"
    ? supabase.from("fan_encuentros").delete({ count: "exact" }).eq("id", str(f, "id")).eq("production_id", pid)
    : supabase.from("fan_encuentros").update({ abierto: str(f, "accion") === "abrir" }, { count: "exact" }).eq("id", str(f, "id")).eq("production_id", pid);
  const { error, count } = await q;
  if (error) return { ok: false, message: error.message };
  if (!count) return { ok: false, message: "No tienes permiso." };
  refresh(pid);
  return { ok: true, message: "Listo." };
}
