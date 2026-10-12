"use client";

import { contador, nombreArchivo, pdfConImagenes, type BoletoVista, type EstiloBoleto, type JpegPagina } from "@/lib/ticket-design";

// Dibuja el boleto diseñado en un canvas (mismo diseño que TicketCard) y arma el PDF con
// una página por boleto. Todo en el navegador; si algo falla, queda el PDF del servidor.

const W = 720; // px (2× de 360 pt)
const H = 1280; // px (2× de 640 pt)

function cargar(src: string, cors: boolean): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const img = new Image();
    if (cors) img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });
}

function lineas(ctx: CanvasRenderingContext2D, texto: string, ancho: number): string[] {
  const out: string[] = [];
  let l = "";
  for (const w of texto.split(/\s+/).filter(Boolean)) {
    const t = l ? `${l} ${w}` : w;
    if (ctx.measureText(t).width > ancho && l) { out.push(l); l = w; } else l = t;
  }
  if (l) out.push(l);
  return out;
}

const mayus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function dibujar(ctx: CanvasRenderingContext2D, b: BoletoVista, e: EstiloBoleto, logo: HTMLImageElement | null, qr: HTMLImageElement | null, i: number, total: number, fuente: string) {
  ctx.fillStyle = e.fondo;
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // Logo (o el nombre de la obra)
  if (logo) {
    const bw = 560, bh = 250;
    const k = Math.min(bw / logo.width, bh / logo.height);
    const lw = logo.width * k, lh = logo.height * k;
    ctx.drawImage(logo, (W - lw) / 2, 40 + (bh - lh) / 2, lw, lh);
  } else {
    ctx.fillStyle = e.texto;
    ctx.font = `900 64px ${fuente}`;
    lineas(ctx, b.obra, 600).slice(0, 3).forEach((l, k) => ctx.fillText(l, W / 2, 140 + k * 72));
  }

  // Función y lugar
  ctx.fillStyle = e.texto;
  ctx.font = `700 34px ${fuente}`;
  lineas(ctx, mayus(b.funcion), 640).slice(0, 2).forEach((l, k) => ctx.fillText(l, W / 2, 352 + k * 42));
  if (b.lugar) {
    ctx.globalAlpha = 0.8;
    ctx.font = `400 28px ${fuente}`;
    ctx.fillText(b.lugar.slice(0, 60), W / 2, 436);
    ctx.globalAlpha = 1;
  }

  // Línea punteada
  ctx.strokeStyle = e.acento;
  ctx.lineWidth = 4;
  ctx.setLineDash([16, 12]);
  ctx.beginPath(); ctx.moveTo(0, 470); ctx.lineTo(W, 470); ctx.stroke();
  ctx.setLineDash([]);

  // Datos
  ctx.textAlign = "left";
  const etiqueta = (t: string, x: number, y: number) => { ctx.fillStyle = e.acento; ctx.font = `700 22px ${fuente}`; ctx.fillText(t.toUpperCase(), x, y); };
  etiqueta("Asiento", 48, 524);
  ctx.fillStyle = e.texto; ctx.font = `900 60px ${fuente}`;
  ctx.fillText(b.asiento.slice(0, 22), 48, 590);
  etiqueta("Orden", 48, 650);
  etiqueta("Nombre", 380, 650);
  ctx.fillStyle = e.texto; ctx.font = `700 30px ${fuente}`;
  ctx.fillText(b.orden, 48, 690);
  ctx.fillText(b.comprador.length > 18 ? `${b.comprador.slice(0, 17)}…` : b.comprador, 380, 690);

  // QR
  const qs = 480, qx = (W - qs) / 2, qy = 722;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath(); ctx.roundRect(qx, qy, qs, qs, 32); ctx.fill();
  if (qr) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(qr, qx + 24, qy + 24, qs - 48, qs - 48);
    ctx.imageSmoothingEnabled = true;
  }

  // Pie
  ctx.textAlign = "center";
  ctx.fillStyle = e.texto; ctx.globalAlpha = 0.75; ctx.font = `400 22px ${fuente}`;
  lineas(ctx, `${contador(i, total)} · Presenta este código en la entrada. Vale una sola vez.`, 640)
    .slice(0, 2).forEach((l, k) => ctx.fillText(l, W / 2, H - 50 + k * 28));
  ctx.globalAlpha = 1;
}

async function jpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.92));
  if (!blob) throw new Error("No se pudo crear la imagen.");
  return new Uint8Array(await blob.arrayBuffer());
}

/** Arma el PDF con los boletos (una página por boleto). Lanza error si el navegador no puede. */
export async function crearPdf(boletos: BoletoVista[], estilo: EstiloBoleto): Promise<Uint8Array> {
  const fuente = getComputedStyle(document.body).fontFamily || "sans-serif";
  let logo = estilo.logo ? await cargar(estilo.logo, true) : null;
  const paginas: JpegPagina[] = [];
  for (let i = 0; i < boletos.length; i++) {
    const b = boletos[i];
    const qr = b.qr ? await cargar(b.qr, false) : null;
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas no disponible.");
    dibujar(ctx, b, estilo, logo, qr, i, boletos.length, fuente);
    let data: Uint8Array;
    try {
      data = await jpeg(canvas);
    } catch {
      // Si el logo no se pudo usar (permiso del servidor de imágenes), sin logo.
      logo = null;
      dibujar(ctx, b, estilo, null, qr, i, boletos.length, fuente);
      data = await jpeg(canvas);
    }
    paginas.push({ data, w: W, h: H });
  }
  return pdfConImagenes(paginas, W / 2, H / 2);
}

/** Genera y descarga el PDF. */
export async function descargarPdf(boletos: BoletoVista[], estilo: EstiloBoleto, orden: string): Promise<void> {
  const pdf = await crearPdf(boletos, estilo);
  const url = URL.createObjectURL(new Blob([pdf as BlobPart], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo(orden);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
