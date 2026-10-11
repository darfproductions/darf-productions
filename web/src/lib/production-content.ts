import { assetUrl } from "@/lib/productions";
import { createClient } from "@/lib/supabase/server";

// Contenido artístico de una obra (tablas de la migración 0029): sinopsis,
// ficha, canciones, créditos con foto POR OBRA, videos y agradecimientos.

export type Credit = { rol: string; persona: string; /** Retrato de ESTA obra. */ foto?: string };

export type Ficha = { etiqueta: string; valor: string }[];

export type ProductionContent = {
  sinopsis: string[];
  /** Actos opcionales: si la obra no los usa, un solo grupo con nombre vacío. */
  actos: { nombre: string; canciones: string[] }[];
  videos: { titulo: string; youtube: string }[];
  reparto: { personaje: string; persona: string; foto?: string }[];
  ensamble: { persona: string; foto?: string }[];
  creativo: Credit[];
  produccion: Credit[];
  crew: Credit[];
  tecnico: Credit[];
  agradecimientos: string[];
  /** Ficha técnica en el orden fijo de la plantilla, solo campos con valor. */
  ficha: Ficha;
};

type FichaRow = {
  venue: string | null;
  temporada: string | null;
  fecha: string | null;
  duracion: string | null;
  clasificacion: string | null;
  basada_en: string | null;
  sinopsis: string | null;
};

type CreditRow = { tipo: string; papel: string | null; foto_path: string | null; people: { nombre: string } | null };

export async function getProductionContent(id: string): Promise<ProductionContent> {
  const supabase = await createClient();
  const [prod, acts, songs, credits, media, facts, thanks] = await Promise.all([
    supabase.from("productions").select("venue, temporada, fecha, duracion, clasificacion, basada_en, sinopsis").eq("id", id).maybeSingle(),
    supabase.from("production_acts").select("id, nombre").eq("production_id", id).order("orden"),
    supabase.from("production_songs").select("act_id, titulo").eq("production_id", id).order("orden"),
    supabase.from("production_credits").select("tipo, papel, foto_path, people(nombre)").eq("production_id", id).order("orden"),
    supabase.from("production_media").select("titulo, youtube_id").eq("production_id", id).eq("tipo", "video").order("orden"),
    supabase.from("production_facts").select("etiqueta, valor").eq("production_id", id).order("orden"),
    supabase.from("production_thanks").select("texto").eq("production_id", id).order("orden"),
  ]);
  const failed = [prod, acts, songs, credits, media, facts, thanks].find((r) => r.error);
  if (failed?.error) throw new Error(`No se pudo cargar el contenido de la obra: ${failed.error.message}`);

  const p = prod.data as FichaRow | null;
  const songRows = songs.data ?? [];
  const actos = (acts.data ?? []).map((a) => ({
    nombre: a.nombre as string,
    canciones: songRows.filter((s) => s.act_id === a.id).map((s) => s.titulo as string),
  }));
  const sueltas = songRows.filter((s) => !s.act_id).map((s) => s.titulo as string);
  if (sueltas.length) actos.unshift({ nombre: "", canciones: sueltas });

  const rows = (credits.data ?? []) as unknown as CreditRow[];
  const of = (tipo: string) => rows.filter((r) => r.tipo === tipo && r.people);
  const foto = (r: CreditRow) => (r.foto_path ? assetUrl(r.foto_path) : undefined);
  const team = (tipo: string): Credit[] => of(tipo).map((r) => ({ rol: r.papel ?? "", persona: r.people!.nombre, foto: foto(r) }));

  const ficha = [
    { etiqueta: "Temporada", valor: p?.temporada },
    { etiqueta: "Fechas", valor: p?.fecha },
    { etiqueta: "Sede", valor: p?.venue },
    { etiqueta: "Duración", valor: p?.duracion },
    { etiqueta: "Clasificación", valor: p?.clasificacion },
    { etiqueta: "Basada en", valor: p?.basada_en },
    ...(facts.data ?? []),
  ].filter((x): x is { etiqueta: string; valor: string } => !!x.valor);

  return {
    sinopsis: (p?.sinopsis ?? "").split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean),
    actos: actos.filter((a) => a.canciones.length > 0),
    videos: (media.data ?? []).map((m) => ({ titulo: m.titulo as string, youtube: m.youtube_id as string })),
    reparto: of("reparto").map((r) => ({ personaje: r.papel ?? "", persona: r.people!.nombre, foto: foto(r) })),
    ensamble: of("ensamble").map((r) => ({ persona: r.people!.nombre, foto: foto(r) })),
    creativo: team("creativo"),
    produccion: team("produccion"),
    crew: team("crew"),
    tecnico: team("tecnico"),
    agradecimientos: (thanks.data ?? []).map((t) => t.texto as string),
    ficha,
  };
}

/** Videos de ensayo de la Fan Zone (la base solo los muestra con sesión iniciada). */
export async function getRehearsals(id: string): Promise<{ titulo: string; youtube: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("production_media")
    .select("titulo, youtube_id")
    .eq("production_id", id)
    .eq("tipo", "ensayo")
    .order("orden");
  return (data ?? []).map((m) => ({ titulo: m.titulo as string, youtube: m.youtube_id as string }));
}

/** Cuántos ensayos tiene cada obra (para la portada de la Fan Zone). */
export async function getRehearsalCounts(): Promise<Map<string, number>> {
  const supabase = await createClient();
  const { data } = await supabase.from("production_media").select("production_id").eq("tipo", "ensayo");
  const counts = new Map<string, number>();
  for (const r of data ?? []) counts.set(r.production_id as string, (counts.get(r.production_id as string) ?? 0) + 1);
  return counts;
}

/** Cuántos ensayos tiene una obra, también sin sesión (la base solo da el número; 0030). */
export async function getRehearsalCount(id: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("production_rehearsal_count", { pid: id });
  return Number(data ?? 0);
}
