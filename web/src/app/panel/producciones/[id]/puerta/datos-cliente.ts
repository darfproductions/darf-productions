import type { Conteo } from "./actions";
import type { ListaPuerta } from "./sin-conexion-rules";

// Pide a la ruta GET de la puerta (datos/route.ts) el contador o la lista. null si falla o no hay red.
async function pedir<T>(pid: string, funcion: string, que: "conteo" | "lista"): Promise<T | null> {
  try {
    const r = await fetch(`/panel/producciones/${encodeURIComponent(pid)}/puerta/datos?funcion=${encodeURIComponent(funcion)}&que=${que}`, { cache: "no-store" });
    return r.ok ? ((await r.json()) as T | null) : null;
  } catch {
    return null;
  }
}
export const conteoGet = (pid: string, funcion: string) => pedir<Conteo>(pid, funcion, "conteo");
export const listaGet = (pid: string, funcion: string) => pedir<ListaPuerta>(pid, funcion, "lista");
