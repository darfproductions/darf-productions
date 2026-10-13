import type { Anuncio, AnuncioLugar } from "@/lib/anuncio-rules";
import { createClient } from "@/lib/supabase/server";

// Lectura de anuncios (0074). El público usa anuncios_publicos: sin contenido antes de tiempo.

export type AnuncioVista = Anuncio & { imagen_url: string | null };

export async function getAnuncios(lugar: AnuncioLugar, pid: string | null = null): Promise<AnuncioVista[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("anuncios_publicos", { p_lugar: lugar, pid });
  if (error) return []; // sin anuncios no se rompe la página
  return ((data ?? []) as Anuncio[]).map((a) => ({
    ...a,
    imagen_url: a.imagen_path ? supabase.storage.from("gallery").getPublicUrl(a.imagen_path).data.publicUrl : null,
  }));
}

/** Fila completa para el panel (la tabla solo la leen quienes pueden editar). */
export type AnuncioPanel = {
  id: string; lugar: AnuncioLugar; production_id: string | null; tipo: Anuncio["tipo"]; titulo: string;
  adelanto: string | null; contenido: string | null; imagen_path: string | null; enlace: string | null; boton: string | null;
  revela_at: string | null; termina: string | null; registro: boolean; solo_club: boolean; publicado: boolean;
  orden: number; avisado_at: string | null; created_at: string; registros: number;
};

export async function listAnunciosPanel(filtro: { pid: string } | { sitio: true }): Promise<AnuncioPanel[]> {
  const supabase = await createClient();
  let q = supabase
    .from("anuncios")
    .select("id, lugar, production_id, tipo, titulo, adelanto, contenido, imagen_path, enlace, boton, revela_at, termina, registro, solo_club, publicado, orden, avisado_at, created_at, anuncio_registros(count)")
    .order("orden")
    .order("created_at", { ascending: false });
  q = "pid" in filtro ? q.eq("production_id", filtro.pid) : q.is("production_id", null);
  const { data } = await q;
  return (data ?? []).map((r) => {
    const { anuncio_registros, ...resto } = r as typeof r & { anuncio_registros: { count: number }[] };
    return { ...(resto as Omit<AnuncioPanel, "registros">), registros: anuncio_registros?.[0]?.count ?? 0 };
  });
}
