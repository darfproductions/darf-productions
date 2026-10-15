"use server";

import { createClient } from "@/lib/supabase/server";

// Buscador de cuentas por nombre (0105): lo usan los formularios donde se agrega a alguien.
// Devuelve nombre y correo enmascarado; el correo completo solo lo obtiene el servidor al guardar.
export type CuentaEncontrada = { id: string; nombre: string; correo: string; con_ficha: boolean };

export async function buscarCuentas(q: string): Promise<CuentaEncontrada[]> {
  if (q.trim().length < 2) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("buscar_cuentas", { q: q.trim().slice(0, 80) });
  if (error) return [];
  return (data ?? []) as CuentaEncontrada[];
}
