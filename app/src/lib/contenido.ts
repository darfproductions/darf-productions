import { env } from "~/lib/env";
import { imagen } from "~/lib/datos";
import { supabase } from "~/lib/supabase";

// Contenido artístico de una obra: lo mismo que la página pública de la web (web/src/lib/production-content.ts,
// getGallery de productions.ts y getLogistica de logistica.ts), con las mismas tablas y reglas: solo el reparto y
// ensamble publicados, foto de la obra o, si no hay, el retrato del perfil profesional.

export type Credito = { rol: string; persona: string; foto?: string; slug?: string };

export type Contenido = {
  sinopsis: string[];
  ficha: { etiqueta: string; valor: string }[];
  actos: { nombre: string; canciones: string[] }[];
  reparto: { personaje: string; persona: string; foto?: string; slug?: string }[];
  ensamble: { persona: string; foto?: string; slug?: string }[];
  equipos: { titulo: string; personas: Credito[] }[];
  videos: { titulo: string; youtube: string }[];
  galeria: string[];
  agradecimientos: string[];
  logistica: { direccion: string | null; maps_url: string | null; indicaciones: string | null } | null;
};

type CreditoFila = { tipo: string; papel: string | null; foto_path: string | null; person_id: string; people: { nombre: string } | null };

function perfilUrl(path: string): string {
  return `${env.supabaseUrl}/storage/v1/object/public/perfiles/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export async function leerContenido(id: string): Promise<Contenido> {
  const [prod, acts, songs, credits, media, facts, thanks, pro, fotos, logi] = await Promise.all([
    supabase.from("productions").select("venue, temporada, fecha, duracion, clasificacion, idioma, basada_en, sinopsis").eq("id", id).maybeSingle(),
    supabase.from("production_acts").select("id, nombre").eq("production_id", id).order("orden"),
    supabase.from("production_songs").select("act_id, titulo").eq("production_id", id).order("orden"),
    supabase.from("production_credits").select("tipo, papel, foto_path, person_id, people(nombre)").eq("production_id", id).eq("activo", true).eq("publicado", true).order("orden"),
    supabase.from("production_media").select("titulo, youtube_id").eq("production_id", id).eq("tipo", "video").order("orden"),
    supabase.from("production_facts").select("etiqueta, valor").eq("production_id", id).order("orden"),
    supabase.from("production_thanks").select("texto").eq("production_id", id).order("orden"),
    supabase.rpc("production_pro_info", { pid: id }),
    supabase.from("gallery_photos").select("path").eq("production_id", id).eq("kind", "galeria").order("sort_order"),
    supabase.from("obra_logistica").select("direccion, maps_url, indicaciones").eq("production_id", id).maybeSingle(),
  ]);

  const p = prod.data as { venue: string | null; temporada: string | null; fecha: string | null; duracion: string | null; clasificacion: string | null; idioma: string | null; basada_en: string | null; sinopsis: string | null } | null;
  const actos = ((acts.data ?? []) as { id: string; nombre: string }[]).map((a) => ({
    nombre: a.nombre,
    canciones: ((songs.data ?? []) as { act_id: string | null; titulo: string }[]).filter((s) => s.act_id === a.id).map((s) => s.titulo),
  }));
  const sueltas = ((songs.data ?? []) as { act_id: string | null; titulo: string }[]).filter((s) => !s.act_id).map((s) => s.titulo);
  if (sueltas.length) actos.unshift({ nombre: "", canciones: sueltas });

  const info = (pro.data ?? []) as { person_id: string; retrato_path: string | null; slug: string | null }[];
  const retratos = new Map(info.map((x) => [x.person_id, x.retrato_path]));
  const slugs = new Map(info.filter((x) => x.slug).map((x) => [x.person_id, x.slug as string]));
  const slug = (r: CreditoFila) => slugs.get(r.person_id);
  const filas = ((credits.data ?? []) as unknown as CreditoFila[]).filter((r) => r.people);
  const foto = (r: CreditoFila) => (r.foto_path ? imagen(r.foto_path) ?? undefined : retratos.get(r.person_id) ? perfilUrl(retratos.get(r.person_id)!) : undefined);
  const de = (tipo: string) => filas.filter((r) => r.tipo === tipo);
  const equipo = (tipo: string): Credito[] => de(tipo).map((r) => ({ rol: r.papel ?? "", persona: r.people!.nombre, foto: foto(r), slug: slug(r) }));

  const ficha = [
    { etiqueta: "Temporada", valor: p?.temporada },
    { etiqueta: "Fechas", valor: p?.fecha },
    { etiqueta: "Sede", valor: p?.venue },
    { etiqueta: "Duración", valor: p?.duracion },
    { etiqueta: "Clasificación", valor: p?.clasificacion },
    { etiqueta: "Idioma", valor: p?.idioma },
    { etiqueta: "Basada en", valor: p?.basada_en },
    ...((facts.data ?? []) as { etiqueta: string; valor: string }[]),
  ].filter((x): x is { etiqueta: string; valor: string } => !!x.valor);

  return {
    sinopsis: (p?.sinopsis ?? "").split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean),
    ficha,
    actos: actos.filter((a) => a.canciones.length > 0),
    reparto: de("reparto").map((r) => ({ personaje: r.papel ?? "", persona: r.people!.nombre, foto: foto(r), slug: slug(r) })),
    ensamble: de("ensamble").map((r) => ({ persona: r.people!.nombre, foto: foto(r), slug: slug(r) })),
    equipos: [
      { titulo: "Equipo creativo", personas: equipo("creativo") },
      { titulo: "Producción", personas: equipo("produccion") },
      { titulo: "Crew", personas: equipo("crew") },
      { titulo: "Equipo técnico", personas: equipo("tecnico") },
      { titulo: "Staff", personas: equipo("staff") },
    ].filter((g) => g.personas.length > 0),
    videos: ((media.data ?? []) as { titulo: string; youtube_id: string }[]).map((m) => ({ titulo: m.titulo, youtube: m.youtube_id })),
    galeria: ((fotos.data ?? []) as { path: string }[]).map((f) => supabase.storage.from("gallery").getPublicUrl(f.path).data.publicUrl),
    agradecimientos: ((thanks.data ?? []) as { texto: string }[]).map((t) => t.texto),
    logistica: (logi.data as Contenido["logistica"]) ?? null,
  };
}
