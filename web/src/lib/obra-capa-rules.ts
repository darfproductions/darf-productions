// Cambios de la página de la obra por capas (0119): lo publicado, lo que ya ven los fans y el borrador.
// Una "capa" trae, por sección, cómo queda esa sección; lo que no trae se queda como está.

import type { Banner } from "@/lib/banner-rules";

export const SECCIONES = ["datos", "colores", "kit", "poster", "franja", "canciones", "ficha", "videos", "gracias"] as const;
export type Seccion = (typeof SECCIONES)[number];

export const NOMBRE_SECCION: Record<Seccion, string> = {
  datos: "Datos y sinopsis",
  colores: "Colores",
  kit: "Logo e imagen de ambiente",
  poster: "Póster oficial",
  franja: "Franja de avisos",
  canciones: "Canciones",
  ficha: "Ficha extra",
  videos: "Videos",
  gracias: "Agradecimientos",
};

/** Bloque del editor donde está cada sección (para el enlace "Editar"). */
export const ANCLA_SECCION: Record<Seccion, string> = {
  datos: "datos", colores: "kit", kit: "kit", poster: "poster", franja: "franja", canciones: "canciones", ficha: "extra", videos: "videos", gracias: "gracias",
};

export type DatosObra = { nombre: string; frase: string | null; sinopsis: string | null; venue: string | null; temporada: string | null; fecha: string | null; duracion: string | null; clasificacion: string | null; idioma: string | null; basada_en: string | null };

export type Capa = Partial<{
  datos: DatosObra;
  colores: { color_fondo: string; color_superficie: string; color_texto: string; color_acento: string };
  kit: { logo_path: string | null; ambiente_path: string | null };
  poster: Record<string, string | null>;
  franja: Banner;
  canciones: { actos: { nombre: string; canciones: string[] }[] };
  ficha: { items: { etiqueta: string; valor: string }[] };
  videos: { items: { titulo: string; youtube_id: string }[] };
  gracias: { items: string[] };
}>;

/** Solo las secciones conocidas (lo que venga de la base se toma como dato). */
export function leerCapa(x: unknown): Capa {
  if (!x || typeof x !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const s of SECCIONES) if ((x as Record<string, unknown>)[s] && typeof (x as Record<string, unknown>)[s] === "object") out[s] = (x as Record<string, unknown>)[s];
  return out as Capa;
}

export const capaVacia = (c: Capa) => Object.keys(c).length === 0;

/** Columnas de la obra con la capa encima (datos, colores, kit y póster). */
export function obraConCapa<T extends object>(p: T, c: Capa): T {
  const poster = c.poster ? Object.fromEntries(Object.entries(c.poster).filter(([k]) => /^poster_(3x4|9x16|4x3|16x9)(_info)?_path$/.test(k))) : {};
  return { ...p, ...(c.datos ?? {}), ...(c.colores ?? {}), ...(c.kit ?? {}), ...poster };
}

export type EstadoCambio = { seccion: Seccion; borrador: boolean; fans: boolean; borrador_at: string | null; fans_at: string | null };

/** Lo que falta por publicar, en el orden del editor. */
export function ordenarCambios(rows: EstadoCambio[]): EstadoCambio[] {
  return SECCIONES.flatMap((s) => rows.filter((r) => r.seccion === s && (r.borrador || r.fans)));
}
