import { redirect } from "next/navigation";
import { requireSession, type Session } from "@/lib/auth";
import { hasAnyAccess, type PanelAccessData } from "@/lib/panel-nav";
import { createClient } from "@/lib/supabase/server";

// Permisos del panel desde la base (my_panel_access 0031, my_audition_access 0037).

export type PanelAccess = PanelAccessData & { session: Session };

export async function getPanelAccess(session: Session): Promise<PanelAccess> {
  const supabase = await createClient();
  const [{ data, error }, aud] = await Promise.all([supabase.rpc("my_panel_access"), supabase.rpc("my_audition_access")]);
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
  return { session, isDirector: session.profile?.rol === "admin", byProduction, byAudition };
}

/** Para páginas del panel: exige sesión y algún permiso; si no, manda a Mi cuenta. */
export async function requirePanel(next = "/panel"): Promise<PanelAccess> {
  const session = await requireSession(next);
  const access = await getPanelAccess(session);
  if (!hasAnyAccess(access)) redirect("/cuenta");
  return access;
}

/** Solo el Director (Usuarios, Roles, Bitácora). */
export async function requireDirector(next: string): Promise<PanelAccess> {
  const access = await requirePanel(next);
  if (!access.isDirector) redirect("/panel");
  return access;
}

/** ¿La persona con sesión puede entrar al panel? (para mostrar el enlace en el menú) */
export async function canSeePanel(session: Session | null): Promise<boolean> {
  if (!session) return false;
  const rol = session.profile?.rol;
  if (rol === "staff" || rol === "admin") return true;
  const supabase = await createClient();
  // Solo cuentan roles con permisos (el Integrante del elenco usa Mi cuenta, no el panel).
  const [obra, aud] = await Promise.all([supabase.rpc("my_panel_access"), supabase.rpc("my_audition_access")]);
  return (obra.data ?? []).length + (aud.data ?? []).length > 0;
}
