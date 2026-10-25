// Logística de las funciones (0127): horarios (puertas, inicio, fin, intermedio), cómo llegar y textos para el
// público. Puras, con pruebas en logistica-rules.test.ts. Los llamados del elenco viven como ensayos.

export type Logistica = {
  puertas_min: number; duracion_min: number; intermedio_min: number | null;
  direccion: string | null; maps_url: string | null; acceso_tardio: string | null; indicaciones: string | null;
};
export type Llamado = {
  id: string; nombre: string; minutos_antes: number; elenco: "todos" | "grupos" | "nadie"; grupos: string[]; equipo_todos: boolean; orden: number;
};
export type FuncionHorario = { starts_at: string; puertas_at?: string | null; termina_at?: string | null };
export type Horario = { puertas: string; inicio: string; termina: string; intermedio: number | null };

export const LOGISTICA_OMISION: Logistica = {
  puertas_min: 30, duracion_min: 120, intermedio_min: null, direccion: null, maps_url: null, acceso_tardio: null, indicaciones: null,
};
export const ACCESO_TARDIO_OMISION = "Una vez iniciada la función, el acceso es hasta el intermedio.";

export const GRUPOS_LLAMADO: Record<string, string> = {
  reparto: "Reparto", ensamble: "Ensamble", creativo: "Creativos", produccion: "Producción", crew: "Crew", tecnico: "Técnicos", staff: "Staff",
};

const mas = (iso: string, min: number) => new Date(Date.parse(iso) + min * 60_000).toISOString();

/** Horario de una función: lo propio de la función o lo calculado con la obra. */
export function horario(f: FuncionHorario, l: Logistica | null | undefined): Horario {
  const lg = l ?? LOGISTICA_OMISION;
  return {
    inicio: new Date(f.starts_at).toISOString(),
    puertas: f.puertas_at ? new Date(f.puertas_at).toISOString() : mas(f.starts_at, -lg.puertas_min),
    termina: f.termina_at ? new Date(f.termina_at).toISOString() : mas(f.starts_at, lg.duracion_min),
    intermedio: lg.intermedio_min,
  };
}

/** La función no ha pasado (con margen de `horas` hacia atrás). */
export function porVenir(iso: string | null, horas = 0, ahora: Date = new Date()): boolean {
  return !!iso && Date.parse(iso) > ahora.getTime() - horas * 3600_000;
}

/** "7:30 p.m." en hora de México. */
export function hora(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit", timeZone: "America/Mexico_City" }).format(new Date(iso))
    .replace(/\s?a\.?\s?m\.?/i, " a.m.").replace(/\s?p\.?\s?m\.?/i, " p.m.").replace(/ | /g, " ");
}

/** "Puertas 7:30 p.m. · Función 8:00 p.m. · Termina aprox. 10:10 p.m." */
export function lineaHorario(h: Horario): string {
  return `Puertas ${hora(h.puertas)} · Función ${hora(h.inicio)} · Termina aprox. ${hora(h.termina)}`;
}

/** "Las puertas abren a las 7:30 p.m." (a la 1:00). */
export function textoPuertas(h: Pick<Horario, "puertas">): string {
  const t = hora(h.puertas);
  return `Las puertas abren ${t.startsWith("1:") ? "a la" : "a las"} ${t}`; // "p.m." ya cierra la frase
}

/** "2 h 10 min con intermedio de 15 min" (o null si no hay datos). */
export function textoDuracion(h: Horario): string | null {
  const min = Math.round((Date.parse(h.termina) - Date.parse(h.inicio)) / 60_000);
  if (min <= 0) return null;
  const hh = Math.floor(min / 60), mm = min % 60;
  const dur = [hh ? `${hh} h` : null, mm ? `${mm} min` : null].filter(Boolean).join(" ");
  return h.intermedio ? `${dur} con intermedio de ${h.intermedio} min` : dur;
}

/** Liga de Google Maps: la que pusieron o una búsqueda con la dirección (y el lugar). */
export function ligaMaps(l: Pick<Logistica, "direccion" | "maps_url"> | null | undefined, lugar?: string | null): string | null {
  if (l?.maps_url) return l.maps_url;
  const q = [lugar, l?.direccion].filter(Boolean).join(", ");
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
}

/** "Llama a todo el elenco y al equipo", "Llama a Crew y Técnicos". */
export function aQuienLlama(l: Pick<Llamado, "elenco" | "grupos" | "equipo_todos">): string {
  const elenco = l.elenco === "todos" ? "a todo el elenco" : l.elenco === "grupos" ? `a ${l.grupos.map((g) => GRUPOS_LLAMADO[g] ?? g).join(", ")}` : null;
  const partes = [elenco, l.equipo_todos ? "al equipo" : null].filter(Boolean);
  return partes.length ? `Llama ${partes.join(" y ")}` : "Sin citados";
}

/** Los llamados de una función con su hora, en orden (el más temprano primero). */
export function horasLlamados(f: FuncionHorario, ls: Pick<Llamado, "nombre" | "minutos_antes">[]): { nombre: string; hora: string }[] {
  return [...ls].sort((a, b) => b.minutos_antes - a.minutos_antes).map((l) => ({ nombre: l.nombre, hora: mas(f.starts_at, -l.minutos_antes) }));
}
