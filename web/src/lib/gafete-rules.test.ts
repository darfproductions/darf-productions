import { describe, expect, it } from "vitest";
import { FRANJAS, iniciales, ligaGafete, paseGafete, vcard } from "./gafete-rules";

describe("gafete", () => {
  it("iniciales y liga del QR", () => {
    expect(iniciales("Ana Paola Ruiz")).toBe("AP");
    expect(iniciales("")).toBe("D");
    expect(ligaGafete("https://darf.mx/", "abc")).toBe("https://darf.mx/g/abc");
  });
  it("vCard solo con lo compartido", () => {
    const v = vcard({ nombre: "Ana Ruiz", papel: "Elenco", telefono: "442 111 2233", correo: null, instagram: "@ana" }, "https://darf.mx/g/x");
    expect(v).toContain("FN:Ana Ruiz");
    expect(v).toContain("N:Ruiz;Ana;;;");
    expect(v).toContain("TEL;TYPE=CELL:4421112233");
    expect(v).not.toContain("EMAIL");
    expect(v).toContain("instagram.com/ana");
    expect(v.endsWith("END:VCARD\r\n")).toBe(true);
  });
  it("escapa comas y punto y coma", () => {
    expect(vcard({ nombre: "Ana", papel: "Dirección, vocal; coro", telefono: null, correo: null, instagram: null }, null)).toContain("TITLE:Dirección\\, vocal\; coro");
  });
});

describe("gafete con jerarquía y credencial del Club Fan (0080)", () => {
  it("el gafete ya no dice la obra: abajo va DARF Productions y el año de CDMX", async () => {
    const { paseGafete } = await import("./gafete-rules");
    const p = paseGafete({ nombre: "Diego", fotoUrl: null, franja: "manager", papel: "CEO" }, new Date("2027-01-01T03:00:00Z"));
    expect(p.titulo).toBe("CEO");
    expect(p.pie).toBe("DARF Productions · 2026"); // 31 de diciembre en CDMX
    expect(p.banda.label).toBe("MANAGER");
    expect(paseGafete({ nombre: "Ana", fotoUrl: null, franja: "manager", papel: "CEO" }).banda.degradado?.length).toBe(3);
  });
  it("credencial del Club Fan: número, fundador, año de alta y liga /f/", async () => {
    const { paseCredencialFan, ligaCredencial } = await import("./credencial-fan-rules");
    const p = paseCredencialFan({ nombre: "Fer", fotoUrl: null, numero: 12, fundador: true, desde: "2026-10-12T18:00:00Z" });
    expect(p.titulo).toBe("Socio #0012 · Fan fundador");
    expect(p.pie).toBe("Club Fan · desde 2026");
    expect(p.tema).toBe("fan");
    expect(ligaCredencial("https://darf.mx/", "t0k")).toBe("https://darf.mx/f/t0k");
  });
});

describe("franja Dirección general (0101)", () => {
  it("tiene su propio color y etiqueta", () => {
    expect(FRANJAS.direccion_general.label).toBe("DIRECCIÓN GENERAL");
    const p = paseGafete({ nombre: "Diego", fotoUrl: null, franja: "direccion_general", papel: "Dirección general" });
    expect(p.banda.fondo).toBe("#830886");
    expect(p.banda.degradado).toBeUndefined();
  });
});
