// Evaluaciones de todos los jueces (0166): lo que cada juez puso de cada aspirante, por ronda.
// Funciones puras (evaluaciones-rules.test.ts) para la votación, el Excel y el expediente.
import type { Criterio } from "./audition-rules";

export type Evaluacion = { app: string; ronda: number; juez: string; puntos: Record<string, number>; notas: string | null; opciones: string[] };
export type PersonaEval = { id: string; numero: number | null; nombre: string; ronda: number; estado: string; edad: number | null };
export type Evaluaciones = { fase: string; criterios: Criterio[] | null; personas: PersonaEval[]; evaluaciones: Evaluacion[] };

export const nombreRonda = (r: number) => (r <= 1 ? "Audición" : r === 2 ? "Callback" : `Callback ${r - 1}`);
export const conNumero = (p: { numero: number | null; nombre: string }) => `${p.numero ? `Nº ${p.numero} · ` : ""}${p.nombre}`;

/** Promedio de las calificaciones de un juez (solo los criterios que calificó). null si no calificó nada. */
export function promedioDe(puntos: Record<string, number> | null | undefined): number | null {
  const v = Object.values(puntos ?? {}).map(Number).filter((n) => Number.isFinite(n));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/** Promedio general de una persona en una ronda: el de todas las calificaciones de todos los jueces. */
export function promedioGeneral(evs: Evaluacion[]): number | null {
  const v = evs.flatMap((e) => Object.values(e.puntos ?? {}).map(Number)).filter((n) => Number.isFinite(n));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/** Por persona, sus rondas (de la más reciente a la primera) con lo que puso cada juez. */
export function agruparPorPersona(evs: Evaluacion[]): Map<string, { ronda: number; jueces: Evaluacion[] }[]> {
  const porApp = new Map<string, Map<number, Evaluacion[]>>();
  for (const e of evs) {
    const rondas = porApp.get(e.app) ?? new Map<number, Evaluacion[]>();
    rondas.set(e.ronda, [...(rondas.get(e.ronda) ?? []), e]);
    porApp.set(e.app, rondas);
  }
  return new Map([...porApp].map(([app, rondas]) => [app,
    [...rondas].sort((a, b) => b[0] - a[0]).map(([ronda, jueces]) => ({ ronda, jueces: [...jueces].sort((x, y) => x.juez.localeCompare(y.juez, "es")) }))]));
}

/** Cuántas veces marcaron a la persona para cada personaje (u opción) en una ronda: "Brady ×2, Ensamble ×1". */
export function resumenOpciones(jueces: Evaluacion[]): string {
  const c = new Map<string, number>();
  for (const e of jueces) for (const o of e.opciones ?? []) c.set(o, (c.get(o) ?? 0) + 1);
  return [...c].sort((a, b) => b[1] - a[1]).map(([o, n]) => `${o} ×${n}`).join(", ");
}

/** Filas del Excel: una por persona, ronda y juez, con cada criterio, su promedio, sus opciones y sus notas. */
export function filasExcel(datos: Evaluaciones): (string | number | null)[][] {
  const criterios = datos.criterios ?? [];
  const porId = new Map(datos.personas.map((p) => [p.id, p]));
  const orden = new Map(datos.personas.map((p, i) => [p.id, i]));
  const evs = [...datos.evaluaciones].sort((a, b) => (orden.get(a.app) ?? 0) - (orden.get(b.app) ?? 0) || a.ronda - b.ronda || a.juez.localeCompare(b.juez, "es"));
  const fmt = (n: number | null) => (n === null ? "" : Math.round(n * 10) / 10);
  return [
    ["Nº", "Nombre", "Edad", "Ronda", "Juez", ...criterios.map((c) => c.l), "Promedio del juez", "Opción 1", "Opción 2", "Opción 3", "Notas"],
    ...evs.map((e) => {
      const p = porId.get(e.app);
      return [p?.numero ?? "", p?.nombre ?? "", p?.edad ?? "", nombreRonda(e.ronda), e.juez,
        ...criterios.map((c) => e.puntos?.[c.k] ?? ""), fmt(promedioDe(e.puntos)),
        e.opciones?.[0] ?? "", e.opciones?.[1] ?? "", e.opciones?.[2] ?? "", e.notas ?? ""];
    }),
  ];
}

/** Lo que devuelve audition_expediente (0166). votacion y cast vienen en null hasta que se cierra la votación. */
export type Expediente = {
  titulo: string; obra: string | null; fase: string; modalidad: string; con_callback: boolean; sede: string | null;
  desde: string | null; hasta: string | null;
  conteos: { inscritos: number; cancelaron: number; llegaron: number; callback: number; seleccionados: number };
  jueces: string[];
  callback: { id: string; numero: number | null; nombre: string }[];
  entrevistas: { numero: number | null; nombre: string; respuestas: { pregunta: string; respuesta: string }[] | null; extra: string | null; por: string | null }[];
  votacion: { personaje: string; totales: { numero: number | null; nombre: string; votos: number }[]; abstenciones: number; por_juez: { juez: string; voto: string | null }[] }[] | null;
  cast: { personaje: string; personas: string[] }[] | null;
  ofertas: { nombre: string; numero: number | null; tipo: string; papel: string | null; estado: string; enviada: string; respondida: string | null }[];
};
