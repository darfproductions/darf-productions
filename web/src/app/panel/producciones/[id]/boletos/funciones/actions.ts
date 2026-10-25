"use server";

import { revalidatePath } from "next/cache";
import { localMxToIso } from "@/lib/dates";
import { mensajeError } from "@/lib/errores";
import { GRUPOS_LLAMADO } from "@/lib/logistica-rules";
import { createClient } from "@/lib/supabase/server";
import { refrescarPublico } from "@/lib/supabase/publico";

// 0127: logística de la obra (horarios y "Antes de ir") y sus llamados. La base revisa el permiso
// (logística: funciones.gestionar; llamados: ensayos.gestionar o funciones.gestionar) y sincroniza los llamados
// de cada función sola.

export type LogisticaState = { ok: boolean; message: string } | null;

const refresh = (pid: string) => {
  revalidatePath(`/panel/producciones/${pid}`, "layout");
  revalidatePath(`/producciones/${pid}`);
  refrescarPublico();
};
const texto = (f: FormData, k: string, max: number) => String(f.get(k) ?? "").trim().slice(0, max) || null;
const entero = (f: FormData, k: string) => { const t = String(f.get(k) ?? "").trim(); return t === "" ? null : Number(t); };

export async function saveLogistica(_p: LogisticaState, f: FormData): Promise<LogisticaState> {
  const pid = String(f.get("pid"));
  const puertas = entero(f, "puertas_min"), duracion = entero(f, "duracion_min"), intermedio = entero(f, "intermedio_min");
  if (puertas == null || !Number.isInteger(puertas) || puertas < 0 || puertas > 240) return { ok: false, message: "Las puertas abren entre 0 y 240 minutos antes." };
  if (duracion == null || !Number.isInteger(duracion) || duracion < 10 || duracion > 600) return { ok: false, message: "La duración va de 10 a 600 minutos." };
  if (intermedio != null && (!Number.isInteger(intermedio) || intermedio < 5 || intermedio > 60)) return { ok: false, message: "El intermedio va de 5 a 60 minutos (o vacío si no hay)." };
  const maps = texto(f, "maps_url", 500);
  if (maps && !/^https:\/\//.test(maps)) return { ok: false, message: "La liga de Google Maps debe empezar con https://" };
  const supabase = await createClient();
  const { error } = await supabase.from("obra_logistica").upsert({
    production_id: pid, puertas_min: puertas, duracion_min: duracion, intermedio_min: intermedio,
    direccion: texto(f, "direccion", 300), maps_url: maps, acceso_tardio: texto(f, "acceso_tardio", 300), indicaciones: texto(f, "indicaciones", 1500),
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, message: mensajeError(error) };
  refresh(pid);
  return { ok: true, message: "Logística guardada. Los horarios de las funciones y sus llamados se actualizaron." };
}

export async function saveLlamado(_p: LogisticaState, f: FormData): Promise<LogisticaState> {
  const pid = String(f.get("pid"));
  const id = String(f.get("lid") ?? "") || null;
  const nombre = String(f.get("nombre") ?? "").trim();
  if (nombre.length < 2 || nombre.length > 60) return { ok: false, message: "Ponle un nombre al llamado (ej. Elenco)." };
  const horas = Number(f.get("horas") ?? 0), mins = Number(f.get("minutos") ?? 0);
  const minutos_antes = Math.round(horas * 60 + mins);
  if (!Number.isFinite(minutos_antes) || minutos_antes < 0 || minutos_antes > 600) return { ok: false, message: "El llamado va de 0 a 10 horas antes de la función." };
  const elenco = String(f.get("elenco") ?? "todos");
  if (!["todos", "grupos", "nadie"].includes(elenco)) return { ok: false, message: "Elige a quién del elenco cita." };
  const grupos = f.getAll("grupos").map(String).filter((g) => g in GRUPOS_LLAMADO);
  const equipo_todos = f.get("equipo_todos") === "on";
  if (elenco === "grupos" && !grupos.length) return { ok: false, message: "Elige al menos un grupo del elenco." };
  if (elenco === "nadie" && !equipo_todos) return { ok: false, message: "El llamado tiene que citar a alguien: elenco o equipo." };
  const fila = { production_id: pid, nombre, minutos_antes, elenco, grupos: elenco === "grupos" ? grupos : [], equipo_todos, orden: Number(f.get("orden") ?? 0) || 0 };
  const supabase = await createClient();
  const { error } = id ? await supabase.from("obra_llamados").update(fila).eq("id", id).eq("production_id", pid) : await supabase.from("obra_llamados").insert(fila);
  if (error) return { ok: false, message: mensajeError(error) };
  refresh(pid);
  return { ok: true, message: id ? "Llamado guardado: se movió en las funciones que vienen." : "Llamado creado en todas las funciones que vienen." };
}

export async function deleteLlamado(_p: LogisticaState, f: FormData): Promise<LogisticaState> {
  const pid = String(f.get("pid"));
  const supabase = await createClient();
  const { error } = await supabase.from("obra_llamados").delete().eq("id", String(f.get("lid"))).eq("production_id", pid);
  if (error) return { ok: false, message: mensajeError(error) };
  refresh(pid);
  return { ok: true, message: "Llamado borrado. Los que ya tenían asistencia se quedan en Ensayos." };
}

/** Horario propio de una función (vacío = el de la obra). */
export async function saveHorarioFuncion(_p: LogisticaState, f: FormData): Promise<LogisticaState> {
  const pid = String(f.get("pid"));
  const perf = String(f.get("perf"));
  const conv = (k: string) => { const t = String(f.get(k) ?? ""); return { t, iso: t ? localMxToIso(t) : null }; };
  const p = conv("puertas_at"), t = conv("termina_at");
  if ((p.t && !p.iso) || (t.t && !t.iso)) return { ok: false, message: "Revisa las horas." };
  const supabase = await createClient();
  const { data: fn } = await supabase.from("performances").select("starts_at").eq("id", perf).eq("production_id", pid).maybeSingle();
  const inicia = fn?.starts_at as string | null | undefined;
  if (!inicia && (p.iso || t.iso)) return { ok: false, message: "Primero ponle fecha y hora a la función." };
  if (inicia && p.iso && Date.parse(p.iso) > Date.parse(inicia)) return { ok: false, message: "Las puertas tienen que abrir antes de que empiece la función." };
  if (inicia && t.iso && Date.parse(t.iso) <= Date.parse(inicia)) return { ok: false, message: "La función tiene que terminar después de empezar." };
  const { error } = await supabase.from("performances").update({ puertas_at: p.iso, termina_at: t.iso }).eq("id", perf).eq("production_id", pid);
  if (error) return { ok: false, message: mensajeError(error) };
  refresh(pid);
  return { ok: true, message: p.iso || t.iso ? "Horario de esta función guardado." : "Esta función vuelve a usar el horario de la obra." };
}
