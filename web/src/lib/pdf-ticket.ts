import QRCode from "qrcode";

// Boletos en PDF (Fase 4B) sin librerías nuevas: un PDF 1.4 escrito a mano, una página por
// boleto, texto en Helvetica (WinAnsi, con acentos) y el QR dibujado como cuadros vectoriales.

export type PdfTicket = {
  obra: string;
  funcion: string; // "sábado 12 de octubre, 8:00 p.m."
  lugar: string | null;
  asiento: string;
  orden: string;
  comprador: string;
  qr: string; // qr_token
  /** 0122: "Acceso anticipado (15 min antes) · Póster firmado · Puertas para ti: 7:45 p.m." */
  incluye?: string | null;
  /** 0127: "Puertas 7:30 p.m." y la dirección del teatro. */
  puertas?: string | null;
  direccion?: string | null;
  /** Diseño nuevo (2026-10-26): inicio ISO, zona, fila/asiento y cada beneficio por separado. */
  inicio?: string | null;
  zona?: string | null;
  fila?: string | null;
  numero?: number | null;
  incluyeLista?: string[];
};

/** Colores, logo y fondo de la obra para el boleto bonito (boleto-diseno.tsx). */
export type BoletoVisual = { colores: { fondo: string; superficie: string; texto: string; acento: string }; logoUrl: string | null; fondoUrl: string | null };

/** Tamaño de la imagen del boleto (px, 3 por punto del PDF) y el hueco del QR en ella. */
export const BOLETO = { w: 1080, h: 1800, qr: { x: 100, y: 1290, size: 400 } } as const;

/** El QR del boleto bonito, en vectores sobre su hueco (coordenadas del PDF: origen abajo a la izquierda). */
export function qrBoleto(token: string): string {
  const k = W / BOLETO.w;
  const { x, y, size } = BOLETO.qr;
  return qrPath(token, x * k, H - (y + size) * k, size * k);
}

const W = 360; // ancho de página (pt)
const H = 600; // alto

/** Texto seguro para un string de PDF en WinAnsi: sin caracteres fuera de Latin-1. */
export function pdfText(s: string): string {
  const latin = s
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7e\xa0-\xff]/g, "");
  return latin.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/** Corta un texto en líneas de hasta n caracteres (aprox. para Helvetica). */
export function wrap(s: string, n: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const w of s.split(/\s+/).filter(Boolean)) {
    if ((line + " " + w).trim().length > n && line) { out.push(line); line = w; }
    else line = (line + " " + w).trim();
  }
  if (line) out.push(line);
  return out.length ? out : [""];
}

function qrPath(token: string, x: number, y: number, size: number): string {
  const q = QRCode.create(token, { errorCorrectionLevel: "M" });
  const n = q.modules.size;
  const quiet = 2;
  const cell = size / (n + quiet * 2);
  const parts: string[] = ["1 1 1 rg", `${x} ${y} ${size} ${size} re f`, "0 0 0 rg"];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (q.modules.get(r, c)) {
        const px = x + (c + quiet) * cell;
        const py = y + size - (r + quiet + 1) * cell;
        parts.push(`${px.toFixed(2)} ${py.toFixed(2)} ${cell.toFixed(3)} ${cell.toFixed(3)} re`);
      }
    }
  }
  parts.push("f");
  return parts.join("\n");
}

export function text(x: number, y: number, size: number, s: string, bold = false): string {
  return `BT /${bold ? "F2" : "F1"} ${size} Tf ${x} ${y} Td (${pdfText(s)}) Tj ET`;
}

function pageContent(t: PdfTicket): string {
  const ops: string[] = [];
  // Encabezado oscuro
  ops.push("0.043 0.035 0.063 rg", `0 ${H - 120} ${W} 120 re f`);
  ops.push("1 1 1 rg", text(24, H - 40, 9, "DARF PRODUCTIONS · BOLETO", true));
  let y = H - 68;
  for (const l of wrap(t.obra, 26).slice(0, 2)) { ops.push(text(24, y, 20, l, true)); y -= 24; }
  ops.push("0 0 0 rg");
  y = H - 150;
  const row = (k: string, v: string) => {
    ops.push("0.45 0.45 0.45 rg", text(24, y, 8, k.toUpperCase(), true), "0 0 0 rg");
    y -= 15;
    for (const l of wrap(v, 44).slice(0, k === "Incluye" ? 3 : 2)) { ops.push(text(24, y, 12, l)); y -= 15; }
    y -= 6;
  };
  row("Función", t.puertas ? `${t.funcion} · ${t.puertas}` : t.funcion);
  if (t.lugar || t.direccion) row("Lugar", [t.lugar, t.direccion].filter(Boolean).join(" · "));
  row("Asiento", t.asiento);
  row("Orden", `${t.orden} · ${t.comprador}`);
  if (t.incluye) row("Incluye", t.incluye);
  // Con "Incluye" el QR se hace un poco más chico para que quepa todo.
  const q = t.incluye ? 150 : 220;
  ops.push(qrPath(t.qr, (W - q) / 2, 60, q));
  ops.push("0.45 0.45 0.45 rg", text(24, 44, 9, "Presenta este código en la entrada. Cada código vale una sola vez."));
  return ops.join("\n");
}

/** Página del PDF: sus trazos y, si hay, una imagen JPEG de fondo a página completa. */
export type PaginaPdf = string | { content: string; imagen?: Buffer };

/** PDF 1.4 con Helvetica y Helvetica-Bold (F1/F2): una página por contenido. */
export function buildPdf(paginas: PaginaPdf[], w = W, h = H): Uint8Array {
  const objs: string[] = [];
  const add = (s: string) => { objs.push(s); return objs.length; };
  const catalog = add(""); // 1
  const pages = add(""); // 2
  const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const kids: number[] = [];
  for (const pg of paginas) {
    const { content, imagen } = typeof pg === "string" ? { content: pg, imagen: undefined } : pg;
    let xobj = "";
    let fondo = "";
    if (imagen) {
      const { ancho, alto } = medidasJpeg(imagen);
      const im = add(`<< /Type /XObject /Subtype /Image /Width ${ancho} /Height ${alto} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imagen.length} >>\nstream\n${imagen.toString("latin1")}\nendstream`);
      xobj = ` /XObject << /Im1 ${im} 0 R >>`;
      fondo = `q ${w} 0 0 ${h} 0 0 cm /Im1 Do Q\n`;
    }
    const todo = fondo + content;
    const c = add(`<< /Length ${Buffer.byteLength(todo, "latin1")} >>\nstream\n${todo}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >>${xobj} >> /Contents ${c} 0 R >>`));
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pages} 0 R >>`;
  objs[pages - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;

  let out = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, "latin1"));
}

/** Ancho y alto de un JPEG (marcador SOF). */
export function medidasJpeg(b: Buffer): { ancho: number; alto: number } {
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { alto: b.readUInt16BE(i + 5), ancho: b.readUInt16BE(i + 7) };
    i += 2 + b.readUInt16BE(i + 2);
  }
  throw new Error("JPEG sin medidas");
}

/** Arma el PDF con una página por boleto. */
export function ticketsPdf(tickets: PdfTicket[]): Uint8Array {
  return buildPdf(tickets.map(pageContent));
}
