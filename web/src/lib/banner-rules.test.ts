import { describe, expect, it } from "vitest";
import { avisosVigentes, enlaceValido, textoSobre, type BannerItem } from "./banner-rules";

const item = (inicia: string | null, termina: string | null): BannerItem => ({ texto: "x", enlace: null, boton: null, inicia, termina });

describe("avisosVigentes", () => {
  const ahora = new Date("2026-10-12T12:00:00-06:00");
  it("muestra los que no tienen fechas", () => {
    expect(avisosVigentes([item(null, null)], ahora)).toHaveLength(1);
  });
  it("respeta inicio y fin", () => {
    expect(avisosVigentes([item("2026-10-13T00:00:00-06:00", null)], ahora)).toHaveLength(0);
    expect(avisosVigentes([item(null, "2026-10-12T11:00:00-06:00")], ahora)).toHaveLength(0);
    expect(avisosVigentes([item("2026-10-12T12:00:00-06:00", "2026-10-20T00:00:00-06:00")], ahora)).toHaveLength(1);
    expect(avisosVigentes([item(null, "2026-10-12T12:00:00-06:00")], ahora)).toHaveLength(0);
  });
});

describe("enlaceValido", () => {
  it("acepta internas y https", () => {
    for (const s of ["/", "/producciones/hsm#funciones", "/audiciones", "https://instagram.com/darf"]) expect(enlaceValido(s)).toBe(true);
  });
  it("rechaza lo peligroso", () => {
    for (const s of ["//evil.com", "/\\evil.com", "javascript:alert(1)", "http://x.com", "https://a b", "evil.com"]) expect(enlaceValido(s)).toBe(false);
  });
});

describe("textoSobre", () => {
  it("elige el que se lee", () => {
    expect(textoSobre("#ffffff")).toBe("#111111");
    expect(textoSobre("#1e1828")).toBe("#ffffff");
    expect(textoSobre("#f2b544")).toBe("#111111");
  });
});
