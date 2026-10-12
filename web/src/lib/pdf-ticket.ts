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
};

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
    for (const l of wrap(v, 44).slice(0, 2)) { ops.push(text(24, y, 12, l)); y -= 15; }
    y -= 6;
  };
  row("Función", t.funcion);
  if (t.lugar) row("Lugar", t.lugar);
  row("Asiento", t.asiento);
  row("Orden", `${t.orden} · ${t.comprador}`);
  ops.push(qrPath(t.qr, (W - 220) / 2, 70, 220));
  ops.push("0.45 0.45 0.45 rg", text(24, 44, 9, "Presenta este código en la entrada. Cada código vale una sola vez."));
  return ops.join("\n");
}

/** PDF 1.4 con Helvetica y Helvetica-Bold (F1/F2): una página por contenido. */
export function buildPdf(contents: string[], w = W, h = H): Uint8Array {
  const objs: string[] = [];
  const add = (s: string) => { objs.push(s); return objs.length; };
  const catalog = add(""); // 1
  const pages = add(""); // 2
  const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const kids: number[] = [];
  for (const content of contents) {
    const c = add(`<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${c} 0 R >>`));
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

/** Arma el PDF con una página por boleto. */
export function ticketsPdf(tickets: PdfTicket[]): Uint8Array {
  return buildPdf(tickets.map(pageContent));
}
