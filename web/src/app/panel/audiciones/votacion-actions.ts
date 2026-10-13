"use server";

import { revalidatePath } from "next/cache";
import { mensajeError } from "@/lib/errores";
import { createClient } from "@/lib/supabase/server";

// Audiciones con votación (0089): personajes, fases, opciones de los jueces, votos, ajuste y envío.
// La base revisa cada permiso; aquí solo se arma la llamada.

export type VotState = { ok: boolean; message: string } | null;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const listo = (aid: string, message: string): VotState => {
  revalidatePath(`/panel/audiciones/${aid}`, "layout");
  return { ok: true, message };
};

export async function importarPersonajes(_p: VotState, f: FormData): Promise<VotState> {
  const aid = str(f, "aid");
  const { data, error } = await (await createClient()).rpc("audition_import_characters", { aid });
  if (error) return { ok: false, message: mensajeError(error) };
  const n = Number(data ?? 0);
  return listo(aid, n ? `Se agregaron ${n} ${n === 1 ? "personaje" : "personajes"} de la obra.` : "Ya estaban todos los personajes de la obra.");
}

export async function moverPersonaje(_p: VotState, f: FormData): Promise<VotState> {
  const aid = str(f, "aid");
  const { error } = await (await createClient()).rpc("audition_role_move", { rid: str(f, "id"), p_dir: Number(f.get("dir")) });
  if (error) return { ok: false, message: mensajeError(error) };
  return listo(aid, "Orden guardado.");
}

export async function editarPersonaje(_p: VotState, f: FormData): Promise<VotState> {
  const aid = str(f, "aid");
  const nombre = str(f, "nombre");
  if (!nombre) return { ok: false, message: "Escribe el nombre del personaje." };
  const { error, count } = await (await createClient()).from("audition_roles")
    .update({ nombre, descripcion: str(f, "descripcion") || null }, { count: "exact" }).eq("id", str(f, "id")).eq("audition_id", aid);
  if (error) return { ok: false, message: mensajeError(error) };
  if (!count) return { ok: false, message: "No tienes permiso para editar esta convocatoria." };
  return listo(aid, "Personaje guardado.");
}

/** "Siguiente" o "Regresar" en las etapas. */
export async function moverFase(_p: VotState, f: FormData): Promise<VotState> {
  const aid = str(f, "aid");
  const { data, error } = await (await createClient()).rpc("audition_fase", { aid, p_dir: str(f, "dir") === "anterior" ? "anterior" : "siguiente" });
  if (error) return { ok: false, message: mensajeError(error) };
  revalidatePath(`/panel/audiciones/${aid}`, "layout");
  return { ok: true, message: `Etapa: ${String(data)}` };
}

/** Opciones de un juez para una persona (cliente: se guarda al cambiar). */
export async function guardarOpciones(aid: string, app: string, ronda: number, opciones: string[]): Promise<{ ok: boolean; message?: string }> {
  const p = opciones.map((v, i) => ({ opcion: i + 1, role_id: v })).filter((x) => x.role_id);
  const { error } = await (await createClient()).rpc("audition_picks_set", { app, p_ronda: ronda, p });
  if (error) return { ok: false, message: mensajeError(error) };
  revalidatePath(`/panel/audiciones/${aid}/evaluacion`);
  return { ok: true };
}

/** Quién pasa a callback (casillas en bloque). Los demás regresan a "convocado". */
export async function marcarCallback(_p: VotState, f: FormData): Promise<VotState> {
  const aid = str(f, "aid");
  const todos = f.getAll("todos").map(String);
  const pasan = new Set(f.getAll("pasa").map(String));
  const supabase = await createClient();
  const si = todos.filter((id) => pasan.has(id));
  const no = todos.filter((id) => !pasan.has(id));
  if (si.length) {
    const { error, count } = await supabase.from("audition_applications").update({ estado: "callback" }, { count: "exact" }).in("id", si).eq("audition_id", aid);
    if (error) return { ok: false, message: mensajeError(error) };
    if (count !== si.length) return { ok: false, message: "No tienes permiso para elegir el callback de esta convocatoria." };
  }
  if (no.length) {
    const { error } = await supabase.from("audition_applications").update({ estado: "convocado" }).in("id", no).eq("audition_id", aid).eq("estado", "callback");
    if (error) return { ok: false, message: mensajeError(error) };
  }
  return listo(aid, `${si.length} ${si.length === 1 ? "persona pasa" : "personas pasan"} a callback. Cuando esté lista la lista, da "Siguiente".`);
}

export async function votar(_p: VotState, f: FormData): Promise<VotState> {
  const aid = str(f, "aid");
  const app = str(f, "app");
  const { error } = await (await createClient()).rpc("audition_vote", { aid, rid: str(f, "rol"), app: app || null });
  if (error) return { ok: false, message: mensajeError(error) };
  revalidatePath(`/panel/audiciones/${aid}/votacion`);
  return { ok: true, message: app ? "Voto guardado." : "Te abstuviste en este personaje." };
}

/** Mover a alguien en el ajuste del cast (cliente: arrastrar o "Mover a…"). destino = id de personaje, "ensamble" o "fuera". */
export async function moverEnCast(aid: string, app: string, destino: string): Promise<{ ok: boolean; message?: string }> {
  const { error } = await (await createClient()).rpc("audition_cast_move", { aid, app, p_destino: destino });
  if (error) return { ok: false, message: mensajeError(error) };
  revalidatePath(`/panel/audiciones/${aid}/cast`);
  return { ok: true };
}

export async function mandarCast(_p: VotState, f: FormData): Promise<VotState> {
  const aid = str(f, "aid");
  const limite = str(f, "responder_antes");
  const { localMxToIso } = await import("@/lib/dates");
  const { data, error } = await (await createClient()).rpc("audition_cast_enviar", {
    aid, p_mensaje: str(f, "mensaje") || null, p_responder_antes: limite ? localMxToIso(limite) : null,
  });
  if (error) return { ok: false, message: mensajeError(error) };
  const r = (data ?? {}) as { ofertas?: number; sin_cuenta?: number; avisos?: number };
  revalidatePath(`/panel/audiciones/${aid}`, "layout");
  return { ok: true, message: `Listo: ${r.ofertas ?? 0} ofertas enviadas y ${r.avisos ?? 0} avisos.${r.sin_cuenta ? ` ${r.sin_cuenta} sin cuenta: avísales tú.` : ""} Las respuestas llegan a Elenco.` };
}

// ──────── Personajes de la obra (Elenco y equipos) ────────

const refrescaObra = (pid: string) => revalidatePath(`/panel/producciones/${pid}/elenco`);

export async function agregarPersonajeObra(_p: VotState, f: FormData): Promise<VotState> {
  const pid = str(f, "pid");
  const nombre = str(f, "nombre");
  if (!nombre) return { ok: false, message: "Escribe el nombre del personaje." };
  const supabase = await createClient();
  const { count } = await supabase.from("production_characters").select("id", { count: "exact", head: true }).eq("production_id", pid);
  const { error } = await supabase.from("production_characters").insert({ production_id: pid, nombre, descripcion: str(f, "descripcion") || null, orden: (count ?? 0) + 1 });
  if (error) return { ok: false, message: mensajeError(error) };
  refrescaObra(pid);
  return { ok: true, message: `${nombre} agregado.` };
}

export async function editarPersonajeObra(_p: VotState, f: FormData): Promise<VotState> {
  const pid = str(f, "pid");
  const nombre = str(f, "nombre");
  if (!nombre) return { ok: false, message: "Escribe el nombre del personaje." };
  const { error, count } = await (await createClient()).from("production_characters")
    .update({ nombre, descripcion: str(f, "descripcion") || null }, { count: "exact" }).eq("id", str(f, "id")).eq("production_id", pid);
  if (error) return { ok: false, message: mensajeError(error) };
  if (!count) return { ok: false, message: "No tienes permiso para editar los personajes de esta obra." };
  refrescaObra(pid);
  return { ok: true, message: "Personaje guardado." };
}

export async function moverPersonajeObra(_p: VotState, f: FormData): Promise<VotState> {
  const pid = str(f, "pid");
  const { error } = await (await createClient()).rpc("production_character_move", { cid: str(f, "id"), p_dir: Number(f.get("dir")) });
  if (error) return { ok: false, message: mensajeError(error) };
  refrescaObra(pid);
  return { ok: true, message: "Orden guardado." };
}

export async function borrarPersonajeObra(_p: VotState, f: FormData): Promise<VotState> {
  const pid = str(f, "pid");
  const { error, count } = await (await createClient()).from("production_characters").delete({ count: "exact" }).eq("id", str(f, "id")).eq("production_id", pid);
  if (error) return { ok: false, message: mensajeError(error) };
  if (!count) return { ok: false, message: "No tienes permiso para editar los personajes de esta obra." };
  refrescaObra(pid);
  return { ok: true, message: "Personaje quitado." };
}
