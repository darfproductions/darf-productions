import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PrintButton } from "@/components/PrintButton";
import { ActionForm } from "@/components/panel/ActionForm";
import { SeasonSummaryView } from "@/components/panel/SeasonSummaryView";
import { Card, input } from "@/components/panel/ui";
import { getPanelProduction } from "@/lib/panel-data";
import { can } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import type { SeasonSummary } from "@/lib/season-rules";
import { createClient } from "@/lib/supabase/server";
import { ListaRevision } from "@/components/panel/ListaRevision";
import { listPerformances } from "@/lib/boleteria";
import { listaCierre } from "@/lib/cierre-lista";
import { getPendientes } from "@/lib/panel-pendientes";
import { closeSeason, reopenSeason } from "./actions";

export const metadata: Metadata = { title: "Cierre de temporada" };

type Closure = { id: string; cerrado_at: string; notas: string | null; bajas: number; resumen: SeasonSummary; reabierto_at: string | null };
// Reactivar (0066): el Director o quien publica la obra. Vuelven a verse todas las pestañas.
function Reactivar({ id }: { id: string }) {
  return (
    <Card className="print:hidden">
      <h2 className="titular mb-2 text-xl">Reactivar producción</h2>
      <p className="mb-3 text-sm text-texto-2">Vuelve a poner la obra como publicada (Próximamente) y regresan todas las pestañas del panel. No reactiva la venta ni a los integrantes; eso se hace a mano.</p>
      <ActionForm action={reopenSeason} hidden={{ pid: id }} confirm="¿Reactivar esta producción?" submit="Reactivar producción" submitClass="rounded-full border border-white/30 px-4 py-2 text-sm font-bold" />
    </Card>
  );
}

async function datosCierre(id: string) {
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
  });
}

const fecha = (iso: string) => new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeZone: "America/Mexico_City" }).format(new Date(iso));

// Cierre de temporada: resumen en vivo, cerrar (archiva y congela) y el resumen final imprimible.
export default async function Cierre({ params }: PageProps<"/panel/producciones/[id]/cierre">) {
  const { id } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/cierre`);
  const cierra = can(access, id, "obra.publicar");
  if (!cierra && !can(access, id, "reportes.ver")) redirect(`/panel/producciones/${id}`);
  const verTaller = cierra || can(access, id, "mensualidades.gestionar");
  const supabase = await createClient();
  const [p, closures, live] = await Promise.all([
    getPanelProduction(id),
    supabase.from("season_closures").select("id, cerrado_at, notas, bajas, resumen, reabierto_at").eq("production_id", id).order("cerrado_at", { ascending: false }),
    supabase.rpc("season_summary", { pid: id }),
  ]);
  if (!p) redirect("/panel/producciones");
  const cierres = (closures.data ?? []) as Closure[];
  // Bloque 4C: lista de lo que conviene resolver antes de cerrar.
  const revisar = p.estado !== "archivada" ? await datosCierre(id) : null;
  const vigente = p.estado === "archivada" ? cierres.find((c) => !c.reabierto_at) ?? null : null;
  const resumen = live.data as SeasonSummary | null;

  if (vigente) {
    return (
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-4 print:bg-transparent print:p-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-texto-3">Resumen final de temporada</p>
              <h2 className="titular text-2xl">{vigente.resumen.obra}</h2>
              <p className="text-sm text-texto-2">Cerrada el {fecha(vigente.cerrado_at)}{vigente.bajas ? ` · ${vigente.bajas} integrantes dados de baja` : ""}</p>
            </div>
            <PrintButton />
          </div>
          {vigente.notas && <p className="whitespace-pre-line rounded-lg bg-sala p-3 text-sm print:bg-transparent">{vigente.notas}</p>}
          <SeasonSummaryView s={vigente.resumen} verTaller={verTaller} />
        </Card>
        {cierra && <Reactivar id={id} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="titular text-xl">Cómo va la temporada</h2>
            <p className="text-sm text-texto-2">Así quedará el resumen si cierras hoy.</p>
          </div>
          <PrintButton />
        </div>
        {resumen ? <SeasonSummaryView s={resumen} verTaller={verTaller} /> : <p className="text-sm text-[#ff8fa3]">{live.error?.message ?? "No se pudo calcular."}</p>}
      </Card>

      {revisar && (
        <ListaRevision className="print:hidden" titulo="Antes de cerrar la temporada" listo={revisar.pendientes === 0}
          resumen={revisar.pendientes === 0 ? "✓ Todo resuelto: puedes cerrar la temporada." : !revisar.puedeCerrar ? "Hay órdenes por aprobar: resuélvelas para poder cerrar." : `${revisar.pendientes} ${revisar.pendientes === 1 ? "cosa por revisar" : "cosas por revisar"} (no impiden cerrar).`}
          puntos={revisar.puntos.map((x) => ({ ...x, nivel: x.bloquea ? "obligatorio" : "aviso" }))} />
      )}
      {cierra && p.estado !== "archivada" && (
        <Card className="print:hidden">
          <h2 className="titular mb-2 text-xl">Cerrar la temporada</h2>
          <ul className="mb-3 list-disc pl-5 text-sm text-texto-2">
            <li>Quita de venta todas las funciones y pasa la obra al archivo (su página sigue visible como obra pasada).</li>
            <li>Guarda este resumen congelado, con tus notas, para imprimir o guardar en PDF.</li>
            <li>El elenco y los créditos quedan como están en la página de archivo.</li>
            <li>No se puede cerrar si hay órdenes por aprobar.</li>
          </ul>
          <ActionForm action={closeSeason} hidden={{ pid: id }} confirm={`¿Cerrar la temporada de ${p.nombre}?`} submit="Cerrar temporada">
            <label className="flex flex-col gap-1.5 text-sm font-semibold">Notas del cierre (opcional)
              <textarea className={input} name="notas" rows={3} maxLength={4000} placeholder="Ej. Récord de asistencia; pendiente devolver vestuario." />
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="dar_baja" className="mt-1" />
              <span>Dar de baja a los integrantes del taller con motivo “Fin de temporada”. Dejan de ver materiales y comunicados de esta obra; su historial y sus créditos se quedan.</span>
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="confirmo" required /> Entiendo que la venta se detiene y la obra pasa al archivo.</label>
          </ActionForm>
        </Card>
      )}
      {p.estado === "archivada" && <Card>Esta obra ya está archivada{cierres.length ? "" : " (se archivó sin cierre de temporada)"}.</Card>}
      {p.estado === "archivada" && cierra && <Reactivar id={id} />}
    </div>
  );
}
