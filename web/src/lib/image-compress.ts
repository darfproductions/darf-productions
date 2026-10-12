"use client";

import { COMPRESS, destino, formatoSalida, hayQueComprimir, peso, renombrar, type CompressKind } from "@/lib/image-compress-rules";

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

export async function compressImage(file: File, kind: CompressKind): Promise<Compressed> {
  const sinCambio: Compressed = { file, antes: file.size, despues: file.size, nota: null };
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.type === "image/svg+xml") return sinCambio;
  try {
    const bmp = await createImageBitmap(file);
    if (!hayQueComprimir(kind, { size: file.size, width: bmp.width, height: bmp.height })) { bmp.close(); return sinCambio; }
    const { w, h } = destino(bmp.width, bmp.height, COMPRESS[kind].maxDim);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) { bmp.close(); return sinCambio; }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const alpha = file.type !== "image/jpeg" && tieneTransparencia(ctx, w, h);
    const tipo = formatoSalida(await soportaWebp(), alpha);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, tipo, COMPRESS[kind].quality));
    if (!blob || blob.size >= file.size) return sinCambio;
    const nuevo = new File([blob], renombrar(file.name, tipo), { type: tipo });
    return { file: nuevo, antes: file.size, despues: nuevo.size, nota: `Foto optimizada: ${peso(file.size)} → ${peso(nuevo.size)}` };
  } catch {
    return sinCambio;
  }
}
