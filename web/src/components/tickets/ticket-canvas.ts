"use client";

import { contador, logoDarf, nombreArchivo, pdfConImagenes, type BoletoVista, type EstiloBoleto, type JpegPagina } from "@/lib/ticket-design";

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

function dibujar(ctx: CanvasRenderingContext2D, b: BoletoVista, e: EstiloBoleto, logo: HTMLImageElement | null, darf: HTMLImageElement | null, qr: HTMLImageElement | null, i: number, total: number, fuente: string, poster: HTMLImageElement | null = null) {
  ctx.fillStyle = e.fondo;
  ctx.fillRect(0, 0, W, H);

  // Póster oficial (0093) de fondo arriba, velado con el color de la obra.
  if (poster) {
    const alto = 470, r = Math.max(W / poster.width, alto / poster.height);
    const pw = poster.width * r, ph = poster.height * r;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, alto); ctx.clip();
    ctx.drawImage(poster, (W - pw) / 2, (alto - ph) / 2, pw, ph);
    ctx.restore();
    ctx.globalAlpha = 0.55; ctx.fillStyle = e.fondo; ctx.fillRect(0, 0, W, alto); ctx.globalAlpha = 1;
    if (/^#[0-9a-f]{6}$/i.test(e.fondo)) {
      const g = ctx.createLinearGradient(0, 300, 0, alto);
      g.addColorStop(0, `${e.fondo}00`); g.addColorStop(1, e.fondo);
      ctx.fillStyle = g; ctx.fillRect(0, 300, W, alto - 300);
    }
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // Logo de DARF arriba (kit de marca)
  if (darf) {
    const dh = 56, dw = (darf.width / darf.height) * dh;
    ctx.drawImage(darf, (W - dw) / 2, 32, dw, dh);
  }

  // Logo de la obra (o su nombre)
  if (logo) {
    const bw = 560, bh = 210;
    const k = Math.min(bw / logo.width, bh / logo.height);
    const lw = logo.width * k, lh = logo.height * k;
    ctx.drawImage(logo, (W - lw) / 2, 104 + (bh - lh) / 2, lw, lh);
  } else {
    ctx.fillStyle = e.texto;
    ctx.font = `900 60px ${fuente}`;
    lineas(ctx, b.obra, 600).slice(0, 3).forEach((l, k) => ctx.fillText(l, W / 2, 170 + k * 66));
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
  // 0122: lo que incluye la zona, en renglones que caben (máx. 2; si no cabe, termina en "…").
  let fin = 590;
  if (b.incluye?.length) {
    ctx.fillStyle = e.acento; ctx.font = `700 21px ${fuente}`;
    const ls = lineas(ctx, `Incluye: ${b.incluye.join(" · ")}${b.acceso ? ` · ${b.acceso}` : ""}`, W - 96);
    const dos = ls.slice(0, 2);
    if (ls.length > 2) {
      let u = dos[1];
      while (u.length > 1 && ctx.measureText(`${u}…`).width > W - 96) u = u.slice(0, -1);
      dos[1] = `${u.trimEnd()}…`;
    }
    dos.forEach((l, k) => ctx.fillText(l, 48, 628 + k * 28));
    fin = 628 + (dos.length - 1) * 28;
  }
  const yEt = b.incluye?.length ? fin + 46 : 650, yVal = yEt + 40;
  etiqueta("Orden", 48, yEt);
  etiqueta("Nombre", 380, yEt);
  ctx.fillStyle = e.texto; ctx.font = `700 30px ${fuente}`;
  ctx.fillText(b.orden, 48, yVal);
  let nombre = b.comprador;
  while (nombre.length > 1 && ctx.measureText(nombre).width > W - 380 - 48) nombre = nombre.slice(0, -1);
  ctx.fillText(nombre === b.comprador ? nombre : `${nombre.trimEnd()}…`, 380, yVal);

  // QR (se recorre hacia abajo si arriba hay renglones de "Incluye", sin tapar el pie)
  const qy = Math.max(722, yVal + 32), qs = Math.min(480, H - 120 - qy), qx = (W - qs) / 2;
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
  let poster = estilo.poster ? await cargar(estilo.poster, true) : null;
  const darf = await cargar(logoDarf(estilo.fondo), false); // mismo origen
  const paginas: JpegPagina[] = [];
  for (let i = 0; i < boletos.length; i++) {
    const b = boletos[i];
    const qr = b.qr ? await cargar(b.qr, false) : null;
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas no disponible.");
    dibujar(ctx, b, estilo, logo, darf, qr, i, boletos.length, fuente, poster);
    let data: Uint8Array;
    try {
      data = await jpeg(canvas);
    } catch {
      // Si el logo o el póster no se pudieron usar (permiso del servidor de imágenes), sin ellos.
      logo = null;
      poster = null;
      dibujar(ctx, b, estilo, null, darf, qr, i, boletos.length, fuente);
      data = await jpeg(canvas);
    }
    paginas.push({ data, w: W, h: H });
  }
  return pdfConImagenes(paginas, W / 2, H / 2);
}

/** Cada boleto como imagen (data URL PNG, 720 × 1280): la app la muestra en pantalla completa con el mismo diseño
 *  que el PDF. Si el logo o el póster no se pueden usar, sin ellos. */
export async function imagenesBoletos(boletos: BoletoVista[], estilo: EstiloBoleto): Promise<string[]> {
  const fuente = getComputedStyle(document.body).fontFamily || "sans-serif";
  const [logo, poster, darf] = await Promise.all([
    estilo.logo ? cargar(estilo.logo, true) : null, estilo.poster ? cargar(estilo.poster, true) : null, cargar(logoDarf(estilo.fondo), false),
  ]);
  const out: string[] = [];
  for (let i = 0; i < boletos.length; i++) {
    const b = boletos[i];
    const qr = b.qr ? await cargar(b.qr, false) : null;
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas no disponible.");
    dibujar(ctx, b, estilo, logo, darf, qr, i, boletos.length, fuente, poster);
    try { out.push(canvas.toDataURL("image/png")); } catch {
      dibujar(ctx, b, estilo, null, darf, qr, i, boletos.length, fuente);
      out.push(canvas.toDataURL("image/png"));
    }
  }
  return out;
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
