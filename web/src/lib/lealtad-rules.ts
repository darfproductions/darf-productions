// DARF Loyalty (0103): medalla por número de producciones (equipo o elenco), con niveles en inglés
// y una piedra preciosa por nivel (Diego 2026-10-14). Al centro va el número exacto de producciones.
// Funciones puras: lealtad-rules.test.ts.

export type NivelLealtad = {
  min: number; nombre: string; piedra: string;
  /** Color de la piedra sobre fondo oscuro, claro → medio (trazo, letras y número de la medalla). */
  linea: [string, string];
};

export const NIVELES_LEALTAD: NivelLealtad[] = [
  { min: 3, nombre: "Rookie", piedra: "Cuarzo rosa", linea: ["#ffd9e4", "#f19bb6"] },
  { min: 5, nombre: "Rising Star", piedra: "Turquesa", linea: ["#c9fbf4", "#3fd0c3"] },
  { min: 10, nombre: "Lead", piedra: "Esmeralda", linea: ["#c4f7d8", "#2ecf7f"] },
  { min: 15, nombre: "Headliner", piedra: "Zafiro", linea: ["#d0dcff", "#6b8cff"] },
  { min: 20, nombre: "Showstopper", piedra: "Amatista", linea: ["#ecd6ff", "#b07cf0"] },
  { min: 30, nombre: "Legend", piedra: "Rubí", linea: ["#ffd0d7", "#ff3b5c"] },
  { min: 50, nombre: "Hall of Fame", piedra: "Diamante negro", linea: ["#ffffff", "#8d939d"] },
];

/** Nivel de quien lleva `n` producciones (null antes de 3). */
export function nivelDe(n: number | null | undefined): NivelLealtad | null {
  if (!n || n < NIVELES_LEALTAD[0].min) return null;
  return [...NIVELES_LEALTAD].reverse().find((l) => n >= l.min) ?? null;
}

/** Siguiente meta para la barra de Mi cuenta: null si ya llegó al máximo (50). */
export function siguienteMeta(n: number): { nivel: NivelLealtad; faltan: number; progreso: number } | null {
  const sig = NIVELES_LEALTAD.find((l) => n < l.min);
  if (!sig) return null;
  const desde = nivelDe(n)?.min ?? 0;
  return { nivel: sig, faltan: sig.min - n, progreso: Math.max(0, Math.min(1, (n - desde) / (sig.min - desde))) };
}

/** Imagen de la medalla (PNG generado con el número exacto). */
export function medallaSrc(n: number): string {
  return `/medalla/${Math.min(Math.max(Math.floor(n), 0), 999)}`;
}

/** "Lead · 12 producciones". */
export function textoLealtad(n: number): string | null {
  const l = nivelDe(n);
  return l ? `${l.nombre} · ${n} producciones` : null;
}
