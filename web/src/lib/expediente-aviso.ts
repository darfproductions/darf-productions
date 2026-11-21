import { createClient } from "@/lib/supabase/server";

/** 0160: lo que le falta a mi expediente personal (solo si tengo créditos en DARF). null = no aplica; [] = completo. */
export async function getMiExpedienteFalta(): Promise<string[] | null> {
  const { data, error } = await (await createClient()).rpc("mi_expediente_falta");
  if (error || data == null) return null;
  return data as string[];
}

/** 0161: ¿me falta poner cómo quiero cobrar (CLABE)? Solo a quien le toca Mis honorarios. */
export async function getMiDatosPagoFalta(): Promise<boolean> {
  const { data, error } = await (await createClient()).rpc("mi_datos_pago_falta");
  return !error && data === true;
}
