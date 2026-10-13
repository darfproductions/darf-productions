"use client";

import { useState } from "react";
import { logoDarf } from "@/lib/ticket-design";

type Props = { obra: string; funcion: string; lugar: string | null; ambiente: string | null; logo: string | null; fondo: string; texto: string; acento: string };

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
  ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
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

async function dibujar(p: Props): Promise<Blob | null> {
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = p.fondo; ctx.fillRect(0, 0, W, H);
  const [amb, logo, darf] = await Promise.all([p.ambiente ? cargar(p.ambiente) : null, p.logo ? cargar(p.logo) : null, cargar(logoDarf(p.fondo))]);
  if (amb) {
    cubrir(ctx, amb, 0, 0, W, 1150);
    const g = ctx.createLinearGradient(0, 700, 0, 1150);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, p.fondo);
    ctx.fillStyle = g; ctx.fillRect(0, 700, W, 450);
  }
  ctx.fillStyle = p.acento;
  ctx.font = "900 120px Montserrat, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("¡VOY A IR!", W / 2, 1230);
  let y = 1300;
  if (logo) {
    const alto = 220, ancho = Math.min(860, (logo.width / logo.height) * alto);
    ctx.drawImage(logo, (W - ancho) / 2, y, ancho, (ancho / logo.width) * logo.height);
    y += 270;
  } else {
    ctx.fillStyle = p.texto; ctx.font = "800 84px Montserrat, Arial, sans-serif";
    for (const l of renglones(ctx, p.obra, 900)) { ctx.fillText(l, W / 2, y + 70); y += 96; }
    y += 40;
  }
  ctx.fillStyle = p.texto;
  ctx.font = "700 52px Montserrat, Arial, sans-serif";
  for (const l of renglones(ctx, p.funcion, 940)) { ctx.fillText(l, W / 2, y); y += 64; }
  if (p.lugar) { ctx.font = "500 42px Montserrat, Arial, sans-serif"; ctx.globalAlpha = 0.85; ctx.fillText(p.lugar, W / 2, y + 10); ctx.globalAlpha = 1; }
  if (darf) ctx.drawImage(darf, (W - 300) / 2, H - 230, 300, (300 / darf.width) * darf.height);
  ctx.font = "600 36px Montserrat, Arial, sans-serif"; ctx.fillStyle = p.texto; ctx.globalAlpha = 0.8;
  ctx.fillText("darfproductions.com", W / 2, H - 60); ctx.globalAlpha = 1;
  return new Promise((ok) => c.toBlob((b) => ok(b), "image/png"));
}

// "Voy a ir" (Bloque 4B): imagen vertical para historias de Instagram o estados de WhatsApp con la
// imagen de la obra, la fecha y el logo. Se arma en el teléfono, sin datos personales ni el QR.
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
        await navigator.share({ files: [archivo], title: p.obra, text: `¡Voy a ir a ${p.obra}! 🎭` }).catch(() => {});
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
      <button type="button" onClick={crear} disabled={estado === "armando"} className="self-start rounded-full border border-white/25 px-4 py-2 text-sm font-bold hover:border-white/50 disabled:opacity-60">
        {estado === "armando" ? "Armando tu imagen…" : "📸 “Voy a ir” para mis historias"}
      </button>
      {url && <a href={url} download="voy-a-ir-darf.png" className="text-sm font-bold text-violeta-claro underline">Descargar la imagen</a>}
      {estado === "error" && <p className="text-sm text-texto-3">No se pudo armar la imagen en este navegador.</p>}
    </div>
  );
}
