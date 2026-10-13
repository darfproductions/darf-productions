import { describe, expect, it } from "vitest";
import { pdfText, ticketsPdf, wrap } from "./pdf-ticket";

const t = { obra: "Mamma Mia! (Edición 2026)", funcion: "sábado 12 de octubre, 8:00 p.m.", lugar: "Teatro", asiento: "Preferente-J12", orden: "DARF-1", comprador: "Ana Pérez", qr: "6f1c2a7e-0000-4000-8000-000000000001" };

describe("boleto en PDF", () => {
  it("escapa texto y quita lo que no cabe en WinAnsi", () => {
    expect(pdfText("Mamma (Mia)\\")).toBe("Mamma \\(Mia\\)\\\\");
    expect(pdfText("Función — ñ 🎭")).toBe("Función - ñ ");
  });
  it("corta líneas", () => {
    expect(wrap("uno dos tres cuatro", 8)).toEqual(["uno dos", "tres", "cuatro"]);
  });
  it("una página por boleto y tabla xref correcta", () => {
    const pdf = Buffer.from(ticketsPdf([t, { ...t, asiento: "J13" }]));
    const s = pdf.toString("latin1");
    expect(s.startsWith("%PDF-1.4")).toBe(true);
    expect(s.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(s).toContain("/Count 2");
    const startxref = Number(s.match(/startxref\n(\d+)/)![1]);
    expect(s.slice(startxref, startxref + 4)).toBe("xref");
    const entries = [...s.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    entries.forEach((off, i) => expect(s.slice(off, off + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
    // los acentos van en Latin-1 (un byte), no en UTF-8
    expect(pdf.includes(Buffer.from("sábado", "latin1"))).toBe(true);
    expect(pdf.includes(Buffer.from("sábado", "utf8"))).toBe(false);
  });
});
