// Reglas de la portada y de las listas de producciones. Funciones puras (sin base de
// datos ni servidor) para poder probarlas: ver home-rules.test.ts.
//   * En cartelera: publicada y con al menos una función a la venta (con fecha que no ha pasado).
//   * Próximamente: publicada pero aún sin boletos a la venta.
//   * Archivo: concluida.

import { fechaEstreno } from "@/lib/cuenta-regresiva";

export type EstadoPublico = "cartelera" | "proximamente" | "archivo";

type Rankable = { id: string; concluded: boolean; created_at: string; destacada?: boolean };
type FuncionRow = { production_id: string; starts_at: string | null; on_sale?: boolean | null };

export type ConEstado<T> = T & { estadoPublico: EstadoPublico; proxima: string | null; ultima: string | null; /** Primera función si aún no llega (cuenta regresiva). */ estreno: string | null };

export type Featured<T extends Rankable> = {
  production: ConEstado<T>;
  mode: EstadoPublico;
};

export const ETIQUETA_ESTADO: Record<EstadoPublico, string> = {
  cartelera: "En cartelera",
  proximamente: "Próximamente",
  archivo: "Archivo",
};

/** Una función vendible: en venta, con fecha y no pasada (gracia de 6 horas). */
function vendible(f: FuncionRow, ahora: Date): boolean {
  return !!f.on_sale && !!f.starts_at && new Date(f.starts_at).getTime() + 6 * 3600_000 > ahora.getTime();
}

/** Última fecha de función (con fecha) por producción. */
export function lastPerformanceDates(rows: FuncionRow[]): Map<string, string> {
  const last = new Map<string, string>();
  for (const r of rows) {
    if (!r.starts_at) continue;
    const prev = last.get(r.production_id);
    if (!prev || new Date(r.starts_at) > new Date(prev)) last.set(r.production_id, r.starts_at);
  }
  return last;
}

export function estadoPublico(p: Pick<Rankable, "id" | "concluded">, funciones: FuncionRow[], ahora: Date = new Date()): EstadoPublico {
  if (p.concluded) return "archivo";
  return funciones.some((f) => f.production_id === p.id && vendible(f, ahora)) ? "cartelera" : "proximamente";
}

/** Agrega estado, próxima función vendible y última función a cada obra. */
export function clasificar<T extends Rankable>(productions: T[], funciones: FuncionRow[], ahora: Date = new Date()): ConEstado<T>[] {
  const ultimas = lastPerformanceDates(funciones);
  return productions.map((p) => {
    const proxima = funciones
      .filter((f) => f.production_id === p.id && vendible(f, ahora))
      .map((f) => f.starts_at as string)
      .sort()[0] ?? null;
    const estreno = p.concluded ? null : fechaEstreno(funciones.filter((f) => f.production_id === p.id), ahora);
    return { ...p, estadoPublico: estadoPublico(p, funciones, ahora), proxima, ultima: ultimas.get(p.id) ?? null, estreno };
  });
}

const ORDEN: EstadoPublico[] = ["cartelera", "proximamente", "archivo"];
const t = (s: string | null | undefined) => (s ? new Date(s).getTime() : 0);

/** Cartelera (función más cercana primero) → Próximamente (más reciente) → Archivo (más reciente). */
export function ordenarObras<T extends Rankable>(xs: ConEstado<T>[]): ConEstado<T>[] {
  return [...xs].sort((a, b) => {
    const g = ORDEN.indexOf(a.estadoPublico) - ORDEN.indexOf(b.estadoPublico);
    if (g) return g;
    if (a.estadoPublico === "cartelera") return t(a.proxima) - t(b.proxima);
    if (a.estadoPublico === "proximamente") return t(b.created_at) - t(a.created_at);
    return t(b.ultima ?? b.created_at) - t(a.ultima ?? a.created_at);
  });
}

/**
 * Obra de la portada (espera la lista ya ordenada): la destacada en el panel si está en
 * cartelera o próximamente; si no, la de cartelera con la función más cercana; si no,
 * la próxima más reciente; si no, la más reciente del archivo.
 */
export function elegirPortada<T extends Rankable>(sorted: ConEstado<T>[]): Featured<T> | null {
  const elegida = sorted.find((p) => p.destacada && p.estadoPublico !== "archivo") ?? sorted[0];
  return elegida ? { production: elegida, mode: elegida.estadoPublico } : null;
}

export function agrupar<T extends Rankable>(xs: ConEstado<T>[]): Record<EstadoPublico, ConEstado<T>[]> {
  return {
    cartelera: xs.filter((p) => p.estadoPublico === "cartelera"),
    proximamente: xs.filter((p) => p.estadoPublico === "proximamente"),
    archivo: xs.filter((p) => p.estadoPublico === "archivo"),
  };
}
