// Medallas por constancia (Diego 2026-10-14), con niveles en inglés y el número exacto al centro:
//   * equipo (0103, DARF Loyalty): producciones en las que estuvo en el equipo o el elenco; piedras preciosas.
//   * fan (0104, DARF Fan Zone): funciones y eventos a los que entró, desde la butaca; metales. Solo socios.
// Funciones puras: lealtad-rules.test.ts.

export type Programa = "equipo" | "fan";

export type NivelLealtad = {
  min: number; nombre: string;
  /** Piedra (equipo) o metal (fan) del nivel. */
  material: string;
  /** Color sobre fondo oscuro, claro → medio (trazo, letras y número de la medalla). */
  linea: [string, string];
};

export const NIVELES_LEALTAD: NivelLealtad[] = [
  { min: 3, nombre: "Rookie", material: "Cuarzo rosa", linea: ["#ffd9e4", "#f19bb6"] },
  { min: 5, nombre: "Rising Star", material: "Turquesa", linea: ["#c9fbf4", "#3fd0c3"] },
  { min: 10, nombre: "Lead", material: "Esmeralda", linea: ["#c4f7d8", "#2ecf7f"] },
  { min: 15, nombre: "Headliner", material: "Zafiro", linea: ["#d0dcff", "#6b8cff"] },
  { min: 20, nombre: "Showstopper", material: "Amatista", linea: ["#ecd6ff", "#b07cf0"] },
  { min: 30, nombre: "Legend", material: "Rubí", linea: ["#ffd0d7", "#ff3b5c"] },
  { min: 50, nombre: "Hall of Fame", material: "Diamante negro", linea: ["#ffffff", "#8d939d"] },
];

/** Fans (0104): de las butacas de hasta atrás al escenario, en metales. Mismas metas que el equipo. */
export const NIVELES_FAN: NivelLealtad[] = [
  { min: 3, nombre: "Balcony", material: "Bronce", linea: ["#f6d2b0", "#c9814a"] },
  { min: 5, nombre: "Mezzanine", material: "Plata", linea: ["#f4f6f8", "#aab1bb"] },
  { min: 10, nombre: "Orchestra", material: "Oro", linea: ["#fff0b3", "#e2b93b"] },
  { min: 15, nombre: "Front Row", material: "Oro rosa", linea: ["#ffe0d6", "#e3998a"] },
  { min: 20, nombre: "VIP", material: "Platino", linea: ["#eef4ff", "#a9bcd8"] },
  { min: 30, nombre: "Backstage", material: "Titanio", linea: ["#e2e6ea", "#7d8894"] },
  { min: 50, nombre: "Standing Ovation", material: "Oro negro", linea: ["#f3e3a6", "#9a8148"] },
];

export const PROGRAMA: Record<Programa, { titulo: string; aro: string; niveles: NivelLealtad[]; unidad: [string, string] }> = {
  equipo: { titulo: "DARF Loyalty", aro: "DARF LOYALTY", niveles: NIVELES_LEALTAD, unidad: ["producción", "producciones"] },
  fan: { titulo: "DARF Fan Zone", aro: "DARF FAN ZONE", niveles: NIVELES_FAN, unidad: ["visita", "visitas"] },
};

/** "1 producción", "7 visitas". */
export function cuantas(n: number, prog: Programa = "equipo"): string {
  const [uno, varias] = PROGRAMA[prog].unidad;
  return `${n} ${n === 1 ? uno : varias}`;
}

/** Nivel de quien lleva `n` (null antes de 3). */
export function nivelDe(n: number | null | undefined, prog: Programa = "equipo"): NivelLealtad | null {
  const niveles = PROGRAMA[prog].niveles;
  if (!n || n < niveles[0].min) return null;
  return [...niveles].reverse().find((l) => n >= l.min) ?? null;
}

/** Siguiente meta para la barra de Mi cuenta: null si ya llegó al máximo (50). */
export function siguienteMeta(n: number, prog: Programa = "equipo"): { nivel: NivelLealtad; faltan: number; progreso: number } | null {
  const sig = PROGRAMA[prog].niveles.find((l) => n < l.min);
  if (!sig) return null;
  const desde = nivelDe(n, prog)?.min ?? 0;
  return { nivel: sig, faltan: sig.min - n, progreso: Math.max(0, Math.min(1, (n - desde) / (sig.min - desde))) };
}

/** Imagen de la medalla (PNG generado con el número exacto): /medalla/12 (equipo) o /medalla/f12 (fan). */
export function medallaSrc(n: number, prog: Programa = "equipo"): string {
  return `/medalla/${prog === "fan" ? "f" : ""}${Math.min(Math.max(Math.floor(n), 0), 999)}`;
}

/** Lee "/medalla/f12" → { prog: "fan", n: 12 }. */
export function leerMedalla(src: string): { prog: Programa; n: number } | null {
  const m = /^\/medalla\/(f?)(\d{1,3})$/.exec(src);
  return m ? { prog: m[1] ? "fan" : "equipo", n: Number(m[2]) } : null;
}

/** "Lead · 12 producciones" / "Mezzanine · 7 visitas". */
export function textoLealtad(n: number, prog: Programa = "equipo"): string | null {
  const l = nivelDe(n, prog);
  return l ? `${l.nombre} · ${cuantas(n, prog)}` : null;
}
