"use server";

import { revalidatePath } from "next/cache";
import { leerAnuncio, type AnuncioLugar } from "@/lib/anuncio-rules";
import { leerFranja } from "@/lib/banner-form";
import { createClient } from "@/lib/supabase/server";

// Acciones del panel para anuncios y la franja del sitio (0074). La base decide quién puede:
// el Director todo; el equipo de una obra (obra.editar) los anuncios de su obra.

type State = { ok: boolean; message: string } | null;

/** "sitio" (inicio y Fan Zone general, solo Director) o el id de una obra. */
const alcance = (f: FormData) => {
  const s = String(f.get("scope") ?? "");
  return s === "sitio" ? { pid: null, lugares: ["inicio", "fanzone"] as AnuncioLugar[] } : { pid: s, lugares: ["obra", "fanzone"] as AnuncioLugar[] };
};

function refrescar(pid: string | null) {
  revalidatePath("/");
  revalidatePath("/fan-zone", "layout");
  revalidatePath("/panel/ajustes/sitio");
  if (pid) {
    revalidatePath(`/producciones/${pid}`);
    revalidatePath(`/panel/producciones/${pid}/pagina`, "layout");
  }
}

export async function saveAnuncio(_p: State, f: FormData): Promise<State> {
  const { pid, lugares } = alcance(f);
  const r = leerAnuncio(f, lugares, pid);
  if (!r.ok) return r;
  const id = String(f.get("id") ?? "");
  const supabase = await createClient();
  const valores = { ...r.fila, updated_at: new Date().toISOString() };
  // Si se mueve la fecha de revelación al futuro, se vuelve a avisar a quienes se apuntaron.
  let reaviso = {};
  if (id) {
    const { data: antes } = await supabase.from("anuncios").select("revela_at").eq("id", id).maybeSingle();
    const cambio = antes && antes.revela_at !== null && r.fila.revela_at !== null && new Date(antes.revela_at).getTime() !== new Date(r.fila.revela_at).getTime();
    if (cambio && new Date(r.fila.revela_at!).getTime() > Date.now()) reaviso = { avisado_at: null };
  }
  const { error, count } = id
    ? await supabase.from("anuncios").update({ ...valores, ...reaviso }, { count: "exact" }).eq("id", id)
    : await supabase.from("anuncios").insert(valores, { count: "exact" });
  if (error) return { ok: false, message: error.message.includes("row-level") ? "No tienes permiso para este anuncio." : error.message };
  if (!count) return { ok: false, message: "No tienes permiso para este anuncio." };
  refrescar(pid);
  return { ok: true, message: id ? "Anuncio guardado." : "Anuncio creado." };
}

export async function setAnuncioPublicado(_p: State, f: FormData): Promise<State> {
  const { pid } = alcance(f);
  const supabase = await createClient();
  const { error, count } = await supabase.from("anuncios").update({ publicado: f.get("valor") === "si" }, { count: "exact" }).eq("id", String(f.get("id")));
  if (error || !count) return { ok: false, message: error?.message ?? "No tienes permiso." };
  refrescar(pid);
  return { ok: true, message: f.get("valor") === "si" ? "Publicado." : "Oculto." };
}

export async function deleteAnuncio(_p: State, f: FormData): Promise<State> {
  const { pid } = alcance(f);
  const supabase = await createClient();
  const { data, error } = await supabase.from("anuncios").delete().eq("id", String(f.get("id"))).select("imagen_path");
  if (error || !data?.length) return { ok: false, message: error?.message ?? "No tienes permiso." };
  const img = (data[0] as { imagen_path: string | null }).imagen_path;
  if (img) await supabase.storage.from("gallery").remove([img]);
  refrescar(pid);
  return { ok: true, message: "Anuncio borrado." };
}

/** Franja del sitio (solo el Director; la base lo revisa). */
export async function saveSiteBanner(_p: State, f: FormData): Promise<State> {
  const r = leerFranja(f);
  if (!r.ok) return r;
  const supabase = await createClient();
  const { error } = await supabase.rpc("panel_set_site_banner", { p_estilo: r.estilo, p_color: r.color || null, p_activa: f.get("activa") === "1", items: r.items });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/");
  revalidatePath("/panel/ajustes/sitio");
  return { ok: true, message: "Franja del sitio guardada." };
}
