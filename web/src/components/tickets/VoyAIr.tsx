"use client";

import QRCode from "qrcode";
import { useState } from "react";
import { Icono } from "@/components/Icono";
import { logoDarf } from "@/lib/ticket-design";

type Props = {
  obra: string; funcion: string; lugar: string | null; ambiente: string | null; logo: string | null;
  /** Colores del kit de la obra (cada obra se ve con los suyos). */
  fondo: string; superficie: string; texto: string; acento: string;
  /** Póster oficial limpio (0093) para "Voy a ir": 9:16 o, si no hay, 3:4. Los logos y textos los pone esta imagen. */
  poster?: string | null;
  /** Página de la obra (o el sitio si la obra no es pública): va en el QR de "Compra también tus boletos". */
  liga: string;
};

const W = 1080;
const H = 1920;

function cargar(src: string): Promise<HTMLImageElement | null> {
  return new Promise((ok) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => ok(img);
    img.onerror = () => ok(null);
    img.src = src;
  });
}

function cubrir(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const r = Math.max(w / img.width, h / img.height);
  const iw = img.width * r, ih = img.height * r;
  // Recorta a su área: si no, la imagen se sale y deja una franja detrás de los textos.
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
  ctx.restore();
}

/** Corta un texto en renglones que quepan en `ancho`. */
function renglones(ctx: CanvasRenderingContext2D, s: string, ancho: number): string[] {
  const out: string[] = [];
  let linea = "";
  for (const p of s.split(" ")) {
    const prueba = linea ? `${linea} ${p}` : p;
    if (ctx.measureText(prueba).width > ancho && linea) { out.push(linea); linea = p; } else linea = prueba;
  }
  if (linea) out.push(linea);
  return out;
}

/** Rectángulo con esquinas redondas. */
function caja(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** "darfproductions.com/producciones/showman" (sin https ni www). */
const ligaCorta = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");

async function dibujar(p: Props): Promise<Blob | null> {
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = p.fondo; ctx.fillRect(0, 0, W, H);
  const qrUrl = QRCode.toDataURL(p.liga, { margin: 1, width: 440, errorCorrectionLevel: "M", color: { dark: "#0b0910", light: "#ffffff" } });
  const [pst, darf, qr] = await Promise.all([p.poster ? cargar(p.poster) : null, cargar(logoDarf(p.fondo)), qrUrl.then(cargar)]);
  const [img, logo] = await Promise.all([pst ?? (p.ambiente ? cargar(p.ambiente) : null), p.logo ? cargar(p.logo) : null]);

  // Primero se mide lo de abajo (textos y tarjeta) para que todo quede junto, sin huecos: la imagen
  // de la obra crece para llenar lo que sobra arriba.
  const CARD = 270, GAP = 70, MARGEN = 60;
  let bloque = 40 + 40; // "¡VOY A IR!" + aire
  if (logo) bloque += (Math.min(820, (logo.width / logo.height) * 170) / logo.width) * logo.height + 70;
  else { ctx.font = "800 80px Montserrat, Arial, sans-serif"; bloque += renglones(ctx, p.obra, 900).length * 84 + 70; }
  ctx.font = "700 50px Montserrat, Arial, sans-serif";
  bloque += renglones(ctx, p.funcion, 940).length * 62 - 62;
  if (p.lugar) bloque += 60;
  const alto = Math.max(900, Math.min(1250, H - MARGEN - CARD - GAP - bloque));
  // Imagen de la obra arriba, fundida con el color de la obra.
  if (img) {
    cubrir(ctx, img, 0, 0, W, alto);
    const g = ctx.createLinearGradient(0, alto - 420, 0, alto);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, p.fondo);
    ctx.fillStyle = g; ctx.fillRect(0, alto - 420, W, 420);
    const arriba = ctx.createLinearGradient(0, 0, 0, 260);
    arriba.addColorStop(0, "rgba(0,0,0,0.55)"); arriba.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = arriba; ctx.fillRect(0, 0, W, 260);
  }
  // Logo de DARF arriba (sobre la imagen va el blanco).
  const darfArriba = img ? await cargar(logoDarf("#000000")) : darf;
  if (darfArriba) ctx.drawImage(darfArriba, (W - 260) / 2, 60, 260, (260 / darfArriba.width) * darfArriba.height);

  ctx.textAlign = "center";
  ctx.fillStyle = p.acento;
  ctx.font = "900 120px Montserrat, Arial, sans-serif";
  let y = alto + 40;
  ctx.fillText("¡VOY A IR!", W / 2, y);
  y += 40;
  if (logo) {
    const h = 170, ancho = Math.min(820, (logo.width / logo.height) * h);
    const hReal = (ancho / logo.width) * logo.height;
    ctx.drawImage(logo, (W - ancho) / 2, y, ancho, hReal);
    y += hReal + 70;
  } else {
    ctx.fillStyle = p.texto; ctx.font = "800 80px Montserrat, Arial, sans-serif";
    for (const l of renglones(ctx, p.obra, 900)) { y += 84; ctx.fillText(l, W / 2, y); }
    y += 70;
  }
  ctx.fillStyle = p.texto;
  ctx.font = "700 50px Montserrat, Arial, sans-serif";
  for (const l of renglones(ctx, p.funcion, 940)) { ctx.fillText(l, W / 2, y); y += 62; }
  y -= 62;
  if (p.lugar) { y += 60; ctx.font = "500 40px Montserrat, Arial, sans-serif"; ctx.globalAlpha = 0.85; ctx.fillText(p.lugar, W / 2, y); ctx.globalAlpha = 1; }

  // Tarjeta de abajo: "¡Compra también tus boletos!" con el QR a la página de la obra.
  // Justo debajo del texto; si la imagen llegó a su tope, el aire que sobra queda abajo.
  const cx = 70, cy = Math.min(y + GAP, H - MARGEN - CARD), cw = W - 140, ch = CARD;
  ctx.fillStyle = p.superficie; caja(ctx, cx, cy, cw, ch, 36); ctx.fill();
  ctx.strokeStyle = p.acento; ctx.globalAlpha = 0.6; ctx.lineWidth = 3; caja(ctx, cx, cy, cw, ch, 36); ctx.stroke(); ctx.globalAlpha = 1;
  const lado = 210, qx = cx + 30, qy = cy + 30;
  ctx.fillStyle = "#ffffff"; caja(ctx, qx, qy, lado, lado, 20); ctx.fill();
  if (qr) ctx.drawImage(qr, qx + 10, qy + 10, lado - 20, lado - 20);
  ctx.textAlign = "left";
  const tx = qx + lado + 40, tw = cx + cw - 30 - tx;
  ctx.fillStyle = p.acento; ctx.font = "900 50px Montserrat, Arial, sans-serif";
  let ty = cy + 92;
  for (const l of renglones(ctx, "¡Compra también tus boletos!", tw)) { ctx.fillText(l, tx, ty); ty += 58; }
  ctx.fillStyle = p.texto; ctx.globalAlpha = 0.85;
  let t = 32;
  const corta = ligaCorta(p.liga);
  do { ctx.font = `600 ${t}px Montserrat, Arial, sans-serif`; t -= 2; } while (ctx.measureText(corta).width > tw && t > 20);
  ctx.fillText(corta, tx, ty + 6);
  ctx.globalAlpha = 1;
  return new Promise((ok) => c.toBlob((b) => ok(b), "image/png"));
}

// "Voy a ir" (Bloque 4B): imagen vertical para historias de Instagram o estados de WhatsApp con la
// imagen y los colores de la obra, la fecha, y un QR para que quien la vea compre sus boletos
// (Diego 2026-10-14). Se arma en el teléfono, sin datos personales ni el QR del boleto.
export function VoyAIr(p: Props) {
  const [estado, setEstado] = useState<"" | "armando" | "listo" | "error">("");
  const [url, setUrl] = useState<string | null>(null);
  async function crear() {
    setEstado("armando");
    try {
      await document.fonts?.ready;
      const blob = await dibujar(p);
      if (!blob) throw new Error("sin imagen");
      const archivo = new File([blob], "voy-a-ir-darf.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [archivo] })) {
        await navigator.share({ files: [archivo], title: p.obra, text: `¡Voy a ir a ${p.obra}! Compra tus boletos: ${p.liga}` }).catch(() => {});
        setEstado("listo");
        return;
      }
      setUrl(URL.createObjectURL(blob));
      setEstado("listo");
    } catch {
      setEstado("error");
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={crear} disabled={estado === "armando"} className="inline-flex min-h-11 items-center gap-2 self-start rounded-full border border-white/25 px-4 py-2 text-sm font-bold hover:border-white/50 disabled:opacity-60">
        <Icono nombre="camara" />
        {estado === "armando" ? "Armando tu imagen…" : "“Voy a ir” para mis historias"}
      </button>
      {url && <a href={url} download="voy-a-ir-darf.png" className="inline-flex items-center gap-2 text-sm font-bold text-violeta-claro underline"><Icono nombre="descargar" /> Descargar la imagen</a>}
      {estado === "error" && <p className="text-sm text-texto-3">No se pudo armar la imagen en este navegador.</p>}
    </div>
  );
}
