import { listPerformances } from "@/lib/boleteria";
import { listaCierre } from "@/lib/cierre-lista";
import { getPendientes } from "@/lib/panel-pendientes";
import { createClient } from "@/lib/supabase/server";

// Datos de la lista "Antes de cerrar la temporada" (Bloque 4C): la usan Cierre y el Resumen de la obra.
export async function datosCierre(id: string) {
  const supabase = await createClient();
  const ahora = Date.now();
  const [fs, pend, fotos, creditos] = await Promise.all([
    listPerformances(id),
    getPendientes(),
    supabase.from("gallery_photos").select("id", { count: "exact", head: true }).eq("production_id", id).eq("kind", "galeria"),
    supabase.from("production_credits").select("id", { count: "exact", head: true }).eq("production_id", id).eq("activo", true),
  ]);
  const canceladas = fs.filter((f) => f.cancelada_at).map((f) => f.id);
  const { count: reembolsos } = canceladas.length
    ? await supabase.from("orders").select("id", { count: "exact", head: true }).in("performance_id", canceladas).eq("status", "aprobado")
    : { count: 0 };
  const n = (tipo: string) => pend.filter((x) => x.production_id === id && x.tipo === tipo).reduce((a, x) => a + x.n, 0);
  const { data: benef } = await supabase.rpc("beneficios_pendientes", { pid: id }).maybeSingle();
  const b = benef as { pendientes: number; vencidos: number } | null;
  return listaCierre({
    pid: id,
    ordenesPendientes: n("ordenes"),
    funcionesPorVenir: fs.filter((f) => !f.cancelada_at && f.starts_at && new Date(f.starts_at).getTime() > ahora).length,
    reembolsos: reembolsos ?? 0,
    adeudos: n("adeudos"),
    ofertasSinResponder: n("ofertas"),
    documentosPorRevisar: n("documentos"),
    fotosGaleria: fotos.count ?? 0,
    creditos: creditos.count ?? 0,
    beneficiosPendientes: b?.pendientes ?? 0,
    beneficiosVencidos: b?.vencidos ?? 0,
  });
}
