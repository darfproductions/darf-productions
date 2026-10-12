import { describe, expect, it } from "vitest";
import { contador, ESTILO_DARF, estiloDe, logoDarf, mover, nombreArchivo, pdfConImagenes, textoSobre } from "./ticket-design";

describe("boleto diseñado", () => {
  it("usa los colores de la obra o los de DARF", () => {
    expect(estiloDe(null)).toBe(ESTILO_DARF);
    const t = { fondo: "#ffffff", superficie: "#eeeeee", texto: "#111111", acento: "#ff0000", logo: "/l.png", ambiente: "/a.jpg", tagline: "" };
    expect(estiloDe(t)).toMatchObject({ fondo: "#ffffff", logo: "/l.png" });
    expect(textoSobre("#ffffff")).toBe("#0b0910");
    expect(textoSobre("#0b0910")).toBe("#ffffff");
  });
  it("flechas sin salirse", () => {
    expect(mover(0, -1, 3)).toBe(0);
    expect(mover(1, 1, 3)).toBe(2);
    expect(mover(2, 1, 3)).toBe(2);
    expect(contador(1, 3)).toBe("Boleto 2 de 3");
    expect(nombreArchivo("AB-12/x")).toBe("DARF-AB-12x.pdf");
  });
});

describe("PDF con imágenes", () => {
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
  const pdf = pdfConImagenes([{ data: jpeg, w: 10, h: 20 }, { data: jpeg, w: 10, h: 20 }], 360, 640);
  const s = String.fromCharCode(...pdf);
  it("estructura válida: páginas, imagen JPEG y tabla xref con posiciones exactas", () => {
    expect(s.startsWith("%PDF-1.4")).toBe(true);
    expect(s).toContain("/Count 2");
    expect(s.match(/\/Filter \/DCTDecode/g)).toHaveLength(2);
    expect(s).toContain("/MediaBox [0 0 360 640]");
    const xref = Number(s.match(/startxref\n(\d+)/)![1]);
    expect(s.slice(xref, xref + 4)).toBe("xref");
    const offs = [...s.slice(xref).matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]));
    offs.forEach((o, i) => expect(s.slice(o, o + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
    // los bytes del JPEG van intactos
    expect(s).toContain(String.fromCharCode(...jpeg));
  });
});

describe("logoDarf", () => {
  it("versión clara u oscura según el fondo", () => {
    expect(logoDarf("#f8f7f5")).toBe("/marca/darf-principal-claro.svg");
    expect(logoDarf("#0b0910")).toBe("/marca/darf-principal.svg");
  });
});
