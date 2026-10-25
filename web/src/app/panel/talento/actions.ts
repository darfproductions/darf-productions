"use server";

import { getSession } from "@/lib/auth";
import { correoDeCampo } from "@/lib/cuentas";
import { casa } from "@/lib/panel-nav";
import { getPanelAccess } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { refrescarPublico } from "@/lib/supabase/publico";

// Fichas de persona (0042): unir duplicadas y ligar a una cuenta. Solo el Director.

export type TalentState = { ok: boolean; message: string } | null;

export async function mergePeople(_p: TalentState, f: FormData): Promise<TalentState> {
  const keep = String(f.get("keep") ?? "");
  const quitar = String(f.get("quitar") ?? "");
  if (!keep || !quitar) return { ok: false, message: "Elige la ficha que se queda y la que se une." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("people_merge", { keep, quitar });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/panel/personas");
  return { ok: true, message: "Fichas unidas: sus créditos quedaron en una sola." };
}

export async function linkAccount(_p: TalentState, f: FormData): Promise<TalentState> {
  const supabase = await createClient();
  const email = await correoDeCampo(supabase, String(f.get("email") ?? ""));
  const { error } = await supabase.rpc("people_link_account", { pid: String(f.get("id")), p_email: email });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/panel/personas");
  return { ok: true, message: "Listo: la ficha y sus créditos quedaron en esa cuenta." };
}

/** Cambia el nombre de la ficha: es el que sale en los créditos de todas sus obras (la cuenta no lo cambia). */
export async function renamePerson(_p: TalentState, f: FormData): Promise<TalentState> {
  const session = await getSession();
  if (!session || !casa(await getPanelAccess(session), "casa.personas")) return { ok: false, message: "No tienes permiso para cambiar nombres." };
  const id = String(f.get("id") ?? "");
  const nombre = String(f.get("nombre") ?? "").trim().replace(/\s+/g, " ");
  if (!nombre) return { ok: false, message: "Escribe el nombre." };
  if (nombre.length > 120) return { ok: false, message: "El nombre es demasiado largo." };
  const supabase = await createClient();
  const { error, count } = await supabase.from("people").update({ nombre }, { count: "exact" }).eq("id", id);
  if (error) return { ok: false, message: error.message };
  if (!count) return { ok: false, message: "No se encontró la ficha." };
  revalidatePath("/panel", "layout");
  revalidatePath("/producciones", "layout");
  refrescarPublico();
  revalidatePath("/programa", "layout");
  return { ok: true, message: `Listo: ahora sale como "${nombre}" en todas sus obras.` };
}
