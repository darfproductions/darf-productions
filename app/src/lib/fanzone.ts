import type { Anuncio } from "@/lib/anuncio-rules";
import type { Evento } from "@/lib/eventos-rules";
import { ordenFanzone, type FanCategoria, type FanItem, type FanTipo } from "@/lib/fanzone-rules";
import { leerCartelera } from "~/lib/datos";
import { supabase } from "~/lib/supabase";

// Fan Zone y eventos (0052, 0074, 0075, 0076, 0081): las mismas lecturas que web/src/lib/fanzone.ts, preventa.ts y
// anuncios.ts con el cliente de la app. RLS decide: solo socios ven contenidos y lo bloqueado llega hasta su día.

export type FanItemVista = FanItem & { archivo_url: string | null };
export type FanProximo = { id: string; production_id: string; tipo: FanTipo; categoria: FanCategoria; titulo: string; disponible_desde: string };
export type CredencialFan = { numero: number; desde: string; fundador: boolean };
export type PreventaObra = { pid: string; nombre: string; estado: "abierta" | "proxima"; hasta: string | null; recordatorio: boolean };
export type AnuncioVista = Anuncio & { imagen_url: string | null };
export type EventoCartelera = {
  id: string; production_id: string | null; obra: string | null; tipo: Evento["tipo"]; categoria: string | null; titulo: string;
  lugar: string | null; starts_at: string; termina: string; acceso: Evento["acceso"]; requiere_registro: boolean; en_vivo: boolean;
  precio: number | null; precio_socio: number | null;
};

const publica = (bucket: string, path: string) => supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;

export async function leerSocio(): Promise<{ credencial: CredencialFan | null; socio: boolean }> {
  const [c, s] = await Promise.all([supabase.rpc("fan_me"), supabase.rpc("is_fan_member")]);
  return { credencial: (c.data as CredencialFan | null) ?? null, socio: s.data === true };
}

export async function leerEventos(pid: string | null): Promise<Evento[]> {
  const { data } = await supabase.rpc("fan_encuentros_lista", { pid });
  return (data ?? []) as Evento[];
}

export async function leerEventosCartelera(limite = 30): Promise<EventoCartelera[]> {
  const { data } = await supabase.rpc("eventos_cartelera", { p_limite: limite });
  return (data ?? []) as EventoCartelera[];
}

export async function leerAnuncios(pid: string | null): Promise<AnuncioVista[]> {
  const { data, error } = await supabase.rpc("anuncios_publicos", { p_lugar: "fanzone", pid });
  if (error) return [];
  return ((data ?? []) as Anuncio[]).map((a) => ({ ...a, imagen_url: a.imagen_path ? publica("gallery", a.imagen_path) : null }));
}

async function leerPreventas(pid: string | null, obras: { id: string; nombre: string; estadoPublico?: string }[]): Promise<PreventaObra[]> {
  const ahora = new Date().toISOString();
  const [perfs, mios] = await Promise.all([
    supabase.from("performances").select("production_id, preventa_hasta").eq("on_sale", true).gt("preventa_hasta", ahora).or(`preventa_desde.is.null,preventa_desde.lte.${ahora}`),
    supabase.from("preventa_recordatorios").select("production_id"),
  ]);
  const abiertas = new Map<string, string>();
  for (const r of (perfs.data ?? []) as { production_id: string; preventa_hasta: string }[]) {
    const prev = abiertas.get(r.production_id);
    if (!prev || r.preventa_hasta > prev) abiertas.set(r.production_id, r.preventa_hasta);
  }
  const recordar = new Set(((mios.data ?? []) as { production_id: string }[]).map((r) => r.production_id));
  const out: PreventaObra[] = [];
  for (const p of obras) {
    if (pid && p.id !== pid) continue;
    if (abiertas.has(p.id)) out.push({ pid: p.id, nombre: p.nombre, estado: "abierta", hasta: abiertas.get(p.id)!, recordatorio: false });
    else if (p.estadoPublico === "proximamente") out.push({ pid: p.id, nombre: p.nombre, estado: "proxima", hasta: null, recordatorio: recordar.has(p.id) });
  }
  return out;
}

/** Todo lo de la Fan Zone de una vez (pid = una obra o todas). */
export async function leerFanZone(pid: string | null) {
  const [{ credencial, socio }, cartelera] = await Promise.all([leerSocio(), leerCartelera()]);
  const obras = cartelera.obras as unknown as { id: string; nombre: string; temporada: string | null; estadoPublico?: string }[];
  if (!credencial && !socio) return { credencial, socio, obras, items: [], proximos: [], eventos: [], anuncios: await leerAnuncios(pid), preventas: [], conContenido: new Set<string>() };
  let q = supabase.from("fanzone_items").select("*");
  if (pid) q = q.eq("production_id", pid);
  const [items, todos, proximos, proximosTodos, eventos, anuncios, preventas] = await Promise.all([
    q, supabase.from("fanzone_items").select("production_id"),
    supabase.rpc("fanzone_proximos", { pid }), pid ? supabase.rpc("fanzone_proximos", { pid: null }) : Promise.resolve(null),
    leerEventos(pid), leerAnuncios(pid), leerPreventas(pid, obras),
  ]);
  const lista = ordenFanzone((items.data ?? []) as FanItem[]).map((i) => ({ ...i, archivo_url: i.archivo_path ? publica("gallery", i.archivo_path) : null }));
  const prox = (proximos.data ?? []) as FanProximo[];
  const conContenido = new Set<string>([
    ...((todos.data ?? []) as { production_id: string }[]).map((r) => r.production_id),
    ...((proximosTodos?.data ?? prox) as FanProximo[]).map((p) => p.production_id),
  ]);
  return { credencial, socio, obras, items: lista.filter((i) => i.visible), proximos: prox, eventos, anuncios, preventas, conContenido };
}
