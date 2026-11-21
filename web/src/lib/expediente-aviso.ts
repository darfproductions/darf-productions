import { createClient } from "@/lib/supabase/server";

/** 0160: lo que le falta a mi expediente personal (solo si tengo créditos en DARF). null = no aplica; [] = completo. */
export async function getMiExpedienteFalta(): Promise<string[] | null> {
  const { data, error } = await (await createClient()).rpc("mi_expediente_falta");
  if (error || data == null) return null;
  return data as string[];
}
