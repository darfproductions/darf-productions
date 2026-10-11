"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { localMxToIso } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

// Audiciones en el panel (0036). La base decide qué puede cada rol:
// gestionar (dirección), registro (mesa) y evaluar (jueces), por obra.

export type AudState = { ok: boolean; message: string } | null;

const base = (pid: string, aid?: string) => `/panel/producciones/${pid}/audiciones${aid ? `/${aid}` : ""}`;
const done = (pid: string, aid: string, message: string): AudState => {
  revalidatePath(base(pid, aid), "layout");
  revalidatePath(`/audiciones/${aid}`);
  revalidatePath("/audiciones");
  return { ok: true, message };
};
const num = (v: FormDataEntryValue | null) => (String(v ?? "").trim() ? Number(v) : null);

export async function createAudition(_p: AudState, f: FormData): Promise<AudState> {
  const pid = String(f.get("pid"));
  const titulo = String(f.get("titulo") ?? "").trim();
  if (!titulo) return { ok: false, message: "Escribe un título para la convocatoria." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("auditions").insert({ production_id: pid, titulo }).select("id").single();
  if (error) return { ok: false, message: error.message };
  redirect(base(pid, data.id as string));
}

export async function saveAudition(_p: AudState, f: FormData): Promise<AudState> {
  const pid = String(f.get("pid"));
  const aid = String(f.get("aid"));
  const cierra = String(f.get("cierra") ?? "");
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("auditions")
    .update(
      {
        titulo: String(f.get("titulo") ?? "").trim(),
        descripcion: String(f.get("descripcion") ?? "").trim() || null,
        requisitos: String(f.get("requisitos") ?? "").trim() || null,
        sede: String(f.get("sede") ?? "").trim() || null,
        edad_min: num(f.get("edad_min")),
        edad_max: num(f.get("edad_max")),
        inscripcion_cierra: cierra ? localMxToIso(cierra) : null,
      },
      { count: "exact" },
    )
    .eq("id", aid);
  if (error) return { ok: false, message: error.message };
  if (!count) return { ok: false, message: "No tienes permiso para editar esta convocatoria." };
  return done(pid, aid, "Convocatoria guardada.");
}

export async function setAuditionEstado(_p: AudState, f: FormData): Promise<AudState> {
  const pid = String(f.get("pid"));
  const aid = String(f.get("aid"));
  const estado = String(f.get("estado"));
  const supabase = await createClient();
  const { error } = await supabase.from("auditions").update({ estado }).eq("id", aid);
  if (error) return { ok: false, message: error.message };
  return done(pid, aid, estado === "abierta" ? "Convocatoria abierta: ya aparece en la web." : "Estado actualizado.");
}

export async function addRole(_p: AudState, f: FormData): Promise<AudState> {
  const pid = String(f.get("pid"));
  const aid = String(f.get("aid"));
  const supabase = await createClient();
  const { count } = await supabase.from("audition_roles").select("id", { count: "exact", head: true }).eq("audition_id", aid);
  const { error } = await supabase.from("audition_roles").insert({
    audition_id: aid,
    nombre: String(f.get("nombre") ?? "").trim(),
    descripcion: String(f.get("descripcion") ?? "").trim() || null,
    orden: (count ?? 0) + 1,
  });
  if (error) return { ok: false, message: error.message };
  return done(pid, aid, "Personaje agregado.");
}

export async function addSlot(_p: AudState, f: FormData): Promise<AudState> {
  const pid = String(f.get("pid"));
  const aid = String(f.get("aid"));
  const inicia = localMxToIso(String(f.get("inicia") ?? ""));
  if (!inicia) return { ok: false, message: "Elige fecha y hora." };
  const supabase = await createClient();
  const { error } = await supabase.from("audition_slots").insert({ audition_id: aid, inicia, cupo: Number(f.get("cupo") ?? 0), sala: String(f.get("sala") ?? "").trim() || null });
  if (error) return { ok: false, message: error.message };
  return done(pid, aid, "Horario agregado.");
}

export async function addField(_p: AudState, f: FormData): Promise<AudState> {
  const pid = String(f.get("pid"));
  const aid = String(f.get("aid"));
  const tipo = String(f.get("tipo") ?? "texto");
  const opciones = String(f.get("opciones") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (tipo === "opcion" && opciones.length < 2) return { ok: false, message: "Escribe al menos dos opciones separadas por coma." };
  const supabase = await createClient();
  const { count } = await supabase.from("audition_fields").select("id", { count: "exact", head: true }).eq("audition_id", aid);
  const { error } = await supabase.from("audition_fields").insert({
    audition_id: aid,
    etiqueta: String(f.get("etiqueta") ?? "").trim(),
    tipo,
    opciones: tipo === "opcion" ? opciones : null,
    obligatorio: f.get("obligatorio") === "on",
    orden: (count ?? 0) + 1,
  });
  if (error) return { ok: false, message: error.message };
  return done(pid, aid, "Pregunta agregada.");
}

/** Quitar un personaje, horario o pregunta (tabla limitada a esas tres). */
export async function removeItem(_p: AudState, f: FormData): Promise<AudState> {
  const pid = String(f.get("pid"));
  const aid = String(f.get("aid"));
  const tabla = String(f.get("tabla"));
  if (!["audition_roles", "audition_slots", "audition_fields"].includes(tabla)) return { ok: false, message: "No válido." };
  const supabase = await createClient();
  const { error } = await supabase.from(tabla).delete().eq("id", String(f.get("id"))).eq("audition_id", aid);
  if (error) return { ok: false, message: error.message };
  return done(pid, aid, "Quitado.");
}

// ──────── Solicitudes y resultados (gestionar) ────────

export async function setApplicationEstado(_p: AudState, f: FormData): Promise<AudState> {
  const pid = String(f.get("pid"));
  const aid = String(f.get("aid"));
  const estado = String(f.get("estado"));
  const values: Record<string, unknown> = { estado, updated_at: new Date().toISOString() };
  if (estado === "callback") values.ronda = Number(f.get("ronda") ?? 1) + 1;
  const supabase = await createClient();
  const { error, count } = await supabase.from("audition_applications").update(values, { count: "exact" }).eq("id", String(f.get("app"))).eq("audition_id", aid);
  if (error) return { ok: false, message: error.message };
  if (!count) return { ok: false, message: "No tienes permiso para decidir sobre esta solicitud." };
  return done(pid, aid, estado === "callback" ? `Pasa a callback (ronda ${values.ronda}).` : "Estado actualizado.");
}

// ──────── Mesa de registro ────────

export type DeskResult = { result: string; nombre?: string; numero?: number; es_menor?: boolean; estado?: string } | { result: "error"; message: string };

export async function deskCheckin(pid: string, aid: string, ref: string): Promise<DeskResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("audition_checkin", { aid, ref });
  if (error) return { result: "error", message: error.message };
  revalidatePath(base(pid, aid), "layout");
  return data as DeskResult;
}

export async function walkIn(_p: AudState, f: FormData): Promise<AudState> {
  const pid = String(f.get("pid"));
  const aid = String(f.get("aid"));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("audition_walk_in", {
    aid,
    p: {
      nombre: String(f.get("nombre") ?? ""),
      telefono: String(f.get("telefono") ?? ""),
      fecha_nacimiento: String(f.get("fecha_nacimiento") ?? ""),
      tutor_nombre: String(f.get("tutor_nombre") ?? ""),
      tutor_telefono: String(f.get("tutor_telefono") ?? ""),
    },
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath(base(pid, aid), "layout");
  const r = data as { numero: number; nombre: string };
  return { ok: true, message: `${r.nombre} registrado con el número ${r.numero}.` };
}

// ──────── Evaluación (juez) ────────

export async function saveScore(_p: AudState, f: FormData): Promise<AudState> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Tu sesión expiró." };
  const pid = String(f.get("pid"));
  const aid = String(f.get("aid"));
  const v = (k: string) => (String(f.get(k) ?? "") ? Number(f.get(k)) : null);
  const supabase = await createClient();
  const { error } = await supabase.from("audition_scores").upsert(
    {
      application_id: String(f.get("app")),
      judge_id: session.userId,
      ronda: Number(f.get("ronda") ?? 1),
      canto: v("canto"),
      baile: v("baile"),
      actuacion: v("actuacion"),
      actitud: v("actitud"),
      notas: String(f.get("notas") ?? "").trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "application_id,judge_id,ronda" },
  );
  if (error) return { ok: false, message: error.message };
  revalidatePath(`${base(pid, aid)}/evaluacion`);
  return { ok: true, message: "Guardado." };
}
