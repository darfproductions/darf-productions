import { cache } from "react";
import { redirect } from "next/navigation";
import { requireSession, type Session } from "@/lib/auth";
import { casa, hasAnyAccess, type PanelAccessData, type PapelEvento } from "@/lib/panel-nav";
import { createClient } from "@/lib/supabase/server";

// Permisos del panel desde la base (my_panel_access 0031, my_audition_access 0037, my_evento_access 0084).

export type PanelAccess = PanelAccessData & { session: Session };

export async function getPanelAccess(session: Session): Promise<PanelAccess> {
  return { ...(await cargarAcceso(session.userId)), session, isDirector: session.profile?.rol === "admin" };
}

// Una sola vez por página para la misma persona (layout, encabezado y página la comparten).
const cargarAcceso = cache(async function cargarAcceso(userId: string): Promise<Omit<PanelAccess, "session" | "isDirector">> {
  if (!userId) return { byProduction: {}, byAudition: {}, byEvento: {}, casa: [] };
  const supabase = await createClient();
  const [{ data, error }, aud, ev, cs] = await Promise.all([
    supabase.rpc("my_panel_access"), supabase.rpc("my_audition_access"), supabase.rpc("my_evento_access"), supabase.rpc("mis_permisos_casa"),
  ]);
  if (error) throw new Error(`No se pudieron cargar tus permisos: ${error.message}`);
  const byProduction: Record<string, string[]> = {};
  for (const r of (data ?? []) as { production_id: string; permission_id: string }[]) {
    (byProduction[r.production_id] ??= []).push(r.permission_id);
  }
  // Equipo propio de convocatorias (0037). Si la base aún no la tiene, no hay ninguno.
  const byAudition: Record<string, string[]> = {};
  for (const r of (aud.data ?? []) as { audition_id: string; permission_id: string }[]) {
    (byAudition[r.audition_id] ??= []).push(r.permission_id);
  }
  // Equipo propio de eventos (0084).
  const byEvento: Record<string, PapelEvento> = {};
  for (const r of (ev.data ?? []) as { encuentro_id: string; papel: PapelEvento }[]) byEvento[r.encuentro_id] = r.papel;
  // Casa DARF (0102). Si la base aún no la tiene, no hay permisos globales.
  return { byProduction, byAudition, byEvento, casa: (cs.data ?? []) as string[] };
});

/** Para páginas del panel: exige sesión y algún permiso; si no, manda a Mi cuenta. */
export async function requirePanel(next = "/panel"): Promise<PanelAccess> {
  const session = await requireSession(next);
  const access = await getPanelAccess(session);
  if (!hasAnyAccess(access)) redirect("/cuenta");
  return access;
}

/** Solo el Director (Casa DARF: quién es de la empresa). */
export async function requireDirector(next: string): Promise<PanelAccess> {
  const access = await requirePanel(next);
  if (!access.isDirector) redirect("/panel");
  return access;
}

/** Lo global de la empresa (0102): el Director o Casa DARF con ese permiso (casa.sitio, casa.personas…). */
export async function requireCasa(perm: string, next: string): Promise<PanelAccess> {
  const access = await requirePanel(next);
  if (!casa(access, perm)) redirect("/panel");
  return access;
}

/** ¿La persona con sesión puede entrar al panel? (para mostrar el enlace en el menú)
 *  La misma regla que requirePanel: un staff sin permisos en ninguna obra no ve el botón. */
export async function canSeePanel(session: Session | null): Promise<boolean> {
  if (!session) return false;
  try {
    return hasAnyAccess(await getPanelAccess(session));
  } catch {
    return false; // si fallan los permisos, la página pública sigue funcionando sin el botón
  }
}
