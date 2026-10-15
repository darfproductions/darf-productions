import type { SupabaseClient } from "@supabase/supabase-js";

/** Valor de un campo que viene del buscador de cuentas (0105): "cuenta:<id>" o un correo escrito a mano.
 *  Devuelve el correo para las funciones de la base que lo piden. */
export async function correoDeCampo(supabase: SupabaseClient, valor: string | null | undefined): Promise<string> {
  const v = (valor ?? "").trim();
  const m = /^cuenta:([0-9a-f-]{36})$/i.exec(v);
  if (!m) return v;
  const { data } = await supabase.rpc("cuenta_correo", { uid: m[1] });
  return typeof data === "string" ? data : "";
}
