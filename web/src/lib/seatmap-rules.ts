// Creador de mapas de asientos (Bloque 3, migración 0062). Funciones puras: seatmap-rules.test.ts.
// El panel calcula aquí la lista de asientos y la vista previa; la base la valida al guardar.

export type Lado = "izquierda" | "central" | "derecha";
export const LADOS: Lado[] = ["izquierda", "central", "derecha"];
export const LADO_CORTO: Record<Lado, string> = { izquierda: "Izq", central: "Centro", derecha: "Der" };

export type RangoZona = { zona: string; desde: number; hasta: number };

export type MapSpec = {
  /** Cómo se nombran las filas: letras (A, B… Z, AA, BB…) o números (1, 2, 3…). */
  filas: "letras" | "numeros";
  /** Cuántas filas. */
  cuantas: number;
  /** Asientos por bloque en la primera fila (0 = no hay ese bloque). */
  bloques: Record<Lado, number>;
  /** Asientos que crece cada bloque por fila (teatros en abanico). */
  crece: number;
  /** "continua": 1…N de izquierda a derecha. "bloque": cada bloque empieza en 1. */
  numeracion: "continua" | "bloque";
  /** Zona de precio por rango de filas (índices desde 1). La primera que aplique gana. */
  zonas: RangoZona[];
};

export type NuevoAsiento = { fila: string; numero: number; lado: Lado; etiqueta: string; zona: string };

export const MAX_ASIENTOS = 2000;
export const MAX_FILAS = 60;
export const MAX_POR_BLOQUE = 80;

/** Nombre de la fila i (desde 0): A…Z, luego AA, BB… ZZ; o 1, 2, 3… */
export function nombreFila(i: number, tipo: MapSpec["filas"]): string {
  if (tipo === "numeros") return String(i + 1);
  const letra = String.fromCharCode(65 + (i % 26));
  return letra.repeat(Math.floor(i / 26) + 1);
}

/** Orden natural de filas: A…Z, AA…; 1, 2… 10 (no "10" antes de "2"). */
export function compararFilas(a: string, b: string): number {
  return a.length - b.length || a.localeCompare(b, "es", { numeric: true });
}

/** Errores del formulario antes de calcular (lista vacía = todo bien). */
export function validarSpec(s: MapSpec): string[] {
  const e: string[] = [];
  if (!Number.isInteger(s.cuantas) || s.cuantas < 1 || s.cuantas > MAX_FILAS) e.push(`Las filas van de 1 a ${MAX_FILAS}.`);
  for (const l of LADOS) {
    const n = s.bloques[l];
    if (!Number.isInteger(n) || n < 0 || n > MAX_POR_BLOQUE) e.push(`Los asientos por bloque van de 0 a ${MAX_POR_BLOQUE}.`);
  }
  if (LADOS.every((l) => !s.bloques[l])) e.push("Pon asientos en al menos un bloque.");
  if (!Number.isInteger(s.crece) || s.crece < 0 || s.crece > 10) e.push("Lo que crece cada fila va de 0 a 10.");
  if (!s.zonas.length || s.zonas.some((z) => !z.zona)) e.push("Elige la zona de precio de cada rango de filas.");
  for (const z of s.zonas) if (z.desde < 1 || z.hasta < z.desde) e.push("Revisa los rangos de filas de las zonas.");
  return [...new Set(e)];
}

/** Zona de la fila i (desde 1); si ningún rango la cubre, la del último rango. */
export function zonaDeFila(zonas: RangoZona[], i: number): string {
  return (zonas.find((z) => i >= z.desde && i <= z.hasta) ?? zonas[zonas.length - 1])?.zona ?? "";
}

/** Lista de asientos que genera el formulario. */
export function generarAsientos(s: MapSpec): NuevoAsiento[] {
  const out: NuevoAsiento[] = [];
  for (let i = 0; i < s.cuantas; i++) {
    const fila = nombreFila(i, s.filas);
    const zona = zonaDeFila(s.zonas, i + 1);
    let n = 0;
    for (const lado of LADOS) {
      const base = s.bloques[lado];
      if (!base) continue;
      const cuantos = Math.min(MAX_POR_BLOQUE, base + s.crece * i);
      for (let k = 1; k <= cuantos; k++) {
        const numero = s.numeracion === "continua" ? ++n : k;
        const etiqueta = s.numeracion === "continua" ? `${fila}-${numero}` : `${fila}-${numero} ${LADO_CORTO[lado]}`;
        out.push({ fila, numero, lado, etiqueta, zona });
      }
    }
  }
  return out;
}

/** Resumen para mostrar antes de guardar. */
export function resumen(xs: { fila: string; zona: string }[]): { asientos: number; filas: number; porZona: Map<string, number> } {
  const porZona = new Map<string, number>();
  for (const x of xs) porZona.set(x.zona, (porZona.get(x.zona) ?? 0) + 1);
  return { asientos: xs.length, filas: new Set(xs.map((x) => x.fila)).size, porZona };
}

/** Colores para zonas sin color propio (se asignan en orden). */
export const PALETA = ["#8B5CF6", "#14B8A6", "#F97316", "#EC4899", "#3B82F6", "#84CC16", "#EAB308", "#A0724A"];

/** Color de una zona: el suyo, el de la 1.0 por nombre o uno de la paleta. */
export function colorZona(z: { nombre: string; color?: string | null }, i: number, porNombre: Record<string, string> = {}): string {
  return z.color || porNombre[z.nombre] || PALETA[i % PALETA.length];
}

export const SPEC_INICIAL: MapSpec = {
  filas: "letras",
  cuantas: 10,
  bloques: { izquierda: 0, central: 12, derecha: 0 },
  crece: 0,
  numeracion: "continua",
  zonas: [],
};

/** Texto legible sobre el color de una zona: negro sobre colores claros, blanco sobre oscuros. */
export function textoSobre(hex: string | null | undefined): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? "");
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#0b0910" : "#ffffff";
}
