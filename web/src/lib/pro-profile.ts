import { ordenarObras } from "@/lib/orden-obras";
import { createClient } from "@/lib/supabase/server";
import type { ProProfile } from "@/lib/pro-rules";

// Lecturas del perfil profesional (0057). Pasan por RLS: público solo si se activó.

export type ProPhoto = { id: string; path: string; orden: number };

export async function getPro(personId: string): Promise<{ pro: ProProfile | null; fotos: ProPhoto[] }> {
  const supabase = await createClient();
  const [p, f] = await Promise.all([
    supabase.from("pro_profiles").select("*").eq("person_id", personId).maybeSingle(),
    supabase.from("pro_photos").select("id, path, orden").eq("person_id", personId).order("orden"),
  ]);
  return { pro: (p.data as ProProfile) ?? null, fotos: (f.data ?? []) as ProPhoto[] };
}

export async function getProBySlug(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("pro_profiles").select("*, people(nombre)").eq("slug", slug).maybeSingle();
  if (!data) return null;
  const pro = data as ProProfile & { people: { nombre: string } | null };
  const [fotos, obras] = await Promise.all([
    supabase.from("pro_photos").select("id, path, orden").eq("person_id", pro.person_id).order("orden"),
    supabase.rpc("pro_darf_credits", { pid: pro.person_id }),
  ]);
  const lista = (obras.data ?? []) as { production_id: string; obra: string; tipo: string; papel: string | null }[];
  // Con DARF Productions: la obra más nueva arriba, como en el panel.
  const ids = [...new Set(lista.map((o) => o.production_id))];
  const { data: datos } = ids.length ? await supabase.from("productions").select("id, temporada, created_at").in("id", ids) : { data: [] };
  const de = new Map(((datos ?? []) as { id: string; temporada: string | null; created_at: string }[]).map((p) => [p.id, p]));
  const orden = ordenarObras(lista.map((o, i) => ({ ...o, i, temporada: de.get(o.production_id)?.temporada ?? null, created_at: de.get(o.production_id)?.created_at ?? null })));
  return {
    pro,
    nombre: pro.people?.nombre ?? "",
    fotos: (fotos.data ?? []) as ProPhoto[],
    obras: orden.map(({ production_id, obra, tipo, papel }) => ({ production_id, obra, tipo, papel })),
  };
}
