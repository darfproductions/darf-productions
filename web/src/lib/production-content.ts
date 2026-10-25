import { perfilUrl, assetUrl } from "@/lib/productions";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { publico } from "@/lib/supabase/publico";
import type { Capa } from "@/lib/obra-capa-rules";

// Contenido artístico de una obra (tablas de la migración 0029): sinopsis,
// ficha, canciones, créditos con foto POR OBRA, videos y agradecimientos.

export type Credit = { rol: string; persona: string; /** Retrato de ESTA obra (o el del perfil, 0057). */ foto?: string; /** /artistas/<slug> si su perfil es público. */ perfil?: string };

export type Ficha = { etiqueta: string; valor: string }[];

export type ProductionContent = {
  sinopsis: string[];
  /** Actos opcionales: si la obra no los usa, un solo grupo con nombre vacío. */
  actos: { nombre: string; canciones: string[] }[];
  videos: { titulo: string; youtube: string }[];
  reparto: { personaje: string; persona: string; foto?: string; perfil?: string }[];
  ensamble: { persona: string; foto?: string; perfil?: string }[];
  creativo: Credit[];
  produccion: Credit[];
  crew: Credit[];
  tecnico: Credit[];
  /** Staff (0106): solo nombres, sin puesto. */
  staff: Credit[];
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
  idioma: string | null;
  basada_en: string | null;
  sinopsis: string | null;
};

type CreditRow = { tipo: string; papel: string | null; foto_path: string | null; person_id: string; people: { nombre: string } | null };

/** `conSinPublicar`: la vista previa del panel también muestra el elenco aún no publicado (0107).
 *  `capa` (0119): cambios de fans o del borrador encima de lo publicado. */
export async function getProductionContent(id: string, conSinPublicar = false, capa: Capa = {}): Promise<ProductionContent> {
  // La página pública lo lee como visitante y guardado 60 s (lib/supabase/publico.ts); la vista previa, con la sesión.
  const raw = conSinPublicar ? await leerContenido(await createClient(), id, true) : await leerContenidoPublico(id);
  return armarContenido(raw, capa);
}
const leerContenidoPublico = publico("contenido", (sb, id: string) => leerContenido(sb, id, false));

async function leerContenido(supabase: SupabaseClient, id: string, conSinPublicar: boolean) {
  // 0107: la página pública solo muestra el Reparto y Ensamble publicados, aunque quien la vea sea del equipo.
  let creditos = supabase.from("production_credits").select("tipo, papel, foto_path, person_id, people(nombre)").eq("production_id", id).eq("activo", true);
  if (!conSinPublicar) creditos = creditos.eq("publicado", true);
  const [prod, acts, songs, credits, media, facts, thanks, pro] = await Promise.all([
    supabase.from("productions").select("venue, temporada, fecha, duracion, clasificacion, idioma, basada_en, sinopsis").eq("id", id).maybeSingle(),
    supabase.from("production_acts").select("id, nombre").eq("production_id", id).order("orden"),
    supabase.from("production_songs").select("act_id, titulo").eq("production_id", id).order("orden"),
    creditos.order("orden"),
    supabase.from("production_media").select("titulo, youtube_id").eq("production_id", id).eq("tipo", "video").order("orden"),
    supabase.from("production_facts").select("etiqueta, valor").eq("production_id", id).order("orden"),
    supabase.from("production_thanks").select("texto").eq("production_id", id).order("orden"),
    supabase.rpc("production_pro_info", { pid: id }),
  ]);
  const failed = [prod, acts, songs, credits, media, facts, thanks].find((r) => r.error);
  if (failed?.error) throw new Error(`No se pudo cargar el contenido de la obra: ${failed.error.message}`);
  return {
    prod: prod.data as FichaRow | null, acts: (acts.data ?? []) as { id: string; nombre: string }[], songs: (songs.data ?? []) as { act_id: string | null; titulo: string }[],
    credits: (credits.data ?? []) as unknown as CreditRow[], media: (media.data ?? []) as { titulo: string; youtube_id: string }[],
    facts: (facts.data ?? []) as { etiqueta: string; valor: string }[], thanks: (thanks.data ?? []) as { texto: string }[],
    pro: (pro.data ?? []) as { person_id: string; retrato_path: string | null; slug: string | null }[],
  };
}

function armarContenido(raw: Awaited<ReturnType<typeof leerContenido>>, capa: Capa): ProductionContent {
  const { prod, acts, songs, credits, media, facts, thanks, pro } = raw;
  const p = (prod && capa.datos ? { ...prod, ...capa.datos } : prod) as FichaRow | null;
  const songRows = songs;
  let actos = acts.map((a) => ({
    nombre: a.nombre,
    canciones: songRows.filter((s) => s.act_id === a.id).map((s) => s.titulo),
  }));
  const sueltas = songRows.filter((s) => !s.act_id).map((s) => s.titulo);
  if (sueltas.length) actos.unshift({ nombre: "", canciones: sueltas });
  if (capa.canciones) actos = capa.canciones.actos.map((a) => ({ nombre: a.nombre ?? "", canciones: (a.canciones ?? []).filter(Boolean) }));

  const rows = credits;
  const of = (tipo: string) => rows.filter((r) => r.tipo === tipo && r.people);
  // Foto de la obra; si no hay, el retrato del perfil profesional. Enlace solo si el perfil es público (0057).
  const proInfo = new Map(pro.map((x) => [x.person_id, x]));
  const foto = (r: CreditRow) => {
    if (r.foto_path) return assetUrl(r.foto_path);
    const ret = proInfo.get(r.person_id)?.retrato_path;
    return ret ? perfilUrl(ret) : undefined;
  };
  const perfil = (r: CreditRow) => { const sl = proInfo.get(r.person_id)?.slug; return sl ? `/artistas/${sl}` : undefined; };
  const team = (tipo: string): Credit[] => of(tipo).map((r) => ({ rol: r.papel ?? "", persona: r.people!.nombre, foto: foto(r), perfil: perfil(r) }));

  const ficha = [
    { etiqueta: "Temporada", valor: p?.temporada },
    { etiqueta: "Fechas", valor: p?.fecha },
    { etiqueta: "Sede", valor: p?.venue },
    { etiqueta: "Duración", valor: p?.duracion },
    { etiqueta: "Clasificación", valor: p?.clasificacion },
    { etiqueta: "Idioma", valor: p?.idioma },
    { etiqueta: "Basada en", valor: p?.basada_en },
    ...(capa.ficha ? capa.ficha.items : facts),
  ].filter((x): x is { etiqueta: string; valor: string } => !!x.valor);

  return {
    sinopsis: (p?.sinopsis ?? "").split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean),
    actos: actos.filter((a) => a.canciones.length > 0),
    videos: capa.videos ? capa.videos.items.map((m) => ({ titulo: m.titulo, youtube: m.youtube_id })) : media.map((m) => ({ titulo: m.titulo, youtube: m.youtube_id })),
    reparto: of("reparto").map((r) => ({ personaje: r.papel ?? "", persona: r.people!.nombre, foto: foto(r), perfil: perfil(r) })),
    ensamble: of("ensamble").map((r) => ({ persona: r.people!.nombre, foto: foto(r), perfil: perfil(r) })),
    creativo: team("creativo"),
    produccion: team("produccion"),
    crew: team("crew"),
    tecnico: team("tecnico"),
    staff: team("staff"),
    agradecimientos: capa.gracias ? capa.gracias.items : thanks.map((t) => t.texto),
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
