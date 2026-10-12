import { describe, expect, it } from "vitest";
import { iniciales, ligaGafete, vcard } from "./gafete-rules";

describe("gafete", () => {
  it("iniciales y liga del QR", () => {
    expect(iniciales("Ana Paola Ruiz")).toBe("AP");
    expect(iniciales("")).toBe("D");
    expect(ligaGafete("https://darf.mx/", "abc")).toBe("https://darf.mx/g/abc");
  });
  it("vCard solo con lo compartido", () => {
    const v = vcard({ nombre: "Ana Ruiz", papel: "Elenco · Sophie", telefono: "442 111 2233", correo: null, instagram: "@ana" }, "https://darf.mx/g/x");
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
