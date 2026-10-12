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
  return {
    pro,
    nombre: pro.people?.nombre ?? "",
    fotos: (fotos.data ?? []) as ProPhoto[],
    obras: (obras.data ?? []) as { production_id: string; obra: string; tipo: string; papel: string | null }[],
  };
}
