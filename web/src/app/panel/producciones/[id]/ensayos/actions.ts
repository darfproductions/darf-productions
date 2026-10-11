"use server";

import { revalidatePath } from "next/cache";
import { localMxToIso } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

// Ensayos y asistencia (0043). La base revisa ensayos.gestionar en la obra.

export type RehState = { ok: boolean; message: string } | null;

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function createRehearsal(_p: RehState, f: FormData): Promise<RehState> {
  const pid = str(f, "pid");
  const fecha = str(f, "fecha");
  const inicia = localMxToIso(`${fecha}T${str(f, "hora")}`);
  if (!inicia) return { ok: false, message: "Elige fecha y hora." };
  const fin = str(f, "fin");
  const convocatoria = ["todos", "grupos", "personas"].includes(str(f, "convocatoria")) ? str(f, "convocatoria") : "todos";
  const grupos = f.getAll("grupos").map(String);
  const personas = f.getAll("personas").map(String);
  if (convocatoria === "grupos" && !grupos.length) return { ok: false, message: "Marca al menos un grupo." };
  if (convocatoria === "personas" && !personas.length) return { ok: false, message: "Marca al menos a una persona." };
  const supabase = await createClient();
  const { error } = await supabase.from("rehearsals").insert({
    production_id: pid, titulo: str(f, "titulo") || "Ensayo", inicia, termina: fin ? localMxToIso(`${fecha}T${fin}`) : null,
    lugar: str(f, "lugar") || null, notas: str(f, "notas") || null,
    convocatoria, grupos: convocatoria === "grupos" ? grupos : [], personas: convocatoria === "personas" ? personas : [],
  });
  if (error) return { ok: false, message: /termina/.test(error.message) ? "La hora de fin debe ser después del inicio." : error.message };
  revalidatePath(`/panel/producciones/${pid}/ensayos`);
  return { ok: true, message: "Ensayo agregado. Los citados ya lo ven en Mi cuenta." };
}

export async function setRehearsalEstado(_p: RehState, f: FormData): Promise<RehState> {
  const pid = str(f, "pid");
  const supabase = await createClient();
  const { error } = await supabase.from("rehearsals").update({ estado: str(f, "estado") }).eq("id", str(f, "id")).eq("production_id", pid);
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/panel/producciones/${pid}/ensayos`, "layout");
  return { ok: true, message: str(f, "estado") === "cancelado" ? "Ensayo cancelado (los citados lo ven así)." : "Ensayo reactivado." };
}

/** Marcar asistencia de una persona (presente, retardo con minutos, falta o justificada). */
export async function markAttendance(pid: string, rid: string, uid: string, estado: string, minutos?: number): Promise<{ ok: boolean; message?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("rehearsal_attendance").upsert(
    { rehearsal_id: rid, user_id: uid, estado, minutos_tarde: estado === "retardo" ? minutos || null : null, marcado_at: new Date().toISOString() },
    { onConflict: "rehearsal_id,user_id" },
  );
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/panel/producciones/${pid}/ensayos/${rid}`);
  return { ok: true };
}
