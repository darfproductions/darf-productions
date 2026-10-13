import { contrastRatio } from "@/lib/kit-rules";

// Franja de avisos abajo del Hero de la obra (0069). Funciones puras: banner-rules.test.ts.

export type BannerEstilo = "corre" | "fija";
export type BannerItem = { texto: string; enlace: string | null; boton: string | null; inicia: string | null; termina: string | null };
export type Banner = { estilo: BannerEstilo; color: string | null; activa: boolean; items: BannerItem[] };

/** Avisos que se ven ahora: sin fechas, o dentro de su rango (inicio incluido, fin excluido). */
export function avisosVigentes(items: BannerItem[], ahora: Date = new Date()): BannerItem[] {
  const t = ahora.getTime();
  return items.filter((i) => (!i.inicia || new Date(i.inicia).getTime() <= t) && (!i.termina || new Date(i.termina).getTime() > t));
}

/** Liga permitida: interna ("/…", nunca "//…" ni "/\…") o https. Misma regla que la base. */
export function enlaceValido(s: string): boolean {
  if (s.length > 500 || /\s/.test(s)) return false;
  return /^\/($|[^/\\])/.test(s) || /^https:\/\/\S+$/.test(s);
}

/** Texto negro o blanco, el que mejor se lea sobre el color de la franja. */
export function textoSobre(fondo: string): string {
  return contrastRatio("#111111", fondo) >= contrastRatio("#ffffff", fondo) ? "#111111" : "#ffffff";
}

export const esColor = (s: string) => /^#[0-9a-fA-F]{6}$/.test(s);
