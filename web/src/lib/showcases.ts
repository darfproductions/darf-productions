import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { ShowcaseAjustes, ShowcaseMedia, ShowcasePlan } from "@/lib/showcase-rules";

// DARF Showcase Shows (0121): lo que se muestra en /showcases y se edita en el panel. Pasa por RLS:
// el público ve los planes activos; Casa DARF (Showcases) ve todos.

export function showcaseFotoUrl(path: string): string {
  return `${env.supabaseUrl}/storage/v1/object/public/showcases/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export async function getShowcases(): Promise<{ ajustes: ShowcaseAjustes | null; planes: ShowcasePlan[]; media: ShowcaseMedia[]; editor: boolean }> {
  const supabase = await createClient();
  const [a, p, m, e] = await Promise.all([
    supabase.from("showcase_ajustes").select("publicado, titulo, lema, intro, importante, publicos, especial, antes_reservar, anticipacion, condiciones, whatsapp").eq("id", 1).maybeSingle(),
    supabase.from("showcase_planes").select("id, orden, nombre, descripcion, precio, resumen, detalle, incluye, ideal_para, nota, activo").order("orden").order("created_at"),
    supabase.from("showcase_media").select("id, plan_id, categoria, tipo, path, url, titulo, orden").order("orden").order("created_at"),
    supabase.rpc("has_casa", { perm: "casa.showcases" }),
  ]);
  return {
    ajustes: (a.data as ShowcaseAjustes | null) ?? null,
    planes: ((p.data ?? []) as ShowcasePlan[]).map((x) => ({ ...x, precio: x.precio == null ? null : Number(x.precio) })),
    media: (m.data ?? []) as ShowcaseMedia[],
    /** Casa DARF con Showcases: ve la página aunque no esté publicada. */
    editor: e.data === true,
  };
}
