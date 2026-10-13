import { cache } from "react";
import { getAdeudos } from "@/lib/adeudos";
import { pendingOrdersByProduction } from "@/lib/panel-data";
import { requireSession } from "@/lib/auth";
import { can, myProductionIds } from "@/lib/panel-nav";
import { getPanelAccess } from "@/lib/permissions";
import type { Pendiente } from "@/lib/panel-home-rules";
import { createClient } from "@/lib/supabase/server";

// Bandeja "Por hacer" (0085): lo de la base (panel_pendientes), las órdenes de boletos de las obras
// donde puedo aprobar y los adeudos vencidos (se calculan igual que en la pestaña Adeudos).
// Con cache() se pide una sola vez por página (el menú, el Inicio y la obra usan lo mismo).
export const getPendientes = cache(async (): Promise<Pendiente[]> => {
  const access = await getPanelAccess(await requireSession("/panel"));
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
  return [...deOrdenes, ...base, ...adeudos.filter((a) => a.n > 0)];
});
