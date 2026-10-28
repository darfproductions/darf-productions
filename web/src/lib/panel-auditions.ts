import { notFound, redirect } from "next/navigation";
import type { AuditionOptions, Criterio } from "@/lib/audition-rules";
import { canAudition, canConfigAudition, canSeeAudition } from "@/lib/panel-nav";
import { requirePanel, type PanelAccess } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

// Lecturas de audiciones para el panel (0036, 0037). Una convocatoria puede ser de
// una obra o general (production_id null).

export type PanelAudition = AuditionOptions & {
  id: string; production_id: string | null; titulo: string; descripcion: string | null; requisitos: string | null; sede: string | null;
  estado: string; inscripcion_cierra: string | null; edad_min: number | null; edad_max: number | null; created_at: string;
  criterios: Criterio[]; plantilla: string | null; permanente: boolean;
  /** 0116: números por personaje ya repartidos. */
  numeros_asignados_at: string | null;
  /** 0089: audiciones con votación. */
  con_callback: boolean; fase: import("@/lib/votacion-rules").Fase;
  /** 0131: callback hoy o en otra fecha (con hora y lugar). */
  en_escena?: string | null;
  callback_cuando?: "hoy" | "otra_fecha" | null; callback_fecha?: string | null; callback_lugar?: string | null;
  /** 0112: preguntas del host el día de la audición. */
  preguntas_entrevista?: string[];
  productions?: { nombre: string } | null;
};

const COLS = "*, productions(nombre)";

export async function listAuditions(pid: string): Promise<PanelAudition[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("auditions").select(COLS).eq("production_id", pid).order("created_at", { ascending: false });
  return (data ?? []) as PanelAudition[];
}

/** Todas las convocatorias que puedo trabajar en el panel (la lectura pública trae más; se filtran por permiso). */
export async function listPanelAuditions(access: PanelAccess): Promise<PanelAudition[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("auditions").select(COLS).order("created_at", { ascending: false });
  return ((data ?? []) as PanelAudition[]).filter((a) => canSeeAudition(access, a));
}

export async function getPanelAudition(aid: string): Promise<PanelAudition | null> {
  if (!/^[0-9a-f-]{36}$/.test(aid)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("auditions").select(COLS).eq("id", aid).maybeSingle();
  return (data as PanelAudition) ?? null;
}

/**
 * Para páginas de una convocatoria: exige sesión, que exista y alguno de los permisos.
 * Devuelve la convocatoria y una función para revisar permisos sobre ella.
 */
export async function requireAudition(aid: string, perms: string[], path = "") {
  const access = await requirePanel(`/panel/audiciones/${aid}${path}`);
  const a = await getPanelAudition(aid);
  if (!a || !canSeeAudition(access, a)) notFound();
  const may = (perm: string) => canAudition(access, a, perm);
  if (perms.length && !perms.some(may)) redirect(`/panel/audiciones/${aid}`);
  return { access, a, may, config: canConfigAudition(access, a) };
}

/** Enlaces temporales (1 hora) a las fotos privadas de aspirantes; la base decide quién puede. */
export async function signPhotos(paths: (string | null)[]): Promise<Map<string, string>> {
  const list = [...new Set(paths.filter((p): p is string => !!p))];
  if (!list.length) return new Map();
  const supabase = await createClient();
  const { data } = await supabase.storage.from("audiciones").createSignedUrls(list, 3600);
  return new Map((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path as string, d.signedUrl as string]));
}
