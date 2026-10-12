import { createClient } from "@/lib/supabase/server";

// Materiales privados (0046). Pasan por RLS: cada integrante solo ve los que le tocan.

export const TIPO_MATERIAL: Record<string, string> = {
  partitura: "Partitura", pista: "Pista", libreto: "Libreto", coreografia: "Coreografía", video: "Video", otro: "Otro",
};

export type Material = {
  id: string; titulo: string; descripcion: string | null; tipo: string; carpeta: string | null;
  archivo_path: string | null; url: string | null; audiencia: "todos" | "grupos" | "personas"; grupos: string[]; personas: string[]; created_at: string;
};

export async function listMaterials(pid: string): Promise<Material[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("materials").select("*").eq("production_id", pid).order("carpeta", { nullsFirst: true }).order("titulo");
  return (data ?? []) as Material[];
}

/** Enlaces temporales (1 hora) a los archivos privados; la base decide quién puede. */
export async function signMaterials(paths: (string | null)[]): Promise<Map<string, string>> {
  const list = [...new Set(paths.filter((p): p is string => !!p))];
  if (!list.length) return new Map();
  const supabase = await createClient();
  const { data } = await supabase.storage.from("materiales").createSignedUrls(list, 3600);
  return new Map((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path as string, d.signedUrl as string]));
}

/** Agrupa por carpeta ("" = sin carpeta, primero). */
export function porCarpeta<T extends { carpeta: string | null }>(xs: T[]): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const x of xs) m.set(x.carpeta ?? "", [...(m.get(x.carpeta ?? "") ?? []), x]);
  return [...m.entries()].sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b, "es")));
}
