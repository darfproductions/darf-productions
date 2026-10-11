import type { KitColumns } from "@/lib/themes";
import { createClient } from "@/lib/supabase/server";

// Lecturas del panel. Todas pasan por RLS con la sesión de quien consulta.

export type PanelProduction = KitColumns & {
  id: string;
  nombre: string;
  estado: string;
  venue: string | null;
  temporada: string | null;
  on_sale: boolean;
  concluded: boolean;
  created_at: string;
};

const COLUMNS =
  "id, nombre, estado, venue, temporada, on_sale, concluded, created_at, frase, color_fondo, color_superficie, color_texto, color_acento, logo_path, ambiente_path";

export async function listPanelProductions(ids?: string[]): Promise<PanelProduction[]> {
  const supabase = await createClient();
  let q = supabase.from("productions").select(COLUMNS).order("created_at", { ascending: false });
  if (ids) q = q.in("id", ids.length ? ids : ["-"]);
  const { data, error } = await q;
  if (error) throw new Error(`No se pudieron cargar las obras: ${error.message}`);
  return (data ?? []) as PanelProduction[];
}

export async function getPanelProduction(id: string): Promise<PanelProduction | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("productions").select(COLUMNS).eq("id", id).maybeSingle();
  return (data as PanelProduction | null) ?? null;
}

export type Member = { id: string; user_id: string; nombre: string | null; email: string; role_id: string; role_nombre: string };

export async function listMembers(productionId: string): Promise<Member[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("panel_list_members", { pid: productionId });
  if (error) return [];
  return (data ?? []) as Member[];
}

export type Role = { id: string; nombre: string; descripcion: string | null; es_sistema: boolean; orden: number };
export type Permission = { id: string; grupo: string; descripcion: string; orden: number };

export async function listRoles(): Promise<{ roles: Role[]; permissions: Permission[]; grants: Map<string, Set<string>> }> {
  const supabase = await createClient();
  const [roles, perms, rp] = await Promise.all([
    supabase.from("panel_roles").select("id, nombre, descripcion, es_sistema, orden").order("orden").order("nombre"),
    supabase.from("permissions").select("id, grupo, descripcion, orden").order("orden"),
    supabase.from("role_permissions").select("role_id, permission_id"),
  ]);
  const grants = new Map<string, Set<string>>();
  for (const r of rp.data ?? []) {
    if (!grants.has(r.role_id)) grants.set(r.role_id, new Set());
    grants.get(r.role_id)!.add(r.permission_id);
  }
  return { roles: (roles.data ?? []) as Role[], permissions: (perms.data ?? []) as Permission[], grants };
}

/** Funciones de una obra: cuántas y la próxima con fecha. */
export async function performanceSummary(productionId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("performances").select("starts_at, on_sale").eq("production_id", productionId);
  const rows = data ?? [];
  const now = Date.now();
  const next = rows
    .map((r) => r.starts_at as string | null)
    .filter((d): d is string => !!d && new Date(d).getTime() > now)
    .sort()[0] ?? null;
  return { total: rows.length, enVenta: rows.filter((r) => r.on_sale).length, proxima: next };
}

/** Órdenes pendientes de aprobar (solo staff y Director las pueden leer por ahora; 3C lo abre por obra). */
export async function pendingOrdersCount(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "pendiente");
  return count ?? 0;
}
