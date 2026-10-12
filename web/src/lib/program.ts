import { createClient } from "@/lib/supabase/server";

// Programa digital (0048). Pasa por RLS: el público solo lo ve publicado y con la obra pública.

export type ProgramPage = {
  production_id: string; publicado: boolean; notas_direccion: string | null; firma_direccion: string | null; mensaje: string | null;
  mostrar_canciones: boolean; mostrar_equipos: boolean; mostrar_agradecimientos: boolean;
};
export type Sponsor = { id: string; nombre: string; url: string | null; logo_path: string | null; orden: number };

export async function getProgram(pid: string): Promise<{ page: ProgramPage | null; sponsors: Sponsor[] }> {
  const supabase = await createClient();
  const [page, sponsors] = await Promise.all([
    supabase.from("program_pages").select("*").eq("production_id", pid).maybeSingle(),
    supabase.from("program_sponsors").select("id, nombre, url, logo_path, orden").eq("production_id", pid).order("orden"),
  ]);
  return { page: (page.data as ProgramPage) ?? null, sponsors: (sponsors.data ?? []) as Sponsor[] };
}
