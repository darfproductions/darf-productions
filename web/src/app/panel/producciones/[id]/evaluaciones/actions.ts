"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { numeroDe } from "@/lib/rubric-rules";
import { createClient } from "@/lib/supabase/server";

// Rúbrica del taller (0058). La base revisa rubrica.gestionar en la obra.

type State = { ok: boolean; message: string } | null;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const TABLAS = { criterio: "rubric_criteria", nivel: "rubric_levels", periodo: "rubric_periods" } as const;
const done = (pid: string, message: string): State => {
  revalidatePath(`/panel/producciones/${pid}/evaluaciones`, "layout");
  return { ok: true, message };
};

export async function seedRubric(_p: State, f: FormData): Promise<State> {
  const pid = str(f, "pid");
  const supabase = await createClient();
  const { error } = await supabase.rpc("rubric_seed", { pid });
  if (error) return { ok: false, message: error.message };
  return done(pid, "Listo: rúbrica básica creada. Ajústala como quieras.");
}

/** Agregar o renombrar un criterio, nivel o periodo. */
export async function saveRubricItem(_p: State, f: FormData): Promise<State> {
  const pid = str(f, "pid");
  const tipo = str(f, "tipo") as keyof typeof TABLAS;
  if (!(tipo in TABLAS)) return { ok: false, message: "Acción no válida." };
  const nombre = str(f, "nombre");
  if (!nombre) return { ok: false, message: "Escribe el nombre." };
  const id = str(f, "id");
  const supabase = await createClient();
  const row: Record<string, unknown> = { nombre };
  if (tipo === "criterio") row.descripcion = str(f, "descripcion") || null;
  if (id) {
    const { error, count } = await supabase.from(TABLAS[tipo]).update(row, { count: "exact" }).eq("id", id).eq("production_id", pid);
    if (error) return { ok: false, message: error.message };
    if (!count) return { ok: false, message: "No tienes permiso." };
    return done(pid, "Guardado.");
  }
  const { count } = await supabase.from(TABLAS[tipo]).select("id", { count: "exact", head: true }).eq("production_id", pid);
  const { error } = await supabase.from(TABLAS[tipo]).insert({ ...row, production_id: pid, orden: (count ?? 0) + 1 });
  if (error) return { ok: false, message: error.message };
  return done(pid, "Agregado.");
}

export async function removeRubricItem(_p: State, f: FormData): Promise<State> {
  const pid = str(f, "pid");
  const tipo = str(f, "tipo") as keyof typeof TABLAS;
  if (!(tipo in TABLAS)) return { ok: false, message: "Acción no válida." };
  const supabase = await createClient();
  const { error, count } = await supabase.from(TABLAS[tipo]).delete({ count: "exact" }).eq("id", str(f, "id")).eq("production_id", pid);
  if (error) return { ok: false, message: error.message };
  if (!count) return { ok: false, message: "No tienes permiso." };
  return done(pid, "Quitado.");
}

export async function publishPeriod(_p: State, f: FormData): Promise<State> {
  const pid = str(f, "pid");
  const publicar = str(f, "publicar") === "si";
  const supabase = await createClient();
  const { error, count } = await supabase.from("rubric_periods").update({ publicado_at: publicar ? new Date().toISOString() : null }, { count: "exact" })
    .eq("id", str(f, "id")).eq("production_id", pid);
  if (error) return { ok: false, message: error.message };
  if (!count) return { ok: false, message: "No tienes permiso." };
  return done(pid, publicar ? "Publicado: cada alumno ya ve su evaluación y su boleta." : "Ocultado a los alumnos.");
}

/** Guarda la evaluación de un alumno en un periodo (nivel + número por criterio y comentario). */
export async function saveEvaluation(_p: State, f: FormData): Promise<State> {
  const pid = str(f, "pid"), periodo = str(f, "periodo"), uid = str(f, "uid");
  const criterios = f.getAll("criterio").map(String);
  const scores: { criterion_id: string; level_id: string | null; numero: number | null }[] = [];
  for (const c of criterios) {
    const n = numeroDe(str(f, `n_${c}`));
    if (!n.ok) return { ok: false, message: "Las calificaciones van de 0 a 10." };
    scores.push({ criterion_id: c, level_id: str(f, `l_${c}`) || null, numero: n.n });
  }
  const supabase = await createClient();
  const { data: ev, error } = await supabase.from("rubric_evaluations")
    .upsert({ production_id: pid, period_id: periodo, user_id: uid, comentario: str(f, "comentario") || null }, { onConflict: "period_id,user_id" })
    .select("id").single();
  if (error || !ev) return { ok: false, message: error?.message ?? "No se pudo guardar." };
  const filas = scores.filter((s) => s.level_id || s.numero != null).map((s) => ({ ...s, evaluation_id: ev.id }));
  const vacias = scores.filter((s) => !s.level_id && s.numero == null).map((s) => s.criterion_id);
  if (filas.length) {
    const r = await supabase.from("rubric_scores").upsert(filas, { onConflict: "evaluation_id,criterion_id" });
    if (r.error) return { ok: false, message: r.error.message };
  }
  if (vacias.length) await supabase.from("rubric_scores").delete().eq("evaluation_id", ev.id).in("criterion_id", vacias);
  revalidatePath(`/panel/producciones/${pid}/evaluaciones`, "layout");
  const next = str(f, "siguiente");
  if (f.get("ir") === "siguiente" && next) redirect(`/panel/producciones/${pid}/evaluaciones/${periodo}/${next}`);
  return { ok: true, message: "Evaluación guardada." };
}
