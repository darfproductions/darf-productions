"use server";

import { revalidatePath } from "next/cache";
import { localMxToIso } from "@/lib/dates";
import { mensajeError } from "@/lib/errores";
import { createClient } from "@/lib/supabase/server";
import { refrescarPublico } from "@/lib/supabase/publico";

// Elenco y equipos de una obra. La base exige elenco.gestionar u obra.editar
// en ESTA obra (0032). La foto es de la obra (sesión de esa obra), no de la persona.

export type CreditState = { ok: boolean; message: string } | null;
const TIPOS = ["reparto", "ensamble", "creativo", "produccion", "crew", "tecnico", "staff"] as const;

const refresh = (pid: string) => {
  revalidatePath(`/panel/producciones/${pid}`, "layout");
  revalidatePath(`/producciones/${pid}`);
  refrescarPublico();
};

/** Busca a la persona por nombre exacto (sin importar mayúsculas); si no existe, la da de alta. */
async function personId(nombre: string): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const exacto = nombre.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data } = await supabase.from("people").select("id").ilike("nombre", exacto).limit(1);
  if (data?.[0]) return { id: data[0].id as string };
  const { data: nueva, error } = await supabase.from("people").insert({ nombre }).select("id").single();
  if (error) return { error: mensajeError(error) };
  return { id: nueva.id as string };
}

export async function addCredit(_p: CreditState, f: FormData): Promise<CreditState> {
  const pid = String(f.get("pid"));
  const tipo = String(f.get("tipo"));
  const nombre = String(f.get("nombre") ?? "").trim().replace(/\s+/g, " ");
  // 0112: en Reparto se eligen uno o varios personajes de la lista de la obra.
  const personajes = f.getAll("personaje").map(String).filter(Boolean);
  const papel = String(f.get("papel") ?? "").trim() || (personajes.length ? "…" : null);
  if (!TIPOS.includes(tipo as (typeof TIPOS)[number])) return { ok: false, message: "Tipo no válido." };
  if (!nombre) return { ok: false, message: "Escribe el nombre de la persona." };
  // Ensamble y Staff (0106) son listas de nombres, sin personaje ni puesto.
  if (tipo !== "ensamble" && tipo !== "staff" && !papel) return { ok: false, message: tipo === "reparto" ? "Escribe el personaje." : "Escribe el puesto." };
  const person = await personId(nombre);
  if (!person.id) return { ok: false, message: person.error ?? "No se pudo registrar a la persona." };
  const supabase = await createClient();
  const { data: last } = await supabase.from("production_credits").select("orden").eq("production_id", pid).eq("tipo", tipo).order("orden", { ascending: false }).limit(1);
  const { data: nuevo, error } = await supabase.from("production_credits").insert({ production_id: pid, person_id: person.id, tipo, papel, orden: ((last?.[0]?.orden as number) ?? 0) + 1 }).select("id").single();
  if (error) return { ok: false, message: mensajeError(error) };
  if (personajes.length) {
    const { error: e } = await supabase.rpc("credito_personajes", { p_credit: nuevo.id, p_chars: personajes });
    if (e) return { ok: false, message: mensajeError(e) };
  }
  refresh(pid);
  return { ok: true, message: `${nombre} agregado.` };
}

const SIN_PERMISO = "No tienes permiso para cambiar el elenco de esta obra.";

export async function updatePapel(_p: CreditState, f: FormData): Promise<CreditState> {
  const pid = String(f.get("pid"));
  const id = String(f.get("id"));
  const papel = String(f.get("papel") ?? "").trim() || null;
  const supabase = await createClient();
  const { error, count } = await supabase.from("production_credits").update({ papel }, { count: "exact" }).eq("id", id).eq("production_id", pid);
  if (error) return { ok: false, message: mensajeError(error) };
  if (!count) return { ok: false, message: SIN_PERMISO };
  refresh(pid);
  return { ok: true, message: "Guardado." };
}

/** Personajes de un crédito de Reparto (0112): uno o varios de la lista de la obra. */
export async function setCreditCharacters(_p: CreditState, f: FormData): Promise<CreditState> {
  const pid = String(f.get("pid"));
  const id = String(f.get("id"));
  const personajes = f.getAll("personaje").map(String).filter(Boolean);
  const supabase = await createClient();
  const { error } = await supabase.rpc("credito_personajes", { p_credit: id, p_chars: personajes });
  if (error) return { ok: false, message: mensajeError(error) };
  refresh(pid);
  return { ok: true, message: "Personajes guardados." };
}

export async function removeCredit(_p: CreditState, f: FormData): Promise<CreditState> {
  const pid = String(f.get("pid"));
  const id = String(f.get("id"));
  const supabase = await createClient();
  const { error, count } = await supabase.from("production_credits").delete({ count: "exact" }).eq("id", id).eq("production_id", pid);
  if (error) return { ok: false, message: mensajeError(error) };
  if (!count) return { ok: false, message: SIN_PERMISO };
  refresh(pid);
  return { ok: true, message: "Quitado." };
}

/** Sube o baja un lugar dentro de su grupo (intercambia el orden con el vecino). */
export async function moveCredit(_p: CreditState, f: FormData): Promise<CreditState> {
  const pid = String(f.get("pid"));
  const id = String(f.get("id"));
  const dir = String(f.get("dir")) === "up" ? -1 : 1;
  const supabase = await createClient();
  const { data: me, error: e1 } = await supabase.from("production_credits").select("tipo").eq("id", id).maybeSingle();
  if (e1) return { ok: false, message: mensajeError(e1) };
  if (!me) return { ok: false, message: "Ya no está en la lista." };
  const { data: rows, error: e2 } = await supabase.from("production_credits").select("id, orden").eq("production_id", pid).eq("tipo", me.tipo).order("orden").order("id");
  if (e2) return { ok: false, message: mensajeError(e2) };
  const list = rows ?? [];
  const i = list.findIndex((r) => r.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return null;
  // Reasigna 1..n para que no haya empates y luego intercambia.
  const orden = list.map((r) => r.id as string);
  [orden[i], orden[j]] = [orden[j], orden[i]];
  for (let k = 0; k < orden.length; k++) {
    const { error, count } = await supabase.from("production_credits").update({ orden: k + 1 }, { count: "exact" }).eq("id", orden[k]).eq("production_id", pid);
    if (error || !count) {
      refresh(pid);
      return { ok: false, message: error ? mensajeError(error) : SIN_PERMISO };
    }
  }
  refresh(pid);
  return null;
}

export async function setCreditPhoto(pid: string, creditId: string, path: string): Promise<{ ok: boolean; message: string }> {
  if (!path.startsWith(`${pid}/creditos/`)) return { ok: false, message: "Ruta de archivo no válida." };
  const supabase = await createClient();
  const { error, count } = await supabase.from("production_credits").update({ foto_path: path }, { count: "exact" }).eq("id", creditId).eq("production_id", pid);
  if (error) return { ok: false, message: error.message };
  if (!count) return { ok: false, message: "No tienes permiso para cambiar esta foto." };
  refresh(pid);
  return { ok: true, message: "Foto actualizada." };
}

/** 0107: publica o despublica a una persona del Reparto o Ensamble (solo cambia lo que ve el público). */
export async function setCreditPublicado(_p: CreditState, f: FormData): Promise<CreditState> {
  const pid = String(f.get("pid"));
  const id = String(f.get("id"));
  const publicado = f.get("publicado") === "1";
  // 0110: al publicar se puede avisar a los socios del Club Fan (lo manda la base, una vez).
  const avisar = publicado && f.get("avisar") === "on";
  const supabase = await createClient();
  const { error, count } = await supabase.from("production_credits").update({ publicado, avisar_club: avisar }, { count: "exact" }).eq("id", id).eq("production_id", pid);
  if (error) return { ok: false, message: mensajeError(error) };
  if (!count) return { ok: false, message: SIN_PERMISO };
  refresh(pid);
  return { ok: true, message: publicado ? (avisar ? "Publicado y avisado al Club Fan." : "Publicado.") : "Ya no se ve en la página." };
}

/** 0110: programa (o cancela) la publicación: sale sola a esa hora (hora de México). */
export async function programarCredito(_p: CreditState, f: FormData): Promise<CreditState> {
  const pid = String(f.get("pid"));
  const id = String(f.get("id"));
  const cancelar = f.get("cancelar") === "1";
  const iso = cancelar ? null : localMxToIso(String(f.get("fecha") ?? ""));
  if (!cancelar && !iso) return { ok: false, message: "Elige la fecha y la hora." };
  if (iso && new Date(iso).getTime() <= Date.now()) return { ok: false, message: "Elige una hora que todavía no pase (o usa Publicar)." };
  const supabase = await createClient();
  const { error, count } = await supabase.from("production_credits")
    .update({ publicar_at: iso, avisar_club: !cancelar && f.get("avisar") === "on" }, { count: "exact" })
    .eq("id", id).eq("production_id", pid).eq("publicado", false);
  if (error) return { ok: false, message: mensajeError(error) };
  if (!count) return { ok: false, message: SIN_PERMISO };
  refresh(pid);
  return { ok: true, message: cancelar ? "Programación cancelada." : "Programado: saldrá solo a esa hora." };
}

/** 0107: publica de una vez a todo el Reparto y Ensamble que falta. */
export async function publishAllCast(_p: CreditState, f: FormData): Promise<CreditState> {
  const pid = String(f.get("pid"));
  const supabase = await createClient();
  const { error, count } = await supabase.from("production_credits").update({ publicado: true }, { count: "exact" })
    .eq("production_id", pid).in("tipo", ["reparto", "ensamble"]).eq("publicado", false);
  if (error) return { ok: false, message: mensajeError(error) };
  // 0110: un solo aviso al Club Fan por obra (no uno por persona).
  if (count && f.get("avisar") === "on") await supabase.rpc("elenco_avisar_club", { pid });
  refresh(pid);
  return { ok: true, message: count ? `Publicado: ${count === 1 ? "1 persona" : `${count} personas`}.` : "Todo el elenco ya estaba publicado." };
}

/** 0109: "Solo crédito": sale en la página pero no es integrante (producción que sale de personaje). */
export async function setSoloCredito(_p: CreditState, f: FormData): Promise<CreditState> {
  const pid = String(f.get("pid"));
  const id = String(f.get("id"));
  const solo = f.get("solo") === "1";
  const supabase = await createClient();
  const { error, count } = await supabase.from("production_credits").update({ solo_credito: solo }, { count: "exact" }).eq("id", id).eq("production_id", pid);
  if (error) return { ok: false, message: mensajeError(error) };
  if (!count) return { ok: false, message: SIN_PERMISO };
  refresh(pid);
  return { ok: true, message: solo ? "Listo: solo crédito, ya no entra a ensayos." : "Listo: vuelve a ser integrante." };
}
