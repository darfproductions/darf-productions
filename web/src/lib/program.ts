import { createClient } from "@/lib/supabase/server";

// Programa digital (0048). Pasa por RLS: el público solo lo ve publicado y con la obra pública.

export type ProgramPage = {
  production_id: string; publicado: boolean; notas_direccion: string | null; firma_direccion: string | null; mensaje: string | null;
  mostrar_canciones: boolean; mostrar_equipos: boolean; mostrar_agradecimientos: boolean;
  modo: ProgramMode; enlace_url: string | null; archivo_path: string | null;
};
/** plantilla = página de DARF; enlace = link externo; archivo = PDF o imagen subido (0049). */
export type ProgramMode = "plantilla" | "enlace" | "archivo";
export const PROGRAM_MODES: Record<ProgramMode, { label: string; help: string }> = {
  plantilla: { label: "Plantilla de la página", help: "Se llena sola con la obra; agregas notas, mensaje y patrocinadores." },
  enlace: { label: "Enlace", help: "Un link a tu programa (Canva, Drive u otra página)." },
  archivo: { label: "Archivo", help: "Sube un PDF o una imagen (máx. 20 MB)." },
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
