import { createClient } from "@/lib/supabase/server";

// Lecturas de audiciones para el panel (0036).

export type PanelAudition = {
  id: string; titulo: string; descripcion: string | null; requisitos: string | null; sede: string | null;
  estado: string; inscripcion_cierra: string | null; edad_min: number | null; edad_max: number | null; created_at: string;
};

export async function listAuditions(pid: string): Promise<PanelAudition[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("auditions").select("*").eq("production_id", pid).order("created_at", { ascending: false });
  return (data ?? []) as PanelAudition[];
}

export async function getPanelAudition(aid: string): Promise<PanelAudition | null> {
  if (!/^[0-9a-f-]{36}$/.test(aid)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("auditions").select("*").eq("id", aid).maybeSingle();
  return (data as PanelAudition) ?? null;
}

/** Enlaces temporales (1 hora) a las fotos privadas de aspirantes; la base decide quién puede. */
export async function signPhotos(paths: (string | null)[]): Promise<Map<string, string>> {
  const list = [...new Set(paths.filter((p): p is string => !!p))];
  if (!list.length) return new Map();
  const supabase = await createClient();
  const { data } = await supabase.storage.from("audiciones").createSignedUrls(list, 3600);
  return new Map((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path as string, d.signedUrl as string]));
}
