"use server";

import { revalidatePath } from "next/cache";
import { localMxToIso } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { espacioId, espacioPid, parseAcuerdos, parseNoteTargets, parseTeamAudience } from "@/lib/team-rules";

// Acciones del portal del equipo (0065). La base revisa equipo.gestionar (general: el Director)
// y que cada quien solo marque sus propias notas y avisos.

export type TeamState = { ok: boolean; message: string } | null;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function refresh(pid: string | null) {
  revalidatePath(pid ? `/panel/producciones/${pid}/equipo` : "/panel/personas/equipo/portal");
  revalidatePath(`/cuenta/equipo/${espacioId(pid)}`);
  revalidatePath("/panel");
}

async function roleIds(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("panel_roles").select("id");
  return (data ?? []).map((r) => r.id as string);
}

const fail = (e: { message: string } | null, n?: number | null) =>
  e ? { ok: false, message: e.message } : n === 0 ? { ok: false, message: "No tienes permiso." } : null;

// ──── Materiales ────
export async function saveTeamMaterial(_p: TeamState, f: FormData): Promise<TeamState> {
  const pid = espacioPid(str(f, "espacio"));
  const aud = parseTeamAudience(f, await roleIds());
  if ("error" in aud) return { ok: false, message: aud.error };
  const archivo = str(f, "archivo_path");
  const url = str(f, "url");
  if (!str(f, "titulo")) return { ok: false, message: "Escribe un título." };
  if (!archivo && !url) return { ok: false, message: "Sube un archivo o pega un enlace." };
  if (!archivo && !/^https:\/\/\S+$/i.test(url)) return { ok: false, message: "El enlace debe empezar con https://" };
  const supabase = await createClient();
  const { error } = await supabase.from("team_materials").insert({
    production_id: pid, titulo: str(f, "titulo"), descripcion: str(f, "descripcion") || null, carpeta: str(f, "carpeta") || null,
    archivo_path: archivo || null, url: archivo ? null : url, ...aud,
  });
  if (error) return { ok: false, message: error.message };
  refresh(pid);
  return { ok: true, message: "Material agregado." };
}

export async function removeTeamMaterial(_p: TeamState, f: FormData): Promise<TeamState> {
  const pid = espacioPid(str(f, "espacio"));
  const supabase = await createClient();
  const { data: m } = await supabase.from("team_materials").select("archivo_path").eq("id", str(f, "id")).maybeSingle();
  const { error, count } = await supabase.from("team_materials").delete({ count: "exact" }).eq("id", str(f, "id"));
  const bad = fail(error, count);
  if (bad) return bad;
  if (m?.archivo_path) await supabase.storage.from("equipo").remove([m.archivo_path as string]);
  refresh(pid);
  return { ok: true, message: "Material quitado." };
}

// ──── Avisos ────
export async function sendTeamAnnouncement(_p: TeamState, f: FormData): Promise<TeamState> {
  const pid = espacioPid(str(f, "espacio"));
  const aud = parseTeamAudience(f, await roleIds());
  if ("error" in aud) return { ok: false, message: aud.error };
  if (!str(f, "titulo") || !str(f, "cuerpo")) return { ok: false, message: "Escribe el título y el mensaje." };
  const supabase = await createClient();
  const { error } = await supabase.from("team_announcements").insert({
    production_id: pid, titulo: str(f, "titulo"), cuerpo: str(f, "cuerpo"), importante: f.get("importante") === "on", ...aud,
  });
  if (error) return { ok: false, message: error.message };
  refresh(pid);
  return { ok: true, message: "Aviso enviado." };
}

export async function removeTeamAnnouncement(_p: TeamState, f: FormData): Promise<TeamState> {
  const pid = espacioPid(str(f, "espacio"));
  const supabase = await createClient();
  const { error, count } = await supabase.from("team_announcements").delete({ count: "exact" }).eq("id", str(f, "id"));
  const bad = fail(error, count);
  if (bad) return bad;
  refresh(pid);
  return { ok: true, message: "Aviso borrado." };
}

// ──── Notas de dirección ────
export async function sendTeamNote(_p: TeamState, f: FormData): Promise<TeamState> {
  const pid = espacioPid(str(f, "espacio"));
  const para = parseNoteTargets(f, await roleIds());
  if ("error" in para) return { ok: false, message: para.error };
  if (!str(f, "cuerpo")) return { ok: false, message: "Escribe la nota." };
  const supabase = await createClient();
  const { error } = await supabase.from("team_notes").insert({
    production_id: pid, contexto: str(f, "contexto") || null, cuerpo: str(f, "cuerpo"),
    prioridad: f.get("urgente") === "on" ? "urgente" : "normal", ...para,
  });
  if (error) return { ok: false, message: error.message };
  refresh(pid);
  return { ok: true, message: "Nota enviada." };
}

export async function removeTeamNote(_p: TeamState, f: FormData): Promise<TeamState> {
  const pid = espacioPid(str(f, "espacio"));
  const supabase = await createClient();
  const { error, count } = await supabase.from("team_notes").delete({ count: "exact" }).eq("id", str(f, "id"));
  const bad = fail(error, count);
  if (bad) return bad;
  refresh(pid);
  return { ok: true, message: "Nota borrada." };
}

// ──── Juntas y llamados ────
export async function saveMeeting(_p: TeamState, f: FormData): Promise<TeamState> {
  const pid = espacioPid(str(f, "espacio"));
  const aud = parseTeamAudience(f, await roleIds());
  if ("error" in aud) return { ok: false, message: aud.error };
  const inicia = str(f, "inicia");
  if (!str(f, "titulo") || !inicia) return { ok: false, message: "Escribe el título y la fecha." };
  const enlace = str(f, "enlace");
  if (enlace && !/^https:\/\/\S+$/i.test(enlace)) return { ok: false, message: "El enlace debe empezar con https://" };
  const iso = localMxToIso(inicia);
  if (!iso) return { ok: false, message: "Revisa la fecha y hora." };
  const supabase = await createClient();
  const { error } = await supabase.from("team_meetings").insert({
    production_id: pid, tipo: str(f, "tipo") || "junta", titulo: str(f, "titulo"), inicia: iso,
    lugar: str(f, "lugar") || null, enlace: enlace || null, agenda: str(f, "agenda") || null, ...aud,
  });
  if (error) return { ok: false, message: error.message };
  refresh(pid);
  return { ok: true, message: "Junta agendada." };
}

/** Cerrar la junta: resumen, acuerdos, transcript (archivo o texto) y grabación. */
export async function closeMeeting(_p: TeamState, f: FormData): Promise<TeamState> {
  const pid = espacioPid(str(f, "espacio"));
  const grabacion = str(f, "grabacion_url");
  if (grabacion && !/^https:\/\/\S+$/i.test(grabacion)) return { ok: false, message: "El enlace de la grabación debe empezar con https://" };
  const resumen = str(f, "resumen");
  const transcript = str(f, "transcript_texto");
  const path = str(f, "transcript_path");
  if (!resumen && !transcript && !path) return { ok: false, message: "Agrega el resumen o el transcript." };
  const supabase = await createClient();
  const cambios: Record<string, unknown> = {
    estado: "realizada", resumen: resumen || null, acuerdos: parseAcuerdos(str(f, "acuerdos")),
    transcript_texto: transcript || null, grabacion_url: grabacion || null,
  };
  if (path) cambios.transcript_path = path;
  const { error, count } = await supabase.from("team_meetings").update(cambios, { count: "exact" }).eq("id", str(f, "id"));
  const bad = fail(error, count);
  if (bad) return bad;
  refresh(pid);
  return { ok: true, message: "Junta cerrada: el equipo ya ve el resumen." };
}

export async function removeMeeting(_p: TeamState, f: FormData): Promise<TeamState> {
  const pid = espacioPid(str(f, "espacio"));
  const supabase = await createClient();
  const { data: j } = await supabase.from("team_meetings").select("transcript_path").eq("id", str(f, "id")).maybeSingle();
  const { error, count } = await supabase.from("team_meetings").delete({ count: "exact" }).eq("id", str(f, "id"));
  const bad = fail(error, count);
  if (bad) return bad;
  if (j?.transcript_path) await supabase.storage.from("equipo").remove([j.transcript_path as string]);
  refresh(pid);
  return { ok: true, message: "Junta borrada." };
}

// ──── Portal: cada persona del equipo ────
export async function markTeamRead(_p: TeamState, f: FormData): Promise<TeamState> {
  const pid = espacioPid(str(f, "espacio"));
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Inicia sesión." };
  const { error } = await supabase.from("team_announcement_reads").insert({ announcement_id: str(f, "id"), user_id: user.id });
  if (error && error.code !== "23505") return { ok: false, message: error.message };
  refresh(pid);
  return { ok: true, message: "Enterado." };
}

export async function attendNote(_p: TeamState, f: FormData): Promise<TeamState> {
  const pid = espacioPid(str(f, "espacio"));
  const deshacer = f.get("deshacer") === "1";
  const supabase = await createClient();
  const { error, count } = await supabase.from("team_notes")
    .update({ atendida_at: deshacer ? null : new Date().toISOString(), respuesta: deshacer ? null : str(f, "respuesta") || null }, { count: "exact" })
    .eq("id", str(f, "id"));
  const bad = fail(error, count);
  if (bad) return bad;
  refresh(pid);
  return { ok: true, message: deshacer ? "Nota pendiente otra vez." : "Nota atendida." };
}
