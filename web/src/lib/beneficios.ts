import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { lineaWhatsapp, type Beneficio, type BeneficioCorto } from "@/lib/beneficios-rules";

// Beneficios por zona (0122). Lectura pública de los activos (RLS); el equipo con funciones.gestionar ve todos.
export async function listarBeneficios(pid: string, cliente?: SupabaseClient): Promise<Beneficio[]> {
  const supabase = cliente ?? await createClient();
  const { data } = await supabase.from("zona_beneficios")
    .select("id, tipo, nombre, detalle, por_compra, minutos_antes, cupo, funciones, orden, activo, entrega, entrega_dias, zona_beneficio_zonas(price_category_id)")
    .eq("production_id", pid).order("orden").order("created_at");
  return ((data ?? []) as (Omit<Beneficio, "zonas"> & { zona_beneficio_zonas: { price_category_id: string }[] })[])
    .map(({ zona_beneficio_zonas: zs, ...b }) => ({ ...b, zonas: zs.map((z) => z.price_category_id) }));
}

/** Renglones "Incluye (VIP): …" de una orden, para WhatsApp y la pantalla final (orden_beneficios). */
export async function incluyeDeOrden(filtro: { orderId?: string; orderCode?: string }): Promise<string[]> {
  const supabase = await createClient();
  let id = filtro.orderId;
  if (!id && filtro.orderCode) {
    const { data } = await supabase.from("orders").select("id").eq("order_code", filtro.orderCode).maybeSingle();
    id = data?.id as string | undefined;
  }
  if (!id) return [];
  const { data } = await supabase.rpc("orden_beneficios", { p_order: id });
  return ((data ?? []) as { zona: string; beneficios: BeneficioCorto[] }[]).map((z) => lineaWhatsapp(z.zona, z.beneficios)).filter((x): x is string => !!x);
}
