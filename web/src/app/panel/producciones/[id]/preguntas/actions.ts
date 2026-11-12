"use server";

import { revalidatePath } from "next/cache";
import { PREGUNTAS_SUGERIDAS } from "@/lib/faq-rules";
import { mensajeError } from "@/lib/errores";
import { createClient } from "@/lib/supabase/server";

// Preguntas frecuentes por obra (0141). La base revisa obra.editar o comunicados.enviar (RLS).

export type FaqState = { ok: boolean; message: string } | null;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** Guarda las respuestas de todas las sugeridas de una vez (solo las que cambiaron o tienen texto). */
export async function guardarSugeridas(_p: FaqState, f: FormData): Promise<FaqState> {
  const pid = str(f, "pid");
  const supabase = await createClient();
  const filas = PREGUNTAS_SUGERIDAS.map((s, i) => ({ production_id: pid, clave: s.clave, pregunta: s.pregunta, respuesta: str(f, `r_${s.clave}`).slice(0, 1500), orden: 10 + i, activa: true }));
  const { data: hay } = await supabase.from("production_faq").select("clave").eq("production_id", pid).not("clave", "is", null);
  const existentes = new Set(((hay ?? []) as { clave: string }[]).map((x) => x.clave));
  const guardar = filas.filter((x) => x.respuesta !== "" || existentes.has(x.clave));
  if (guardar.length === 0) return { ok: true, message: "Nada que guardar todavía: escribe al menos una respuesta." };
  const { error } = await supabase.from("production_faq").upsert(guardar, { onConflict: "production_id,clave" });
  if (error) return { ok: false, message: mensajeError(error) };
  revalidatePath(`/panel/producciones/${pid}/preguntas`);
  revalidatePath(`/cuenta/produccion/${pid}`);
  return { ok: true, message: "Respuestas guardadas. El elenco ya las ve en Mi obra." };
}

/** Pregunta propia: nueva o editada. */
export async function guardarPropia(_p: FaqState, f: FormData): Promise<FaqState> {
  const pid = str(f, "pid");
  const id = str(f, "id");
  const pregunta = str(f, "pregunta").slice(0, 200);
  const respuesta = str(f, "respuesta").slice(0, 1500);
  if (!pregunta) return { ok: false, message: "Escribe la pregunta." };
  if (!respuesta) return { ok: false, message: "Escribe la respuesta." };
  const supabase = await createClient();
  const act = f.getAll("activa").map(String);
  const fila = { production_id: pid, pregunta, respuesta, activa: act.length ? act.includes("on") : true, orden: Number(str(f, "orden") || 100) || 100 };
  const { error } = id ? await supabase.from("production_faq").update(fila).eq("id", id).eq("production_id", pid) : await supabase.from("production_faq").insert(fila);
  if (error) return { ok: false, message: mensajeError(error) };
  revalidatePath(`/panel/producciones/${pid}/preguntas`);
  revalidatePath(`/cuenta/produccion/${pid}`);
  return { ok: true, message: id ? "Pregunta actualizada." : "Pregunta agregada." };
}

export async function quitarPregunta(_p: FaqState, f: FormData): Promise<FaqState> {
  const pid = str(f, "pid");
  const supabase = await createClient();
  const { error, count } = await supabase.from("production_faq").delete({ count: "exact" }).eq("id", str(f, "id")).eq("production_id", pid);
  if (error) return { ok: false, message: mensajeError(error) };
  if (!count) return { ok: false, message: "No tienes permiso." };
  revalidatePath(`/panel/producciones/${pid}/preguntas`);
  revalidatePath(`/cuenta/produccion/${pid}`);
  return { ok: true, message: "Pregunta quitada." };
}
