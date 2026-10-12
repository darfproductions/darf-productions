import { createClient } from "@/lib/supabase/server";

// Notificaciones del panel (0066): cada quien ve solo las suyas (RLS).
export type Notificacion = {
  id: number; tipo: string; titulo: string; detalle: string | null; href: string | null;
  production_id: string | null; created_at: string; read_at: string | null;
};

export async function listNotifications(opts: { soloNoLeidas?: boolean; limit?: number } = {}): Promise<Notificacion[]> {
  const supabase = await createClient();
  let q = supabase.from("notifications").select("id, tipo, titulo, detalle, href, production_id, created_at, read_at").order("created_at", { ascending: false }).limit(opts.limit ?? 200);
  if (opts.soloNoLeidas) q = q.is("read_at", null);
  const { data } = await q;
  return (data ?? []) as Notificacion[];
}

export async function unreadCount(): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("notifications_unread_count");
  return Number(data ?? 0);
}
