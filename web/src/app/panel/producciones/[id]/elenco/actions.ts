"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Elenco y equipos de una obra. La base exige elenco.gestionar u obra.editar
// en ESTA obra (0032). La foto es de la obra (sesión de esa obra), no de la persona.

export type CreditState = { ok: boolean; message: string } | null;
const TIPOS = ["reparto", "ensamble", "creativo", "produccion", "crew", "tecnico"] as const;

const refresh = (pid: string) => {
  revalidatePath(`/panel/producciones/${pid}`, "layout");
  revalidatePath(`/producciones/${pid}`);
};

/** Busca a la persona por nombre exacto (sin importar mayúsculas); si no existe, la da de alta. */
async function personId(nombre: string): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const exacto = nombre.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data } = await supabase.from("people").select("id").ilike("nombre", exacto).limit(1);
  if (data?.[0]) return { id: data[0].id as string };
  const { data: nueva, error } = await supabase.from("people").insert({ nombre }).select("id").single();
  if (error) return { error: error.message };
  return { id: nueva.id as string };
}

export async function addCredit(_p: CreditState, f: FormData): Promise<CreditState> {
  const pid = String(f.get("pid"));
  const tipo = String(f.get("tipo"));
  const nombre = String(f.get("nombre") ?? "").trim().replace(/\s+/g, " ");
  const papel = String(f.get("papel") ?? "").trim() || null;
  if (!TIPOS.includes(tipo as (typeof TIPOS)[number])) return { ok: false, message: "Tipo no válido." };
  if (!nombre) return { ok: false, message: "Escribe el nombre de la persona." };
  if (tipo !== "ensamble" && !papel) return { ok: false, message: tipo === "reparto" ? "Escribe el personaje." : "Escribe el puesto." };
  const person = await personId(nombre);
  if (!person.id) return { ok: false, message: person.error ?? "No se pudo registrar a la persona." };
  const supabase = await createClient();
  const { data: last } = await supabase.from("production_credits").select("orden").eq("production_id", pid).eq("tipo", tipo).order("orden", { ascending: false }).limit(1);
  const { error } = await supabase.from("production_credits").insert({ production_id: pid, person_id: person.id, tipo, papel, orden: ((last?.[0]?.orden as number) ?? 0) + 1 });
  if (error) return { ok: false, message: error.message };
  refresh(pid);
  return { ok: true, message: `${nombre} agregado.` };
}

export async function updatePapel(f: FormData): Promise<void> {
  const pid = String(f.get("pid"));
  const id = String(f.get("id"));
  const papel = String(f.get("papel") ?? "").trim() || null;
  const supabase = await createClient();
  await supabase.from("production_credits").update({ papel }).eq("id", id).eq("production_id", pid);
  refresh(pid);
}

export async function removeCredit(f: FormData): Promise<void> {
  const pid = String(f.get("pid"));
  const id = String(f.get("id"));
  const supabase = await createClient();
  await supabase.from("production_credits").delete().eq("id", id).eq("production_id", pid);
  refresh(pid);
}

/** Sube o baja un lugar dentro de su grupo (intercambia el orden con el vecino). */
export async function moveCredit(f: FormData): Promise<void> {
  const pid = String(f.get("pid"));
  const id = String(f.get("id"));
  const dir = String(f.get("dir")) === "up" ? -1 : 1;
  const supabase = await createClient();
  const { data: me } = await supabase.from("production_credits").select("tipo").eq("id", id).single();
  if (!me) return;
  const { data: rows } = await supabase.from("production_credits").select("id, orden").eq("production_id", pid).eq("tipo", me.tipo).order("orden").order("id");
  const list = rows ?? [];
  const i = list.findIndex((r) => r.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  // Reasigna 1..n para que no haya empates y luego intercambia.
  const orden = list.map((r) => r.id as string);
  [orden[i], orden[j]] = [orden[j], orden[i]];
  for (let k = 0; k < orden.length; k++) {
    await supabase.from("production_credits").update({ orden: k + 1 }).eq("id", orden[k]).eq("production_id", pid);
  }
  refresh(pid);
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
