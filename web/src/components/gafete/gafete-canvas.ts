"use client";

import { iniciales, type PaseVista } from "@/lib/gafete-rules";
import { pdfConImagenes } from "@/lib/ticket-design";

// Gafete o credencial del Club Fan en PDF: se dibuja en un canvas (mismo diseño que GafeteVista)
// y se guarda como imagen dentro de un PDF de 85 × 135 mm aprox. (para imprimir o el teléfono).

const W = 680, H = 1080;
const ORO = "#d7bb5f";

function cargar(src: string, cors: boolean): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const img = new Image();
    if (cors) img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });
}

export async function descargarPase(p: PaseVista, archivo: string): Promise<void> {
  const fan = p.tema === "fan";
  const fuente = getComputedStyle(document.body).fontFamily || "sans-serif";
  const [logo, foto, qr, sello] = await Promise.all([
    cargar(p.logo, false), p.fotoUrl ? cargar(p.fotoUrl, true) : Promise.resolve(null),
    p.qr ? cargar(p.qr, false) : Promise.resolve(null),
    p.casa ? cargar("/marca/sello-casa.svg", false) : fan || p.sello ? cargar("/marca/sello-club.svg", false) : Promise.resolve(null),
  ]);
  const pintar = (conFoto: boolean) => {
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const x = c.getContext("2d")!;
    x.fillStyle = "#0b0910"; x.fillRect(0, 0, W, H);
    if (fan) {
      const g = x.createRadialGradient(W / 2, 0, 20, W / 2, 0, 620);
      g.addColorStop(0, "rgba(215,187,95,0.32)"); g.addColorStop(1, "rgba(215,187,95,0)");
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      x.strokeStyle = "rgba(215,187,95,0.6)"; x.lineWidth = 4; x.strokeRect(2, 2, W - 4, H - 4);
    }
    // Logo arriba (sin la ranura); si es socio, el sello al lado y del mismo alto (0087).
    if (logo) {
      const maxH = fan ? 80 : 112, hueco = 24;
      const conSello = !!sello;
      const maxW = conSello ? (fan ? 360 : 300) : fan ? 440 : 400;
      const k = Math.min(maxW / logo.width, maxH / logo.height);
      const lw = logo.width * k, lh = logo.height * k;
      const total = lw + (conSello ? hueco + lh : 0);
      const x0 = (W - total) / 2, y0 = 60 + (112 - lh) / 2;
      x.drawImage(logo, x0, y0, lw, lh);
      if (sello) x.drawImage(sello, x0 + lw + hueco, y0, lh, lh);
    }
    // Foto redonda
    const cx = W / 2, cy = 330, r = 104;
    x.save(); x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.closePath(); x.fillStyle = "#211a2c"; x.fill(); x.clip();
    if (conFoto && foto) {
      const k = Math.max((2 * r) / foto.width, (2 * r) / foto.height);
      x.drawImage(foto, cx - (foto.width * k) / 2, cy - (foto.height * k) / 2, foto.width * k, foto.height * k);
    } else {
      x.fillStyle = fan ? "#ecd9a0" : "#a39db0"; x.font = `900 72px ${fuente}`; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(iniciales(p.nombre), cx, cy + 4);
    }
    x.restore();
    if (fan) { x.strokeStyle = ORO; x.lineWidth = 5; x.beginPath(); x.arc(cx, cy, r + 3, 0, Math.PI * 2); x.stroke(); }
    x.textAlign = "center"; x.textBaseline = "alphabetic";
    x.fillStyle = "#f4f1f8"; x.font = `900 44px ${fuente}`;
    const palabras = p.nombre.toUpperCase().split(/\s+/);
    const l1 = palabras.slice(0, Math.ceil(palabras.length / 2)).join(" "), l2 = palabras.slice(Math.ceil(palabras.length / 2)).join(" ");
    x.fillText(l1, W / 2, 500); if (l2) x.fillText(l2, W / 2, 548);
    x.fillStyle = ORO; x.font = `700 22px ${fuente}`; x.fillText(p.titulo.toUpperCase().split("").join(String.fromCharCode(8202)), W / 2, l2 ? 592 : 548);
    // QR
    const q = 260, qx = (W - q) / 2, qy = 620;
    if (qr) {
      x.fillStyle = "#ffffff"; x.beginPath(); x.roundRect(qx - 16, qy - 16, q + 32, q + 32, 24); x.fill();
      x.imageSmoothingEnabled = false; x.drawImage(qr, qx, qy, q, q); x.imageSmoothingEnabled = true;
    }
    if (p.codigo) { x.fillStyle = fan ? "#ecd9a0" : "#d3cddd"; x.font = `700 24px monospace`; x.fillText(p.codigo, W / 2, qy + q + 52); }
    x.fillStyle = "#a39db0"; x.font = `600 18px ${fuente}`;
    if (p.casa) {
      // Casa DARF (0102): la línea en los colores holográficos.
      const t = p.casa.toUpperCase(), wt = x.measureText(t).width;
      const gr = x.createLinearGradient((W - wt) / 2, 0, (W + wt) / 2, 0);
      ["#ffb8ec", "#c9b2ff", "#9fe2ff", "#b9ffe0", "#ffe6a8"].forEach((col, i) => gr.addColorStop(i / 4, col));
      x.fillStyle = gr; x.font = `700 18px ${fuente}`; x.fillText(t, W / 2, qy + q + 84);
      x.fillStyle = "#a39db0"; x.font = `600 18px ${fuente}`;
    } else if (p.sello) {
      // Equipo y socio: "DARF PRODUCTIONS · 2026 · " en gris y "CLUB FAN · SOCIO #0001" en oro.
      const a = `${p.pie.toUpperCase()} · `, b = `CLUB FAN · ${p.sello.toUpperCase()}`;
      const wa = x.measureText(a).width, wb = x.measureText(b).width, x0 = (W - wa - wb) / 2;
      x.textAlign = "left"; x.fillText(a, x0, qy + q + 84);
      x.fillStyle = ORO; x.font = `700 18px ${fuente}`; x.fillText(b, x0 + wa, qy + q + 84); x.textAlign = "center";
    } else x.fillText(p.pie.toUpperCase(), W / 2, qy + q + 84);
    // Banda
    if (p.banda.degradado) {
      const gr = x.createLinearGradient(0, 0, W, 0);
      for (const [o, col] of p.banda.degradado) gr.addColorStop(o, col);
      x.fillStyle = gr;
    } else x.fillStyle = p.banda.fondo;
    x.fillRect(0, H - 96, W, 96);
    x.fillStyle = p.banda.texto; x.font = `italic 900 46px ${fuente}`;
    x.fillText(p.banda.label, W / 2, H - 32);
    return c;
  };
  const jpeg = async (c: HTMLCanvasElement) => new Uint8Array(await (await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("canvas"))), "image/jpeg", 0.92))).arrayBuffer());
  let data: Uint8Array;
  try { data = await jpeg(pintar(true)); } catch { data = await jpeg(pintar(false)); } // foto sin permiso de lectura: iniciales
  const pdf = pdfConImagenes([{ data, w: W, h: H }], 241, 383);
  const url = URL.createObjectURL(new Blob([pdf as BlobPart], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url; a.download = archivo; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
