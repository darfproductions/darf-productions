import type { Evento } from "@/lib/eventos-rules";
import { createClient } from "@/lib/supabase/server";
import { ordenFanzone, type FanCategoria, type FanItem, type FanTipo } from "@/lib/fanzone-rules";
import { publico } from "@/lib/supabase/publico";

// Lecturas de la Fan Zone (0052, 0075). Pasan por RLS: solo socios del Club Fan ven contenidos,
// y lo bloqueado por fecha llega hasta su día.

export type FanItemVista = FanItem & { archivo_url: string | null };

/** Contenidos visibles de una obra, o de todas si pid es null. */
export async function listFanzone(pid: string | null): Promise<FanItemVista[]> {
  const supabase = await createClient();
  let q = supabase.from("fanzone_items").select("*");
  if (pid) q = q.eq("production_id", pid);
  const { data } = await q;
  return ordenFanzone((data ?? []) as FanItem[]).map((i) => ({
    ...i,
    archivo_url: i.archivo_path ? supabase.storage.from("gallery").getPublicUrl(i.archivo_path).data.publicUrl : null,
  }));
}

/** Contenidos visibles por obra (para la portada de la Fan Zone). */
export async function fanzoneCounts(): Promise<Map<string, number>> {
  const supabase = await createClient();
  const { data } = await supabase.from("fanzone_items").select("production_id");
  const m = new Map<string, number>();
  for (const r of data ?? []) m.set(r.production_id as string, (m.get(r.production_id as string) ?? 0) + 1);
  return m;
}

/** Cuántos contenidos tiene la Fan Zone de una obra, también sin sesión. */
export const fanzoneCount = publico("fanzone-conteo", async (supabase, pid: string): Promise<number> => {
  const { data } = await supabase.rpc("production_fanzone_count", { pid });
  return Number(data ?? 0);
});

/** Lo que se desbloquea después (solo título y fecha). */
export type FanProximo = { id: string; production_id: string; tipo: FanTipo; categoria: FanCategoria; titulo: string; disponible_desde: string };
export async function getProximos(pid: string | null): Promise<FanProximo[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("fanzone_proximos", { pid });
  return (data ?? []) as FanProximo[];
}

/** Credencial del Club Fan (null si no es socio). */
export type Credencial = { numero: number; desde: string; fundador: boolean; token?: string; codigo?: string };
export async function getCredencial(): Promise<Credencial | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("fan_me");
  return (data as Credencial | null) ?? null;
}

/** Eventos (0081) que puede ver quien visita: Fan Zone, página de la obra y /eventos. */
export type Encuentro = Evento;
export async function getEncuentros(pid: string | null): Promise<Encuentro[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("fan_encuentros_lista", { pid });
  return (data ?? []) as Encuentro[];
}

/** Lo que ve quien escanea una credencial con su celular (sin sesión): nombre corto y número. */
export type CredencialPublica = { nombre: string; numero: number; desde: string; fundador: boolean };
export async function getCredencialPublica(token: string): Promise<CredencialPublica | null> {
  if (!/^[0-9a-f]{24,80}$/.test(token)) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("fan_publico", { p_token: token });
  return (data as CredencialPublica | null) ?? null;
}

/** Escaparate de próximos eventos (0082): todos, aunque sean del club o pidan cuenta (sin liga). */
export type EventoCartelera = {
  id: string; production_id: string | null; obra: string | null; tipo: Evento["tipo"]; categoria: string | null; titulo: string;
  lugar: string | null; starts_at: string; termina: string; acceso: Evento["acceso"]; requiere_registro: boolean; en_vivo: boolean;
  precio: number | null; precio_socio: number | null;
};
// Igual para todos (la base solo da los de obras visibles): guardada 60 s.
export const getEventosCartelera = publico("eventos-cartelera", async (supabase, limite: number = 6): Promise<EventoCartelera[]> => {
  const { data } = await supabase.rpc("eventos_cartelera", { p_limite: limite });
  return (data ?? []) as EventoCartelera[];
});

/** Lo que aparté o pagué (0083): Mi cuenta → Mis eventos. */
export type MiEvento = {
  id: string; titulo: string; tipo: Evento["tipo"]; obra: string | null; starts_at: string; lugar: string | null;
  orden_codigo: string | null; orden_status: "pendiente" | "aprobado" | "rechazado" | null; orden_monto: number | null;
  orden_expira: string | null; vencida: boolean | null; llegada_at: string | null;
  /** 0088: el equipo canceló el evento. */
  cancelado: boolean | null; cancelado_motivo: string | null;
};
export async function getMisEventos(): Promise<MiEvento[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("mis_eventos");
  return (data ?? []) as MiEvento[];
}
