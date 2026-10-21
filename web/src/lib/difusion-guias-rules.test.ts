import { describe, expect, it } from "vitest";
import { GUIAS, guiaValida, partesTitulo } from "./difusion-guias-rules";

describe("guías de difusión", () => {
  it("valida el tipo", () => {
    expect(guiaValida("club")?.ruta).toBe("/club-fan");
    expect(guiaValida("cuenta")?.ruta).toBe("/entrar");
    expect(guiaValida("otra")).toBeNull();
  });
  it("separa lo resaltado del título", () => {
    expect(partesTitulo("Únete al\n*Club Fan*")).toEqual([[{ texto: "Únete al", resaltado: false }], [{ texto: "Club Fan", resaltado: true }]]);
  });
  it("cada guía tiene de 3 a 5 pasos cortos", () => {
    for (const g of GUIAS) {
      expect(g.pasos.length).toBeGreaterThanOrEqual(3);
      expect(g.pasos.length).toBeLessThanOrEqual(5);
      for (const p of g.pasos) expect(p.length).toBeLessThanOrEqual(56);
    }
  });
});
