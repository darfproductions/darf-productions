import { createClient } from "@/lib/supabase/server";

// Datos para los editores del panel (con RLS: el equipo ve su obra aunque sea borrador).

export type EditableProduction = {
  id: string;
  nombre: string;
  estado: string;
  venue: string | null;
  temporada: string | null;
  fecha: string | null;
  duracion: string | null;
  clasificacion: string | null;
  basada_en: string | null;
  frase: string | null;
  sinopsis: string | null;
  color_fondo: string | null;
  color_superficie: string | null;
  color_texto: string | null;
  color_acento: string | null;
  logo_path: string | null;
  ambiente_path: string | null;
  on_sale: boolean;
};

export async function getEditorData(id: string) {
  const supabase = await createClient();
  const [prod, acts, songs, facts, thanks, media] = await Promise.all([
    supabase
      .from("productions")
      .select("id, nombre, estado, venue, temporada, fecha, duracion, clasificacion, basada_en, frase, sinopsis, color_fondo, color_superficie, color_texto, color_acento, logo_path, ambiente_path, on_sale")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("production_acts").select("id, nombre").eq("production_id", id).order("orden"),
    supabase.from("production_songs").select("act_id, titulo").eq("production_id", id).order("orden"),
    supabase.from("production_facts").select("etiqueta, valor").eq("production_id", id).order("orden"),
    supabase.from("production_thanks").select("texto").eq("production_id", id).order("orden"),
    supabase.from("production_media").select("tipo, titulo, youtube_id").eq("production_id", id).order("orden"),
  ]);
  if (!prod.data) return null;
  const songRows = songs.data ?? [];
  const actos = (acts.data ?? []).map((a) => ({ nombre: a.nombre as string, canciones: songRows.filter((s) => s.act_id === a.id).map((s) => s.titulo as string) }));
  const sueltas = songRows.filter((s) => !s.act_id).map((s) => s.titulo as string);
  if (sueltas.length || actos.length === 0) actos.unshift({ nombre: "", canciones: sueltas });
  const mediaRows = (media.data ?? []) as { tipo: string; titulo: string; youtube_id: string }[];
  return {
    production: prod.data as EditableProduction,
    actos,
    facts: (facts.data ?? []) as { etiqueta: string; valor: string }[],
    thanks: (thanks.data ?? []).map((t) => t.texto as string),
    videos: mediaRows.filter((m) => m.tipo === "video"),
    ensayos: mediaRows.filter((m) => m.tipo === "ensayo"),
  };
}
