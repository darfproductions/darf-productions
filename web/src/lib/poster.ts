// Póster oficial de la obra (0093). Opcional: mientras no exista se usa la imagen de ambiente.
// Dos versiones por formato: "info" (con fechas, lugar y créditos) para donde la página NO pone los
// datos (compartir, PDF, la página de la obra) y "limpia" (solo imagen) para donde la página ya pone
// el logo y los datos encima (destacada, tarjetas, "Voy a ir"). Puro, con pruebas en poster.test.ts.

export const FORMATOS = ["3x4", "9x16", "4x3", "16x9"] as const;
export type Formato = (typeof FORMATOS)[number];

export const FORMATO_INFO: Record<Formato, { titulo: string; uso: string; ratio: number; minAncho: number; ideal: string }> = {
  "3x4": { titulo: "Póster 3:4", uso: "Póster oficial: página de la obra, tarjetas en celular, boletos y PDF.", ratio: 3 / 4, minAncho: 900, ideal: "1500×2000" },
  "9x16": { titulo: "Historia 9:16", uso: "Historias y estados: la imagen “Voy a ir” (usa la versión solo imagen).", ratio: 9 / 16, minAncho: 1080, ideal: "1080×1920" },
  "4x3": { titulo: "Destacada 4:3", uso: "Obra destacada en celular.", ratio: 4 / 3, minAncho: 1200, ideal: "1600×1200" },
  "16x9": { titulo: "Destacada 16:9", uso: "Obra destacada en computadora y al compartir la liga.", ratio: 16 / 9, minAncho: 1600, ideal: "1920×1080" },
};

export type PosterColumns = {
  poster_3x4_path?: string | null; poster_3x4_info_path?: string | null;
  poster_9x16_path?: string | null; poster_9x16_info_path?: string | null;
  poster_4x3_path?: string | null; poster_4x3_info_path?: string | null;
  poster_16x9_path?: string | null; poster_16x9_info_path?: string | null;
};

export const POSTER_COLUMNS = "poster_3x4_path, poster_3x4_info_path, poster_9x16_path, poster_9x16_info_path, poster_4x3_path, poster_4x3_info_path, poster_16x9_path, poster_16x9_info_path";

export function columna(f: Formato, info: boolean): keyof PosterColumns {
  return `poster_${f}${info ? "_info" : ""}_path` as keyof PosterColumns;
}

/** Ruta del póster en ese formato y versión (o null). */
export function poster(p: PosterColumns | null | undefined, f: Formato, info: boolean): string | null {
  return (p?.[columna(f, info)] as string | null | undefined) ?? null;
}

/** ¿Ya tiene póster oficial? (cualquier formato) */
export function tienePoster(p: PosterColumns | null | undefined): boolean {
  return FORMATOS.some((f) => poster(p, f, false) || poster(p, f, true));
}

export type Uso = "voy" | "destacada-celular" | "destacada" | "tarjeta-celular" | "pagina" | "boleto" | "compartir";

/** Qué imagen usar en cada lugar, en orden de preferencia. `info` dice si ya trae los datos (no
 *  se les pone logo ni fecha encima). null = no hay póster: usar la imagen de ambiente. */
export function elegir(p: PosterColumns | null | undefined, uso: Uso): { path: string; info: boolean } | null {
  const orden: Record<Uso, [Formato, boolean][]> = {
    // "Voy a ir" siempre con la versión limpia: la imagen pone encima los logos, el texto y la función.
    voy: [["9x16", false], ["3x4", false]],
    "destacada-celular": [["4x3", false], ["16x9", false]],
    destacada: [["16x9", false], ["4x3", false]],
    "tarjeta-celular": [["3x4", false]],
    pagina: [["3x4", true], ["3x4", false]],
    boleto: [["3x4", false], ["3x4", true]],
    compartir: [["16x9", true], ["16x9", false]],
  };
  for (const [f, info] of orden[uso]) {
    const path = poster(p, f, info);
    if (path) return { path, info };
  }
  return null;
}

/** Revisa la proporción de una imagen contra su formato (tolerancia 4 %) y su tamaño. */
export function revisarPoster(f: Formato, ancho: number, alto: number): { errores: string[]; avisos: string[] } {
  const r = FORMATO_INFO[f];
  const errores: string[] = [];
  const avisos: string[] = [];
  if (Math.abs(ancho / alto / r.ratio - 1) > 0.04) errores.push(`No es ${r.titulo.split(" ").pop()}: mide ${ancho}×${alto}. Ideal ${r.ideal}.`);
  if (ancho < r.minAncho) errores.push(`Es muy pequeña (mínimo ${r.minAncho} px de ancho; ideal ${r.ideal}).`);
  return { errores, avisos };
}
