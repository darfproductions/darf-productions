import { createClient } from "@/lib/supabase/server";

// Base del Club Fan (0112): socios con sus datos, producciones, visitas y compras. Solo casa.club.

export type Socio = {
  user_id: string; numero: number; desde: string; nombre: string; email: string; telefono: string | null; fecha_nacimiento: string | null;
  producciones: number; visitas: number; compras: number; boletos: number; gastado: number; ultima_compra: string | null;
};

export async function getSocios(): Promise<Socio[]> {
  const { data, error } = await (await createClient()).rpc("club_socios");
  if (error) throw new Error(error.message);
  return (data ?? []) as Socio[];
}

const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Filtra por nombre, correo, teléfono o número de socio. */
export function buscarSocios(socios: Socio[], q: string): Socio[] {
  const t = norm(q.trim());
  if (!t) return socios;
  return socios.filter((s) => norm(`${s.nombre} ${s.email} ${s.telefono ?? ""} #${s.numero}`).includes(t));
}
