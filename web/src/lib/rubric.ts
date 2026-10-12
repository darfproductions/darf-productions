import { createClient } from "@/lib/supabase/server";
import { promedio, type Criterio, type Nivel, type Periodo, type Score } from "@/lib/rubric-rules";
import type { BoletaData } from "@/lib/pdf-boleta";

// Lecturas de la rúbrica (0058). Pasan por RLS: el equipo con rubrica.gestionar ve todo;
// el alumno, solo lo suyo de periodos publicados.

export async function getRubric(pid: string) {
  const supabase = await createClient();
  const [c, l, p] = await Promise.all([
    supabase.from("rubric_criteria").select("id, nombre, descripcion, orden").eq("production_id", pid).order("orden"),
    supabase.from("rubric_levels").select("id, nombre, orden").eq("production_id", pid).order("orden"),
    supabase.from("rubric_periods").select("id, nombre, orden, publicado_at").eq("production_id", pid).order("orden"),
  ]);
  return { criterios: (c.data ?? []) as Criterio[], niveles: (l.data ?? []) as Nivel[], periodos: (p.data ?? []) as Periodo[] };
}

export type Evaluacion = { id: string; user_id: string; period_id: string; comentario: string | null; updated_at: string; rubric_scores: Score[] };

export async function getEvaluations(pid: string, opts: { periodo?: string; uid?: string } = {}): Promise<Evaluacion[]> {
  const supabase = await createClient();
  let q = supabase.from("rubric_evaluations").select("id, user_id, period_id, comentario, updated_at, rubric_scores(criterion_id, level_id, numero)").eq("production_id", pid);
  if (opts.periodo) q = q.eq("period_id", opts.periodo);
  if (opts.uid) q = q.eq("user_id", opts.uid);
  const { data } = await q;
  return ((data ?? []) as Evaluacion[]).map((e) => ({ ...e, rubric_scores: e.rubric_scores.map((s) => ({ ...s, numero: s.numero == null ? null : Number(s.numero) })) }));
}

const fechaLarga = (d: Date) => new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeZone: "America/Mexico_City" }).format(d);

/** Datos de la boleta de un alumno en un periodo (null si no hay evaluación visible). */
export async function boletaData(pid: string, periodo: string, uid: string, alumno: string): Promise<BoletaData | null> {
  const supabase = await createClient();
  const [{ criterios, niveles, periodos }, evs, prod] = await Promise.all([
    getRubric(pid), getEvaluations(pid, { periodo, uid }), supabase.from("productions").select("nombre").eq("id", pid).maybeSingle(),
  ]);
  const ev = evs[0];
  const per = periodos.find((p) => p.id === periodo);
  if (!ev || !per) return null;
  const nivel = new Map(niveles.map((n) => [n.id, n.nombre]));
  const filas = criterios.map((c) => {
    const s = ev.rubric_scores.find((x) => x.criterion_id === c.id);
    return { criterio: c.nombre, nivel: s?.level_id ? nivel.get(s.level_id) ?? null : null, numero: s?.numero ?? null };
  });
  return { obra: (prod.data?.nombre as string) ?? pid, periodo: per.nombre, alumno, fecha: fechaLarga(new Date(ev.updated_at)), filas, promedio: promedio(filas), comentario: ev.comentario };
}
