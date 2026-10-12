"use client";

import { FRANJAS, iniciales, type Franja } from "@/lib/gafete-rules";
import { pdfConImagenes } from "@/lib/ticket-design";

// Gafete en PDF: se dibuja en un canvas (mismo diseño que GafeteVista) y se guarda como imagen
// dentro de un PDF de 85 × 135 mm aprox. (para imprimir o guardar en el teléfono).

const W = 680, H = 1080;

function cargar(src: string, cors: boolean): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const img = new Image();
    if (cors) img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });
}

export type GafeteDatos = { nombre: string; fotoUrl: string | null; franja: Franja; papel: string; obra: string | null; temporada: string | null; qr: string; codigo: string };

export async function descargarGafete(g: GafeteDatos): Promise<void> {
  const fuente = getComputedStyle(document.body).fontFamily || "sans-serif";
  const [mono, foto, qr] = await Promise.all([cargar("/marca/darf-monograma.svg", false), g.fotoUrl ? cargar(g.fotoUrl, true) : Promise.resolve(null), cargar(g.qr, false)]);
  const pintar = (conFoto: boolean) => {
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const x = c.getContext("2d")!;
    x.fillStyle = "#0b0910"; x.fillRect(0, 0, W, H);
    x.fillStyle = "#211a2c"; x.beginPath(); x.roundRect(W / 2 - 96, 30, 192, 40, 20); x.fill();
    if (mono) { const h = 112, w = (mono.width / mono.height) * h; x.drawImage(mono, (W - w) / 2, 100, w, h); }
    // Foto redonda
    const cx = W / 2, cy = 330, r = 104;
    x.save(); x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.closePath(); x.fillStyle = "#211a2c"; x.fill(); x.clip();
    if (conFoto && foto) {
      const k = Math.max((2 * r) / foto.width, (2 * r) / foto.height);
      x.drawImage(foto, cx - (foto.width * k) / 2, cy - (foto.height * k) / 2, foto.width * k, foto.height * k);
    } else {
      x.fillStyle = "#a39db0"; x.font = `900 72px ${fuente}`; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(iniciales(g.nombre), cx, cy + 4);
    }
    x.restore();
    x.textAlign = "center"; x.textBaseline = "alphabetic";
    x.fillStyle = "#f4f1f8"; x.font = `900 44px ${fuente}`;
    const palabras = g.nombre.toUpperCase().split(/\s+/);
    const l1 = palabras.slice(0, Math.ceil(palabras.length / 2)).join(" "), l2 = palabras.slice(Math.ceil(palabras.length / 2)).join(" ");
    x.fillText(l1, W / 2, 500); if (l2) x.fillText(l2, W / 2, 548);
    x.fillStyle = "#d7bb5f"; x.font = `700 22px ${fuente}`; x.fillText(g.papel.toUpperCase().split("").join(String.fromCharCode(8202)), W / 2, l2 ? 592 : 548);
    // QR
    const q = 260, qx = (W - q) / 2, qy = 620;
    x.fillStyle = "#ffffff"; x.beginPath(); x.roundRect(qx - 16, qy - 16, q + 32, q + 32, 24); x.fill();
    if (qr) { x.imageSmoothingEnabled = false; x.drawImage(qr, qx, qy, q, q); x.imageSmoothingEnabled = true; }
    x.fillStyle = "#d3cddd"; x.font = `700 24px monospace`; x.fillText(g.codigo, W / 2, qy + q + 52);
    x.fillStyle = "#a39db0"; x.font = `600 18px ${fuente}`;
    x.fillText([g.obra, g.temporada ? `Temporada ${g.temporada}` : null].filter(Boolean).join(" · ").toUpperCase() || "DARF PRODUCTIONS", W / 2, qy + q + 84);
    // Franja
    const f = FRANJAS[g.franja];
    if (f.fondo.startsWith("linear")) {
      const gr = x.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, "#340feb"); gr.addColorStop(0.55, "#830886"); gr.addColorStop(1, "#d20122"); x.fillStyle = gr;
    } else x.fillStyle = f.fondo;
    x.fillRect(0, H - 96, W, 96);
    x.fillStyle = f.texto; x.font = `italic 900 46px ${fuente}`; x.fillText(f.label, W / 2, H - 32);
    return c;
  };
  const jpeg = async (c: HTMLCanvasElement) => new Uint8Array(await (await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("canvas"))), "image/jpeg", 0.92))).arrayBuffer());
  let data: Uint8Array;
  try { data = await jpeg(pintar(true)); } catch { data = await jpeg(pintar(false)); } // foto sin permiso de lectura: iniciales
  const pdf = pdfConImagenes([{ data, w: W, h: H }], 241, 383);
  const url = URL.createObjectURL(new Blob([pdf as BlobPart], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url; a.download = `gafete-darf-${g.codigo}.pdf`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
