// Boletos bonitos (Bloque 4): datos y colores del boleto diseñado, y un PDF que lleva cada
// boleto como imagen JPEG (dibujado en el navegador). Funciones puras: ticket-design.test.ts.
// Sin librerías nuevas y sin Buffer (corre en el navegador).

import { isLight, type ProductionTheme } from "./themes";

export type BoletoVista = {
  id: string;
  obra: string;
  funcion: string;
  lugar: string | null;
  asiento: string;
  orden: string;
  comprador: string;
  /** QR como imagen (data URL); null si la función ya pasó. */
  qr: string | null;
  usado: boolean;
};

export type EstiloBoleto = { fondo: string; superficie: string; texto: string; acento: string; logo: string | null };

/** Colores de DARF para obras sin kit completo. */
export const ESTILO_DARF: EstiloBoleto = { fondo: "#0b0910", superficie: "#17121f", texto: "#ffffff", acento: "#a48bff", logo: null }; // Kit de marca: Sala, Telón, Lila

export function estiloDe(t: ProductionTheme | null): EstiloBoleto {
  return t ? { fondo: t.fondo, superficie: t.superficie, texto: t.texto, acento: t.acento, logo: t.logo } : ESTILO_DARF;
}

/** Texto legible encima de un color (negro o blanco). */
export function textoSobre(color: string): string {
  return isLight(color) ? "#0b0910" : "#ffffff";
}

/** "Boleto 2 de 5". */
export function contador(i: number, total: number): string {
  return `Boleto ${i + 1} de ${total}`;
}

/** Siguiente índice con flechas (sin dar la vuelta). */
export function mover(i: number, delta: number, total: number): number {
  return Math.max(0, Math.min(total - 1, i + delta));
}

export function nombreArchivo(orden: string): string {
  return `DARF-${orden.replace(/[^A-Za-z0-9-]/g, "")}.pdf`;
}

const enc = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);

function unir(partes: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
  let k = 0;
  for (const p of partes) { out.set(p, k); k += p.length; }
  return out;
}

export type JpegPagina = { data: Uint8Array; w: number; h: number };

/**
 * PDF 1.4 con una página por imagen JPEG (DCTDecode) que la llena completa.
 * `pageW`/`pageH` en puntos (72 por pulgada).
 */
export function pdfConImagenes(imgs: JpegPagina[], pageW: number, pageH: number): Uint8Array {
  const objs: Uint8Array[] = [];
  const add = (o: Uint8Array) => { objs.push(o); return objs.length; };
  const catalog = add(new Uint8Array());
  const pages = add(new Uint8Array());
  const kids: number[] = [];
  for (const img of imgs) {
    const im = add(unir([
      enc(`<< /Type /XObject /Subtype /Image /Width ${img.w} /Height ${img.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.data.length} >>\nstream\n`),
      img.data,
      enc("\nendstream"),
    ]));
    const contenido = `q ${pageW} 0 0 ${pageH} 0 0 cm /Im0 Do Q`;
    const c = add(enc(`<< /Length ${contenido.length} >>\nstream\n${contenido}\nendstream`));
    kids.push(add(enc(`<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 ${im} 0 R >> >> /Contents ${c} 0 R >>`)));
  }
  objs[catalog - 1] = enc(`<< /Type /Catalog /Pages ${pages} 0 R >>`);
  objs[pages - 1] = enc(`<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`);

  const partes: Uint8Array[] = [enc("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")];
  let pos = partes[0].length;
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(pos);
    const p = unir([enc(`${i + 1} 0 obj\n`), o, enc("\nendobj\n")]);
    partes.push(p);
    pos += p.length;
  });
  let tail = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) tail += `${String(off).padStart(10, "0")} 00000 n \n`;
  tail += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${pos}\n%%EOF\n`;
  partes.push(enc(tail));
  return unir(partes);
}
