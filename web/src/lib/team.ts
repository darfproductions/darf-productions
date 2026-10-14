import { createClient } from "@/lib/supabase/server";
import type { Acuerdo, TeamAudience } from "@/lib/team-rules";

// Lecturas del portal del equipo (0065). Pasan por RLS: quien lo maneja ve todo; cada
// persona del equipo ve solo lo que va dirigido a ella. pid null = espacio general de DARF.

export type TeamMaterial = TeamAudience & { id: string; titulo: string; descripcion: string | null; carpeta: string | null; archivo_path: string | null; url: string | null; created_at: string; created_by: string | null };
export type TeamComment = { id: string; material_id: string; autor: string; cuerpo: string; created_at: string };
export type TeamAnnouncement = TeamAudience & { id: string; titulo: string; cuerpo: string; importante: boolean; created_at: string };
export type TeamNote = {
  id: string; contexto: string | null; cuerpo: string; para_roles: string[]; para_personas: string[]; prioridad: "normal" | "urgente";
  atendida_at: string | null; atendida_por: string | null; respuesta: string | null; created_at: string;
};
export type TeamMeeting = TeamAudience & {
  id: string; tipo: string; titulo: string; inicia: string; termina: string | null; lugar: string | null; enlace: string | null; agenda: string | null;
  estado: "programada" | "realizada"; resumen: string | null; acuerdos: Acuerdo[]; transcript_path: string | null; transcript_texto: string | null; grabacion_url: string | null;
};
export type TeamSpace = { materiales: TeamMaterial[]; avisos: TeamAnnouncement[]; notas: TeamNote[]; juntas: TeamMeeting[]; comentarios: TeamComment[] };

export async function getTeamSpace(pid: string | null): Promise<TeamSpace> {
  const supabase = await createClient();
  const m0 = supabase.from("team_materials").select("id, titulo, descripcion, carpeta, archivo_path, url, audiencia, roles, personas, created_at, created_by");
  const a0 = supabase.from("team_announcements").select("id, titulo, cuerpo, importante, audiencia, roles, personas, created_at");
  const n0 = supabase.from("team_notes").select("id, contexto, cuerpo, para_roles, para_personas, prioridad, atendida_at, atendida_por, respuesta, created_at");
  const j0 = supabase.from("team_meetings").select("*");
  const [m, a, n, j] = await Promise.all([
    (pid ? m0.eq("production_id", pid) : m0.is("production_id", null)).order("created_at", { ascending: false }),
    (pid ? a0.eq("production_id", pid) : a0.is("production_id", null)).order("created_at", { ascending: false }).limit(60),
    (pid ? n0.eq("production_id", pid) : n0.is("production_id", null)).order("created_at", { ascending: false }).limit(200),
    (pid ? j0.eq("production_id", pid) : j0.is("production_id", null)).order("inicia", { ascending: false }).limit(100),
  ]);
  const materiales = (m.data ?? []) as TeamMaterial[];
  const { data: com } = materiales.length
    ? await supabase.from("team_comments").select("id, material_id, autor, cuerpo, created_at").in("material_id", materiales.map((x) => x.id)).order("created_at")
    : { data: [] };
  return {
    comentarios: (com ?? []) as TeamComment[],
    materiales,
    avisos: (a.data ?? []) as TeamAnnouncement[],
    notas: (n.data ?? []) as TeamNote[],
    juntas: (j.data ?? []) as TeamMeeting[],
  };
}

/** Enlaces temporales (1 hora) a archivos del equipo; la base decide quién puede. */
export async function signTeamFiles(paths: (string | null)[]): Promise<Map<string, string>> {
  const list = [...new Set(paths.filter((p): p is string => !!p))];
  if (!list.length) return new Map();
  const supabase = await createClient();
  const { data } = await supabase.storage.from("equipo").createSignedUrls(list, 3600);
  return new Map((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path as string, d.signedUrl as string]));
}

/** Roles del panel (sin Integrante), para elegir a quién va algo. */
export async function teamRoles(): Promise<{ id: string; nombre: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("panel_roles").select("id, nombre").neq("id", "integrante").eq("alcance", "obra").order("orden");
  return (data ?? []) as { id: string; nombre: string }[];
}

export type TeamPerson = { user_id: string; nombre: string; roles: string[]; role_ids: string[] };

export async function teamRoster(pid: string | null): Promise<TeamPerson[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("team_roster", { pid });
  return (data ?? []) as TeamPerson[];
}

export async function teamReadStatus(aid: string): Promise<{ user_id: string; nombre: string; leido_at: string | null }[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("team_announcement_read_status", { aid });
  return (data ?? []) as { user_id: string; nombre: string; leido_at: string | null }[];
}

/** Nombres y roles del equipo para cualquiera del equipo (sin correos). */
export async function teamRosterPublic(pid: string | null): Promise<{ user_id: string; nombre: string; role_ids: string[] }[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("team_roster_public", { pid });
  return (data ?? []) as { user_id: string; nombre: string; role_ids: string[] }[];
}
