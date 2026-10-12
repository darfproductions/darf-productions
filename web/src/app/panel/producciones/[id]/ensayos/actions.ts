"use server";

import { revalidatePath } from "next/cache";
import { localMxToIso } from "@/lib/dates";
import { fechasRecurrentes } from "@/lib/rehearsal-rules";
import { createClient } from "@/lib/supabase/server";

// Ensayos y asistencia (0043). La base revisa ensayos.gestionar en la obra.

export type RehState = { ok: boolean; message: string } | null;

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** Crea un ensayo o, con "Repetir", uno por cada día elegido de la semana entre dos fechas. */
export async function createRehearsal(_p: RehState, f: FormData): Promise<RehState> {
  const pid = str(f, "pid");
  const fecha = str(f, "fecha");
  if (!localMxToIso(`${fecha}T${str(f, "hora")}`)) return { ok: false, message: "Elige fecha y hora." };
  const fin = str(f, "fin");
  const repetir = f.get("repetir") === "on";
  const dias = f.getAll("dias").map(Number);
  const fechas = repetir ? fechasRecurrentes(fecha, str(f, "hasta"), dias) : [fecha];
  if (repetir && !fechas.length) return { ok: false, message: "Elige los días de la semana y hasta qué fecha se repite." };
  const convocatoria = ["todos", "grupos", "personas"].includes(str(f, "convocatoria")) ? str(f, "convocatoria") : "todos";
  const grupos = f.getAll("grupos").map(String);
  const personas = f.getAll("personas").map(String);
  if (convocatoria === "grupos" && !grupos.length) return { ok: false, message: "Marca al menos un grupo." };
  if (convocatoria === "personas" && !personas.length) return { ok: false, message: "Marca al menos a una persona." };
  const serie = repetir ? crypto.randomUUID() : null;
  const supabase = await createClient();
  const { error } = await supabase.from("rehearsals").insert(fechas.map((dia) => ({
    production_id: pid, titulo: str(f, "titulo") || "Ensayo",
    inicia: localMxToIso(`${dia}T${str(f, "hora")}`), termina: fin ? localMxToIso(`${dia}T${fin}`) : null,
    lugar: str(f, "lugar") || null, notas: str(f, "notas") || null, serie_id: serie,
    convocatoria, grupos: convocatoria === "grupos" ? grupos : [], personas: convocatoria === "personas" ? personas : [],
  })));
  if (error) return { ok: false, message: /termina/.test(error.message) ? "La hora de fin debe ser después del inicio." : error.message };
  revalidatePath(`/panel/producciones/${pid}/ensayos`);
  return { ok: true, message: fechas.length > 1 ? `${fechas.length} ensayos agregados. Los citados ya los ven en Mi cuenta.` : "Ensayo agregado. Los citados ya lo ven en Mi cuenta." };
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

/** Cancela este ensayo y los siguientes de la misma serie (los pasados no se tocan). */
export async function cancelSeries(_p: RehState, f: FormData): Promise<RehState> {
  const pid = str(f, "pid");
  const supabase = await createClient();
  const { error, count } = await supabase.from("rehearsals").update({ estado: "cancelado" }, { count: "exact" })
    .eq("production_id", pid).eq("serie_id", str(f, "serie")).gte("inicia", str(f, "desde"));
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/panel/producciones/${pid}/ensayos`, "layout");
  return { ok: true, message: `${count ?? 0} ensayos de la serie cancelados.` };
}

/** Con cuántas horas de anticipación se pide una falta (0070). 0 = hasta que empiece. */
export async function setAvisoHoras(_p: RehState, f: FormData): Promise<RehState> {
  const pid = str(f, "pid");
  const horas = Number(str(f, "horas"));
  if (!Number.isInteger(horas) || horas < 0 || horas > 168) return { ok: false, message: "Elige una opción." };
  const supabase = await createClient();
  const { error } = await supabase.from("production_discipline").upsert({ production_id: pid, aviso_falta_horas: horas }, { onConflict: "production_id" });
  if (error) return { ok: false, message: "No se pudo guardar." };
  revalidatePath(`/panel/producciones/${pid}/ensayos`);
  revalidatePath(`/cuenta/produccion/${pid}`);
  return { ok: true, message: "Guardado." };
}
