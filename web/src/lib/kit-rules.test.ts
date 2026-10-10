import { describe, expect, it } from "vitest";
import { contrastRatio } from "./kit-rules";

describe("contraste", () => {
  it("blanco sobre negro es 21:1", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 0);
  });
  it("es simétrico", () => {
    expect(contrastRatio("#13235c", "#fbfaf8")).toBeCloseTo(contrastRatio("#fbfaf8", "#13235c"), 6);
  });
  it("rechaza colores inválidos", () => {
    expect(() => contrastRatio("azul", "#fff")).toThrow();
  });
});
