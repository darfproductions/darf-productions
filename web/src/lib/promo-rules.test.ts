import { describe, expect, it } from "vitest";
import { conPromo, mejorPromo, pctZona } from "./promo-rules";

describe("promos", () => {
  it("aplica el % con el mismo redondeo que la base", () => {
    expect(conPromo(300, 20)).toBe(240);
    expect(conPromo(199.99, 15)).toBe(169.99);
    expect(conPromo(350, 0)).toBe(350);
    expect(conPromo(100, 100)).toBe(0);
  });
  it("elige la promo mayor y el % por zona", () => {
    const l = [{ zona: "a", percent: 10, nombre: "Chica", hasta: null }, { zona: "b", percent: 25, nombre: "Grande", hasta: null }];
    expect(mejorPromo(l)?.nombre).toBe("Grande");
    expect(mejorPromo([])).toBeNull();
    expect(pctZona(l, "a")).toBe(10);
    expect(pctZona(l, "z")).toBe(0);
  });
});
