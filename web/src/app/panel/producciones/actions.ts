"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Obra destacada en la portada (0066). La base revisa obra.publicar.
type State = { ok: boolean; message: string } | null;

export async function setFeatured(_p: State, f: FormData): Promise<State> {
  const pid = String(f.get("pid") ?? "") || null;
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_featured", { pid });
  if (error) return { ok: false, message: error.message };
  for (const p of ["/", "/panel/producciones"]) revalidatePath(p);
  return { ok: true, message: pid ? "Listo: esta obra va en la portada." : "Portada en automático (la función más cercana)." };
}
