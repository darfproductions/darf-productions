import { pasaSolo } from "@/lib/audicion-vivo-rules";

/** Lista para imprimir o exportar de una convocatoria: quién audiciona, de qué, de qué grupo es y con quién pasa. */

export type ListaApp = {
  id: string;
  numero: number | null;
  nombre: string;
  edad: number | null;
  estado: string;
  horario: string | null;
  personajes: string[];
  /** Respuesta a la pregunta «Grupo» (de qué grupo es). */
  grupo: string | null;
  /** Respuesta a «¿Con quién pasas?» (lo que escribió la persona). */
  conRespuesta: string | null;
  /** Grupo de turno armado por el equipo (pasan juntos y comparten número). */
  grupoTurno: string | null;
};

export type ListaFila = ListaApp & { pasaCon: string };
export type ListaSeccion = { titulo: string | null; filas: ListaFila[] };

export const ORDENES = {
  turno: "Por turno",
  grupo: "Por grupo",
  personaje: "Por personaje",
  nombre: "Por nombre",
} as const;
export type Orden = keyof typeof ORDENES;
export const ordenValido = (v: unknown): Orden => (typeof v === "string" && v in ORDENES ? (v as Orden) : "turno");

const porTurno = (a: ListaApp, b: ListaApp) =>
  (a.numero ?? Infinity) - (b.numero ?? Infinity) || a.nombre.localeCompare(b.nombre, "es");
const porNombre = (a: ListaApp, b: ListaApp) => a.nombre.localeCompare(b.nombre, "es");

/** Con quién pasa: primero el grupo de turno armado por el equipo; si no hay, lo que escribió la persona; si no, «Solo». */
export function pasaCon(app: ListaApp, todos: ListaApp[]): string {
  if (app.grupoTurno) {
    const otros = todos.filter((x) => x.grupoTurno === app.grupoTurno && x.id !== app.id).sort(porTurno).map((x) => x.nombre);
    if (otros.length) return otros.join(", ");
  }
  if (app.conRespuesta && !pasaSolo(app.conRespuesta)) return app.conRespuesta.trim();
  return "Solo";
}

/** Arma la lista en secciones según el orden. «Por personaje» repite a quien audiciona para varios. */
export function armarLista(apps: ListaApp[], orden: Orden): ListaSeccion[] {
  const filas: ListaFila[] = apps.map((a) => ({ ...a, pasaCon: pasaCon(a, apps) }));
  if (orden === "turno") return [{ titulo: null, filas: [...filas].sort(porTurno) }];
  if (orden === "nombre") return [{ titulo: null, filas: [...filas].sort(porNombre) }];
  const secciones = new Map<string, ListaFila[]>();
  const sin: ListaFila[] = [];
  for (const f of filas) {
    const claves = orden === "grupo" ? (f.grupo?.trim() ? [f.grupo.trim()] : []) : f.personajes;
    if (!claves.length) sin.push(f);
    for (const c of claves) secciones.set(c, [...(secciones.get(c) ?? []), f]);
  }
  const titulos = [...secciones.keys()];
  // Los grupos van en orden natural (Grupo 2 antes que Grupo 10); los personajes, en el orden en que llegan.
  if (orden === "grupo") titulos.sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  const out = titulos.map((t) => ({ titulo: t, filas: (secciones.get(t) ?? []).sort(porTurno) }));
  if (sin.length) out.push({ titulo: orden === "grupo" ? "Sin grupo" : "Sin personaje", filas: sin.sort(porTurno) });
  return out;
}

/** En la tabla, el número de turno se escribe solo en la primera fila de quienes lo comparten. */
export function primeraDelTurno(filas: ListaFila[], i: number): boolean {
  return i === 0 || filas[i].numero == null || filas[i - 1].numero !== filas[i].numero;
}
