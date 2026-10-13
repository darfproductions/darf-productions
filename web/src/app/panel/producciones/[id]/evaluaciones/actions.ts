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

export async function toggleRubric(_p: State, f: FormData): Promise<State> {
  const pid = str(f, "pid");
  const on = str(f, "on") === "si";
  const supabase = await createClient();
  const { error } = await supabase.rpc("rubric_set_active", { pid, on_: on });
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/cuenta/produccion/${pid}`);
  return done(pid, on ? "Evaluaciones encendidas en esta obra." : "Evaluaciones apagadas: nadie captura y los alumnos no las ven.");
}

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
  if (tipo === "criterio") {
    row.descripcion = str(f, "descripcion") || null;
    if (f.has("compartido")) row.compartido = f.getAll("compartido").includes("on");
  }
  if (tipo === "periodo" && f.has("desde")) {
    row.desde = str(f, "desde") || null;
    row.hasta = str(f, "hasta") || null;
    if (row.desde && row.hasta && String(row.desde) > String(row.hasta)) return { ok: false, message: "La fecha de inicio va antes de la de fin." };
  }
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

/** Materias que califica un maestro (0059). Sin materias = coordina toda la rúbrica. */
export async function setTeacherCriteria(_p: State, f: FormData): Promise<State> {
  const pid = str(f, "pid"), uid = str(f, "uid");
  const crits = f.getAll("crit").map(String).filter(Boolean);
  const supabase = await createClient();
  // Primero agrega las nuevas y luego quita las demás: si algo falla, el maestro nunca se queda
  // sin materias (eso lo volvería coordinador de toda la rúbrica).
  if (crits.length) {
    const { error } = await supabase.from("rubric_teachers").upsert(crits.map((c) => ({ production_id: pid, user_id: uid, criterion_id: c })), { onConflict: "production_id,user_id,criterion_id", ignoreDuplicates: true });
    if (error) return { ok: false, message: error.message };
  }
  let del = supabase.from("rubric_teachers").delete().eq("production_id", pid).eq("user_id", uid);
  if (crits.length) del = del.not("criterion_id", "in", `(${crits.join(",")})`);
  const { error: eDel } = await del;
  if (eDel) return { ok: false, message: eDel.message };
  return done(pid, crits.length ? "Materias asignadas." : "Sin materias: este maestro coordina toda la rúbrica.");
}

/** Guarda lo que este maestro califica de un alumno: sus materias, su parte de lo compartido y su comentario. */
export async function saveEvaluation(_p: State, f: FormData): Promise<State> {
  const pid = str(f, "pid"), periodo = str(f, "periodo"), uid = str(f, "uid");
  const supabase = await createClient();
  const { data: me } = await supabase.auth.getUser();
  if (!me.user) return { ok: false, message: "Tu sesión expiró." };
  const leer = (prefix: string, ids: string[]) => {
    const out: { criterion_id: string; level_id: string | null; numero: number | null }[] = [];
    for (const c of ids) {
      const n = numeroDe(str(f, `${prefix}n_${c}`));
      if (!n.ok) return null;
      out.push({ criterion_id: c, level_id: str(f, `${prefix}l_${c}`) || null, numero: n.n });
    }
    return out;
  };
  const scores = leer("", f.getAll("criterio").map(String));
  const shared = leer("s", f.getAll("compartido").map(String));
  if (!scores || !shared) return { ok: false, message: "Las calificaciones van de 0 a 10." };

  const row: Record<string, unknown> = { production_id: pid, period_id: periodo, user_id: uid };
  if (f.has("comentario")) row.comentario = str(f, "comentario") || null;
  const { data: ev, error } = await supabase.from("rubric_evaluations").upsert(row, { onConflict: "period_id,user_id" }).select("id").single();
  if (error || !ev) return { ok: false, message: error?.message ?? "No se pudo guardar." };

  const llenas = <T extends { level_id: string | null; numero: number | null }>(xs: T[]) => xs.filter((s) => s.level_id || s.numero != null);
  const vacias = <T extends { criterion_id: string; level_id: string | null; numero: number | null }>(xs: T[]) => xs.filter((s) => !s.level_id && s.numero == null).map((s) => s.criterion_id);
  if (llenas(scores).length) {
    const r = await supabase.from("rubric_scores").upsert(llenas(scores).map((s) => ({ ...s, evaluation_id: ev.id })), { onConflict: "evaluation_id,criterion_id" });
    if (r.error) return { ok: false, message: r.error.message.includes("row-level") ? "Solo puedes calificar tus materias." : r.error.message };
  }
  if (vacias(scores).length) {
    const r = await supabase.from("rubric_scores").delete().eq("evaluation_id", ev.id).in("criterion_id", vacias(scores));
    if (r.error) return { ok: false, message: r.error.message };
  }
  if (llenas(shared).length) {
    const r = await supabase.from("rubric_shared_scores").upsert(llenas(shared).map((s) => ({ ...s, evaluation_id: ev.id, teacher_id: me.user!.id })), { onConflict: "evaluation_id,criterion_id,teacher_id" });
    if (r.error) return { ok: false, message: r.error.message };
  }
  if (vacias(shared).length) {
    const r = await supabase.from("rubric_shared_scores").delete().eq("evaluation_id", ev.id).eq("teacher_id", me.user.id).in("criterion_id", vacias(shared));
    if (r.error) return { ok: false, message: r.error.message };
  }
  // Correcciones del Director general a lo de otros maestros (la base solo lo permite al Director).
  const otros = [...f.keys()].filter((k) => k.startsWith("on_")).map((k) => k.slice(3));
  for (const key of new Set(otros)) {
    const [crit, teacher] = key.split("__");
    const n = numeroDe(str(f, `on_${key}`));
    if (!n.ok) return { ok: false, message: "Las calificaciones van de 0 a 10." };
    const lvl = str(f, `ol_${key}`) || null;
    const r = lvl || n.n != null
      ? await supabase.from("rubric_shared_scores").upsert({ evaluation_id: ev.id, criterion_id: crit, teacher_id: teacher, level_id: lvl, numero: n.n }, { onConflict: "evaluation_id,criterion_id,teacher_id" })
      : await supabase.from("rubric_shared_scores").delete().eq("evaluation_id", ev.id).eq("criterion_id", crit).eq("teacher_id", teacher);
    if (r.error) return { ok: false, message: r.error.message };
  }
  for (const k of [...f.keys()].filter((k) => k.startsWith("onota_"))) {
    const teacher = k.slice(6);
    const txt = str(f, k);
    const r = txt
      ? await supabase.from("rubric_notes").upsert({ evaluation_id: ev.id, teacher_id: teacher, comentario: txt, updated_at: new Date().toISOString() }, { onConflict: "evaluation_id,teacher_id" })
      : await supabase.from("rubric_notes").delete().eq("evaluation_id", ev.id).eq("teacher_id", teacher);
    if (r.error) return { ok: false, message: r.error.message };
  }
  const nota = str(f, "nota");
  if (nota) {
    const r = await supabase.from("rubric_notes").upsert({ evaluation_id: ev.id, teacher_id: me.user.id, comentario: nota, updated_at: new Date().toISOString() }, { onConflict: "evaluation_id,teacher_id" });
    if (r.error) return { ok: false, message: r.error.message };
  } else {
    const r = await supabase.from("rubric_notes").delete().eq("evaluation_id", ev.id).eq("teacher_id", me.user.id);
    if (r.error) return { ok: false, message: r.error.message };
  }
  revalidatePath(`/panel/producciones/${pid}/evaluaciones`, "layout");
  const next = str(f, "siguiente");
  if (f.get("ir") === "siguiente" && next) redirect(`/panel/producciones/${pid}/evaluaciones/${periodo}/${next}`);
  return { ok: true, message: "Evaluación guardada." };
}
