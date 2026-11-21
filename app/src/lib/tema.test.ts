import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/kit-rules";
import { aHsl, ajustar, esClaro, paletaObra } from "~/lib/tema";

// Kits reales de la base (productions.color_*).
const SHOWMAN = { color_fondo: "#001233", color_superficie: "#1a3260", color_texto: "#fff2d6", color_acento: "#f0c347" };
const MAMMA_MIA = { color_fondo: "#f8f7f5", color_superficie: "#ffffff", color_texto: "#13235c", color_acento: "#c2255c" };
const GREASE = { color_fondo: "#000000", color_superficie: "#740202", color_texto: "#faf7fd", color_acento: "#ffd0a3" };

describe("paletaObra", () => {
  it("usa el kit tal cual en su propio modo", () => {
    const p = paletaObra(SHOWMAN, "noche")!;
    expect(p.fondo).toBe("#001233");
    expect(p.acento).toBe("#f0c347");
  });

  it("en modo día aclara el fondo de una obra oscura conservando su tono", () => {
    const p = paletaObra(SHOWMAN, "dia")!;
    expect(esClaro(p.fondo)).toBe(true);
    expect(Math.abs(aHsl(p.fondo).h - aHsl(SHOWMAN.color_fondo).h)).toBeLessThan(6);
    expect(p.texto).toBe("#001233");
  });

  it("en modo noche oscurece una obra clara con el tono de su tinta", () => {
    const p = paletaObra(MAMMA_MIA, "noche")!;
    expect(esClaro(p.fondo)).toBe(false);
    expect(Math.abs(aHsl(p.fondo).h - aHsl(MAMMA_MIA.color_texto).h)).toBeLessThan(6);
  });

  it.each([
    ["Showman", SHOWMAN], ["Mamma Mia!", MAMMA_MIA], ["Grease (fondo negro, sin tono)", GREASE],
  ])("%s: todo se lee en ambos modos", (_n, kit) => {
    for (const modo of ["noche", "dia"] as const) {
      const p = paletaObra(kit, modo)!;
      expect(contrastRatio(p.texto, p.fondo)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(p.texto, p.superficie)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(p.suave, p.fondo)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(p.acento, p.fondo)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(p.sobreAcento, p.acento)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(p.sobreBoton, p.boton)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("en modo día el botón de Showman sigue dorado", () => {
    expect(paletaObra(SHOWMAN, "dia")!.boton).toBe("#f0c347");
  });

  it("una obra de fondo negro toma el tono de su superficie en modo día", () => {
    const p = paletaObra(GREASE, "dia")!;
    expect(aHsl(p.fondo).s).toBeGreaterThan(0.2);
    expect(Math.abs(aHsl(p.fondo).h - aHsl(GREASE.color_superficie).h)).toBeLessThan(6);
  });

  it("devuelve null con el kit incompleto", () => {
    expect(paletaObra({ ...SHOWMAN, color_acento: null }, "dia")).toBeNull();
  });
});

describe("ajustar", () => {
  it("no toca un color que ya contrasta", () => {
    expect(ajustar("#ffffff", "#000000", 4.5)).toBe("#ffffff");
  });
  it("oscurece un dorado sobre fondo claro hasta 4.5:1", () => {
    expect(contrastRatio(ajustar("#f0c347", "#ffffff", 4.5), "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });
});
