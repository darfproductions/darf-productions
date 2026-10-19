"use server";

import { revalidatePath } from "next/cache";
import { localMxToIso } from "@/lib/dates";
import { FAN_CATEGORIAS, fanRow, numeroSocio } from "@/lib/fanzone-rules";
import { horaMx, type Lectura } from "@/lib/acceso-rules";
import { ACCESO_FAN, type AccesoFan } from "@/lib/credencial-fan-rules";
import { mensajeError } from "@/lib/errores";
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

// 0114: fotos de una función (también salen en la galería) y el aviso a quienes fueron.
export async function addFotoFuncion(pid: string, perf: string, path: string): Promise<{ ok: boolean; message: string }> {
  if (!path.startsWith(`${pid}/galeria/`)) return { ok: false, message: "Ruta de archivo no válida." };
  const supabase = await createClient();
  const { data: last } = await supabase.from("gallery_photos").select("sort_order").eq("production_id", pid).eq("kind", "galeria").order("sort_order", { ascending: false }).limit(1);
  const { error } = await supabase.from("gallery_photos").insert({ production_id: pid, kind: "galeria", path, performance_id: perf, sort_order: ((last?.[0]?.sort_order as number) ?? 0) + 1 });
  if (error) return { ok: false, message: mensajeError(error) };
  revalidatePath(`/panel/producciones/${pid}/fanzone`);
  revalidatePath(`/producciones/${pid}`);
  return { ok: true, message: "Foto agregada." };
}

export async function avisarFotosFuncion(_p: { ok: boolean; message: string } | null, f: FormData): Promise<{ ok: boolean; message: string }> {
  const pid = String(f.get("pid"));
  const perf = String(f.get("funcion"));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fotos_funcion_avisar", { pid, perf });
  if (error) return { ok: false, message: mensajeError(error) };
  revalidatePath(`/panel/producciones/${pid}/fanzone`);
  const n = Number(data ?? 0);
  return { ok: true, message: n === 0 ? "Listo. Nadie de esa función tiene cuenta, así que no hubo a quién avisar." : `Listo: se avisó a ${n} ${n === 1 ? "persona" : "personas"}.` };
}

export async function removeGalleryPhoto(_p: { ok: boolean; message: string } | null, f: FormData): Promise<{ ok: boolean; message: string } | null> {
  const pid = String(f.get("pid"));
  const id = String(f.get("id"));
  const supabase = await createClient();
  const { data } = await supabase.from("gallery_photos").select("path").eq("id", id).eq("production_id", pid).maybeSingle();
  if (!data) return { ok: false, message: "Esa foto ya no está." };
  // Primero el registro (con permiso); el archivo solo se borra si el registro se borró de verdad.
  const { error, count } = await supabase.from("gallery_photos").delete({ count: "exact" }).eq("id", id).eq("production_id", pid);
  if (error) return { ok: false, message: mensajeError(error) };
  if (!count) return { ok: false, message: "No tienes permiso para quitar fotos de esta obra." };
  await supabase.storage.from("gallery").remove([data.path as string]);
  revalidatePath(`/panel/producciones/${pid}/fanzone`);
  revalidatePath(`/producciones/${pid}`);
  return { ok: true, message: "Foto quitada." };
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

// ──────── Eventos (0081): se crean en Panel → Eventos (app/panel/eventos/actions.ts) ────────

/** Validar la credencial en la entrada de un evento (fanzone.editar o puerta.validar). Sirve cualquier
 *  código de la persona: gafete, credencial del club o de cuenta (0083). */
export async function validarCredencial(pid: string, eid: string, code: string): Promise<Lectura> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fan_checkin", { eid, p_code: code });
  if (error) return { ok: false, message: error.message };
  const r = data as { resultado: AccesoFan; nombre?: string; foto_path?: string | null; numero?: number; fundador?: boolean; llegada?: string; nivel?: string };
  if (r.resultado === "no_encontrado") return { ok: true, tono: "error", titulo: ACCESO_FAN.no_encontrado.titulo, detalle: "Revisa el código o pide a la persona que abra su credencial en Mi cuenta." };
  const fotoUrl = r.foto_path ? (await supabase.storage.from("avatares").createSignedUrl(r.foto_path, 600)).data?.signedUrl ?? null : null;
  const socio = [r.nivel === "equipo" ? "Equipo DARF" : null, r.numero ? `Socio ${numeroSocio(r.numero)}${r.fundador ? " · Fan fundador" : ""}` : null].filter(Boolean).join(" · ") || undefined;
  const base = { ok: true, nombre: r.nombre ?? "", fotoUrl, detalle: socio };
  if (r.resultado === "ok") {
    revalidatePath(`/panel/producciones/${pid}/fanzone`);
    revalidatePath(`/panel/producciones/${pid}/puerta`);
    return { ...base, tono: "ok", titulo: `${ACCESO_FAN.ok.titulo} · ${horaMx(r.llegada)}`, llegada: horaMx(r.llegada) };
  }
  if (r.resultado === "ya") return { ...base, tono: "neutro", titulo: `${ACCESO_FAN.ya.titulo} a las ${horaMx(r.llegada)}` };
  if (r.resultado === "sin_pago") return { ...base, tono: "error", titulo: ACCESO_FAN.sin_pago.titulo, detalle: "Revisa su pago en el panel, en Eventos (Ver lista), y apruébalo para que pueda pasar." };
  return { ...base, tono: "error", titulo: ACCESO_FAN[r.resultado]?.titulo ?? "No puede pasar" };
}

