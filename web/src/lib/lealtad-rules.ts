// DARF Loyalty (0103): medalla por número de producciones (equipo o elenco), con niveles en inglés
// y una piedra preciosa por nivel (Diego 2026-10-14). Al centro va el número exacto de producciones.
// Funciones puras: lealtad-rules.test.ts.

export type NivelLealtad = {
  min: number; nombre: string; piedra: string;
  /** Piedra: brillo, cuerpo y sombra (degradado radial de la medalla). */
  colores: [string, string, string];
  /** Color del aro con las letras y del número. */
  aro: string; texto: string;
};

export const NIVELES_LEALTAD: NivelLealtad[] = [
  { min: 3, nombre: "Rookie", piedra: "Cuarzo rosa", colores: ["#ffd3df", "#e0839f", "#9c4763"], aro: "#6b2a45", texto: "#ffffff" },
  { min: 5, nombre: "Rising Star", piedra: "Turquesa", colores: ["#c9fbf4", "#3fd0c3", "#127a74"], aro: "#0b4f4b", texto: "#ffffff" },
  { min: 10, nombre: "Lead", piedra: "Esmeralda", colores: ["#b8f5cf", "#1fb36a", "#08603a"], aro: "#053d25", texto: "#ffffff" },
  { min: 15, nombre: "Headliner", piedra: "Zafiro", colores: ["#b9cbff", "#2f5bea", "#0f2a8a"], aro: "#0a1c5e", texto: "#ffffff" },
  { min: 20, nombre: "Showstopper", piedra: "Amatista", colores: ["#e9c9ff", "#9b4dde", "#4f1d86"], aro: "#341259", texto: "#ffffff" },
  { min: 30, nombre: "Legend", piedra: "Rubí", colores: ["#ffc2cb", "#e0153d", "#7d0019"], aro: "#55000f", texto: "#ffffff" },
  { min: 50, nombre: "Hall of Fame", piedra: "Diamante negro", colores: ["#6b6f7a", "#24262d", "#050507"], aro: "#000000", texto: "#ffffff" },
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
