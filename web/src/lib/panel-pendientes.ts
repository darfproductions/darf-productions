import { cache } from "react";
import { getAdeudos } from "@/lib/adeudos";
import { pendingOrdersByProduction } from "@/lib/panel-data";
import { requireSession } from "@/lib/auth";
import { can, myProductionIds } from "@/lib/panel-nav";
import { memoriaCorta } from "@/lib/memoria";
import { getPanelAccess } from "@/lib/permissions";
import type { Pendiente } from "@/lib/panel-home-rules";
import { createClient } from "@/lib/supabase/server";

// Bandeja "Por hacer" (0085): lo de la base (panel_pendientes), las órdenes de boletos de las obras
// donde puedo aprobar, los adeudos vencidos (se calculan igual que en la pestaña Adeudos) y las entregas de
// beneficios vencidas o que ya tocan (0125).
// Con cache() se pide una sola vez por página (el menú, el Inicio y la obra usan lo mismo).
// Además se recuerda 60 s por persona (2026-10-24): la lista de asistencia se recarga sola y cada marca con gafete
// vuelve a dibujar el panel; recalcular los adeudos de todas las obras en cada una saturó la base en un ensayo.
const memoria = memoriaCorta<Pendiente[]>(60_000, 300);

export const getPendientes = cache(async (): Promise<Pendiente[]> => {
  const session = await requireSession("/panel");
  return memoria.get(session.userId, () => calcularPendientes(session));
});

async function calcularPendientes(session: Awaited<ReturnType<typeof requireSession>>): Promise<Pendiente[]> {
  const access = await getPanelAccess(session);
  const supabase = await createClient();
  const obras = access.isDirector
    ? (((await supabase.from("productions").select("id").neq("estado", "archivada")).data ?? []) as { id: string }[]).map((p) => p.id)
    : myProductionIds(access);
  const [{ data }, ordenes] = await Promise.all([supabase.rpc("panel_pendientes"), pendingOrdersByProduction()]);
  const base = ((data ?? []) as Pendiente[]).filter((p) => p.n > 0);
  const deOrdenes: Pendiente[] = [...ordenes.entries()]
    .filter(([pid]) => obras.includes(pid) && can(access, pid, "ventas.operar"))
    .map(([pid, n]) => ({ tipo: "ordenes", production_id: pid, n }));
  const adeudos = await Promise.all(
    obras.filter((pid) => can(access, pid, "mensualidades.gestionar")).map(async (pid): Promise<Pendiente> => {
      const { cobra, filas } = await getAdeudos(pid);
      const n = cobra ? filas.filter((f) => !f.baja && f.adeudo.total > 0 && f.adeudo.meses.some((m) => m.vencido)).length : 0;
      return { tipo: "adeudos", production_id: pid, n };
    }),
  );
  const beneficios = (await Promise.all(
    obras.filter((pid) => can(access, pid, "ventas.ver") || can(access, pid, "puerta.validar") || can(access, pid, "funciones.gestionar")).map(async (pid): Promise<Pendiente[]> => {
      const { data: b } = await supabase.rpc("beneficios_pendientes", { pid }).maybeSingle();
      const r = b as { vencidos: number; hoy: number; funcion: string | null } | null;
      if (!r) return [];
      return [
        { tipo: "beneficios_vencidos" as const, production_id: pid, n: r.vencidos, ref_id: r.funcion },
        { tipo: "beneficios_hoy" as const, production_id: pid, n: r.hoy, ref_id: r.funcion },
      ].filter((x) => x.n > 0);
    }),
  )).flat();
  return [...deOrdenes, ...beneficios, ...base, ...adeudos.filter((a) => a.n > 0)];
}
