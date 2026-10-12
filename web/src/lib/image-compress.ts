"use client";

import { COMPRESS, destino, formatoSalida, hayQueComprimir, peso, recorteAlfa, renombrar, type CompressKind } from "@/lib/image-compress-rules";

// Comprime una foto en el navegador antes de subirla (sin librerías): la reduce al tamaño
// máximo de su uso y la guarda en WebP (o JPEG/PNG si el navegador no hace WebP). Si el
// resultado no es más ligero, se sube la original. Las reglas están en image-compress-rules.ts.

export type Compressed = { file: File; antes: number; despues: number; nota: string | null };

let webpOk: boolean | null = null;
async function soportaWebp(): Promise<boolean> {
  if (webpOk !== null) return webpOk;
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  const b = await new Promise<Blob | null>((r) => c.toBlob(r, "image/webp", 0.8));
  webpOk = !!b && b.type === "image/webp";
  return webpOk;
}

function tieneTransparencia(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const px = ctx.getImageData(0, 0, Math.min(w, 400), Math.min(h, 400)).data;
  for (let i = 3; i < px.length; i += 16) if (px[i] < 250) return true;
  return false;
}

/** Caja de lo que no es transparente (alfa > 8). */
function cajaVisible(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const px = ctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

export async function compressImage(file: File, kind: CompressKind): Promise<Compressed> {
  const sinCambio: Compressed = { file, antes: file.size, despues: file.size, nota: null };
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.type === "image/svg+xml") return sinCambio;
  try {
    const bmp = await createImageBitmap(file);
    // Los logos con transparencia siempre se revisan: se les quitan los márgenes vacíos
    // para que en la página se vean del tamaño correcto.
    const esLogoPng = kind === "logo" && file.type !== "image/jpeg";
    if (!esLogoPng && !hayQueComprimir(kind, { size: file.size, width: bmp.width, height: bmp.height })) { bmp.close(); return sinCambio; }
    let { w, h } = destino(bmp.width, bmp.height, COMPRESS[kind].maxDim);
    let canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    let ctx = canvas.getContext("2d");
    if (!ctx) { bmp.close(); return sinCambio; }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const alpha = file.type !== "image/jpeg" && tieneTransparencia(ctx, w, h);
    let recortado = false;
    if (kind === "logo" && alpha) {
      const r = recorteAlfa(cajaVisible(ctx, w, h), w, h);
      if (r) {
        const c2 = document.createElement("canvas");
        c2.width = r.w;
        c2.height = r.h;
        const x2 = c2.getContext("2d");
        if (x2) {
          x2.drawImage(canvas, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
          canvas = c2; ctx = x2; w = r.w; h = r.h; recortado = true;
        }
      }
    }
    const tipo = formatoSalida(await soportaWebp(), alpha);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, tipo, COMPRESS[kind].quality));
    if (!blob || (!recortado && blob.size >= file.size)) return sinCambio;
    const nuevo = new File([blob], renombrar(file.name, tipo), { type: tipo });
    const nota = recortado
      ? `Logo ajustado: se quitaron los márgenes vacíos (${peso(file.size)} → ${peso(nuevo.size)})`
      : `Foto optimizada: ${peso(file.size)} → ${peso(nuevo.size)}`;
    return { file: nuevo, antes: file.size, despues: nuevo.size, nota };
  } catch {
    return sinCambio;
  }
}
