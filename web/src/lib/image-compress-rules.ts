// Compresión de fotos antes de subirlas (plan, bloque 1). Puro, con pruebas en
// image-compress-rules.test.ts. El navegador hace el trabajo en lib/image-compress.ts.

export type CompressKind = "logo" | "ambiente" | "retrato" | "galeria" | "patrocinador" | "avatar" | "perfil" | "fanzone" | "documento" | "poster";

/** Lado mayor máximo por uso (px) y calidad. */
export const COMPRESS: Record<CompressKind, { maxDim: number; quality: number }> = {
  logo: { maxDim: 2400, quality: 0.92 },
  ambiente: { maxDim: 2560, quality: 0.85 },
  retrato: { maxDim: 1600, quality: 0.85 },
  galeria: { maxDim: 2400, quality: 0.85 },
  patrocinador: { maxDim: 1200, quality: 0.9 },
  avatar: { maxDim: 800, quality: 0.85 },
  perfil: { maxDim: 1600, quality: 0.85 },
  fanzone: { maxDim: 2400, quality: 0.85 },
  documento: { maxDim: 2000, quality: 0.85 },
  poster: { maxDim: 2560, quality: 0.88 },
};

/** Ya es ligera: no vale la pena tocarla. */
export const LIGERA = 300 * 1024;

/** Medidas destino conservando la proporción (nunca agranda). */
export function destino(w: number, h: number, maxDim: number): { w: number; h: number } {
  const lado = Math.max(w, h);
  if (lado <= maxDim) return { w, h };
  const f = maxDim / lado;
  return { w: Math.max(1, Math.round(w * f)), h: Math.max(1, Math.round(h * f)) };
}

/** ¿Hay que procesarla? No si ya es ligera y cabe en el tamaño máximo. */
export function hayQueComprimir(kind: CompressKind, i: { size: number; width: number; height: number }): boolean {
  return i.size > LIGERA || Math.max(i.width, i.height) > COMPRESS[kind].maxDim;
}

/** Formato de salida: WebP si el navegador lo genera (conserva transparencia); si no, JPEG o PNG (con transparencia). */
export function formatoSalida(webp: boolean, transparencia: boolean): "image/webp" | "image/jpeg" | "image/png" {
  if (webp) return "image/webp";
  return transparencia ? "image/png" : "image/jpeg";
}

/** "4.2 MB" / "380 KB". */
export function peso(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Nombre con la extensión del nuevo formato. */
export function renombrar(nombre: string, tipo: string): string {
  const ext = tipo === "image/webp" ? "webp" : tipo === "image/png" ? "png" : "jpg";
  return `${nombre.replace(/\.[^.]+$/, "") || "foto"}.${ext}`;
}

/** Área de un logo sin sus márgenes transparentes, con un poco de aire. null = no conviene recortar. */
export function recorteAlfa(caja: { x0: number; y0: number; x1: number; y1: number } | null, w: number, h: number, aire = 0.02): { x: number; y: number; w: number; h: number } | null {
  if (!caja || caja.x1 < caja.x0 || caja.y1 < caja.y0) return null;
  const pad = Math.round(Math.max(caja.x1 - caja.x0, caja.y1 - caja.y0) * aire);
  const x = Math.max(0, caja.x0 - pad), y = Math.max(0, caja.y0 - pad);
  const r = { x, y, w: Math.min(w, caja.x1 + pad + 1) - x, h: Math.min(h, caja.y1 + pad + 1) - y };
  // Solo si quita al menos 5% del ancho o del alto.
  return r.w < w * 0.95 || r.h < h * 0.95 ? r : null;
}
