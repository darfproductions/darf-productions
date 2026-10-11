import { redirect } from "next/navigation";
import { requireSession, type Session } from "@/lib/auth";
import { hasAnyAccess, type PanelAccessData } from "@/lib/panel-nav";
import { createClient } from "@/lib/supabase/server";

// Permisos del panel desde la base (my_panel_access, migración 0031).

export type PanelAccess = PanelAccessData & { session: Session };

export async function getPanelAccess(session: Session): Promise<PanelAccess> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_panel_access");
  if (error) throw new Error(`No se pudieron cargar tus permisos: ${error.message}`);
  const byProduction: Record<string, string[]> = {};
  for (const r of (data ?? []) as { production_id: string; permission_id: string }[]) {
    (byProduction[r.production_id] ??= []).push(r.permission_id);
  }
  return { session, isDirector: session.profile?.rol === "admin", byProduction };
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
  const { count } = await supabase
    .from("production_members")
    .select("id", { count: "exact", head: true })
    .eq("user_id", session.userId);
  return (count ?? 0) > 0;
}
