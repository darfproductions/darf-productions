"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
  const { error } = await supabase.rpc("people_link_account", { pid: String(f.get("id")), p_email: String(f.get("email") ?? "") });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/panel/personas");
  return { ok: true, message: "Ficha ligada a la cuenta." };
}
