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
    const p = paseGafete({ nombre: "Diego", fotoUrl: null, franja: "casa", papel: "CEO", casaDesde: 2019 }, new Date("2027-01-01T03:00:00Z"));
    expect(p.titulo).toBe("CEO");
    expect(p.pie).toBe("DARF Productions · 2026"); // 31 de diciembre en CDMX
    expect(p.banda.label).toBe("CASA DARF");
    expect(p.casa).toBe("Casa DARF · desde 2019");
    expect(paseGafete({ nombre: "Ana", fotoUrl: null, franja: "casa", papel: "CEO" }).banda.degradado?.length).toBe(5);
    expect(paseGafete({ nombre: "Ana", fotoUrl: null, franja: "crew", papel: "Elenco" }).casa).toBeUndefined();
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
  it("plata con degradado y letra oscura", () => {
    expect(FRANJAS.direccion_general.label).toBe("DIRECCIÓN GENERAL");
    const p = paseGafete({ nombre: "Diego", fotoUrl: null, franja: "direccion_general", papel: "Dirección general" });
    expect(p.banda.fondo).toContain("linear-gradient");
    expect(p.banda.degradado?.[0]).toEqual([0, "#8e959e"]);
    expect(p.banda.texto).toBe("#0b0910");
  });
});

describe("sellos del gafete (0102)", () => {
  it("Casa DARF y Club Fan van los dos, en ese orden", async () => {
    const { sellosDe } = await import("./gafete-rules");
    expect(sellosDe({ tema: "darf", casa: "Casa DARF · desde 2023", sello: "Socio #0001" }).map((s) => s.alt)).toEqual(["Socio del Club Fan", "Casa DARF"]);
    expect(sellosDe({ tema: "darf", casa: "Casa DARF · desde 2023" }).length).toBe(1);
    expect(sellosDe({ tema: "fan" }).map((s) => s.alt)).toEqual(["Socio del Club Fan"]);
    expect(sellosDe({ tema: "darf" })).toEqual([]);
  });
});
